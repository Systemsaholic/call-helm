import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TelnyxService } from '@/lib/services/telnyx'
import { smsLogger } from '@/lib/logger'

// Initialize Telnyx service
const telnyx = new TelnyxService()

interface SendSMSRequest {
  to: string
  message: string
  mediaUrls?: string[]
  conversationId?: string
  contactId?: string
  templateId?: string
  templateVariables?: Record<string, string>
}

// Format phone number to E.164 format
function formatPhoneNumber(phone: string): string {
  // Remove all non-numeric characters
  const cleaned = phone.replace(/\D/g, '')
  
  // Add +1 if not present (assuming North American numbers)
  if (cleaned.length === 10) {
    return `+1${cleaned}`
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`
  }
  
  // If already in correct format or international
  return cleaned.startsWith('+') ? phone : `+${cleaned}`
}

// Check for opt-out keywords
function isOptOutKeyword(message: string): boolean {
  const optOutKeywords = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'STOPALL']
  const normalizedMessage = message.trim().toUpperCase()
  return optOutKeywords.includes(normalizedMessage)
}

// Check for opt-in keywords
function isOptInKeyword(message: string): boolean {
  const optInKeywords = ['START', 'YES', 'SUBSCRIBE', 'OPTIN', 'JOIN']
  const normalizedMessage = message.trim().toUpperCase()
  return optInKeywords.includes(normalizedMessage)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    
    // Get user's organization and member info
    const { data: member, error: memberError } = await supabase
      .from('organization_members')
      .select('id, organization_id, full_name')
      .eq('user_id', user.id)
      .single()
    
    if (memberError || !member) {
      return NextResponse.json({ error: 'Organization member not found' }, { status: 404 })
    }
    
    const body: SendSMSRequest = await request.json()
    const { to, message, mediaUrls, conversationId, contactId, templateId, templateVariables } = body
    
    if (!to || (!message && !templateId)) {
      return NextResponse.json({ 
        error: 'Missing required fields: to and message (or templateId)' 
      }, { status: 400 })
    }
    
    // Process template if provided
    let finalMessage = message
    if (templateId) {
      const { data: template } = await supabase
        .from('sms_templates')
        .select('message_body, variables, usage_count')
        .eq('id', templateId)
        .eq('organization_id', member.organization_id)
        .single()
      
      if (template) {
        finalMessage = template.message_body
        
        // Replace template variables
        if (template.variables && templateVariables) {
          template.variables.forEach((variable: string) => {
            const value = templateVariables[variable] || `{${variable}}`
            finalMessage = finalMessage.replace(new RegExp(`{${variable}}`, 'g'), value)
          })
        }

        // Update template usage count
        await supabase
          .from('sms_templates')
          .update({
            usage_count: (template.usage_count || 0) + 1,
            last_used_at: new Date().toISOString()
          })
          .eq('id', templateId)
      }
    }
    
    const formattedTo = formatPhoneNumber(to)
    
    // Get organization's phone number (from number)
    // Get the primary phone number or the first active one that can send SMS
    const { data: phoneNumbers, error: phoneError } = await supabase
      .from('phone_numbers')
      .select('number, status, number_type')
      .eq('organization_id', member.organization_id)
      .in('status', ['active', 'grace_period']) // Include grace_period to provide better error
      .order('is_primary', { ascending: false })
      .limit(1)

    if (phoneError || !phoneNumbers || phoneNumbers.length === 0) {
      return NextResponse.json({
        error: 'Organization phone number not configured. Please add and verify a phone number in Settings.'
      }, { status: 400 })
    }

    const phoneNumber = phoneNumbers[0]

    // Check if the phone number can send outbound messages
    if (phoneNumber.status === 'grace_period') {
      return NextResponse.json({
        error: 'Your trial has ended. Outbound messaging is disabled during the grace period. Upgrade your plan to restore full functionality.',
        code: 'GRACE_PERIOD_OUTBOUND_BLOCKED'
      }, { status: 403 })
    }

    // Check if this is a verified caller ID (voice only, no SMS)
    if (phoneNumber.number_type === 'verified_caller_id') {
      return NextResponse.json({
        error: 'This phone number is verified for outbound caller ID only. It cannot send SMS messages. Purchase or port a number to enable SMS.',
        code: 'VERIFIED_CALLER_ID_NO_SMS'
      }, { status: 403 })
    }

    const fromNumber = phoneNumber.number
    
    // Check if contact is opted out
    let conversationData: { id: string; is_opted_out: boolean } | null = null
    
    if (conversationId) {
      const { data } = await supabase
        .from('sms_conversations')
        .select('id, is_opted_out')
        .eq('id', conversationId)
        .single()
      conversationData = data
    }
    
    if (!conversationData) {
      // Try to find existing conversation by phone number
      const { data: convByPhone } = await supabase
        .from('sms_conversations')
        .select('id, is_opted_out')
        .eq('organization_id', member.organization_id)
        .eq('phone_number', formattedTo)
        .single()
      
      conversationData = convByPhone
    }
    
    if (conversationData?.is_opted_out) {
      // Check if this is an opt-in message
      if (!isOptInKeyword(finalMessage)) {
        return NextResponse.json({ 
          error: 'Contact has opted out of SMS messages' 
        }, { status: 400 })
      }
    }
    
    // Create or update conversation
    let finalConversationId = conversationId
    if (!finalConversationId) {
      if (conversationData) {
        finalConversationId = conversationData.id
      } else {
        // Create new conversation
        const { data: newConversation, error: convError } = await supabase
          .from('sms_conversations')
          .insert({
            organization_id: member.organization_id,
            contact_id: contactId || null,
            assigned_agent_id: member.id,
            phone_number: formattedTo,
            status: 'active'
          })
          .select()
          .single()
        
        if (convError) {
          smsLogger.error('Error creating conversation', { error: convError })
          return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
        }
        
        finalConversationId = newConversation.id
      }
    }
    
    // Create message record in database (initially as queued)
    const { data: messageRecord, error: messageError } = await supabase
      .from('sms_messages')
      .insert({
        conversation_id: finalConversationId,
        organization_id: member.organization_id,
        direction: 'outbound',
        from_number: fromNumber,
        to_number: formattedTo,
        message_body: finalMessage,
        media_urls: mediaUrls || [],
        sent_by_agent_id: member.id,
        status: 'queued'
      })
      .select()
      .single()
    
    if (messageError) {
      smsLogger.error('Error creating message record', { error: messageError })
      return NextResponse.json({ error: 'Failed to create message record' }, { status: 500 })
    }
    
    // Send SMS via Telnyx
    try {
      const webhookUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''

      smsLogger.debug('Telnyx SMS Request', {
        data: { from: fromNumber, to: formattedTo, messageLength: finalMessage.length, hasMedia: mediaUrls && mediaUrls.length > 0 }
      })

      const telnyxResponse = await telnyx.sendMessage({
        from: fromNumber,
        to: formattedTo,
        text: finalMessage,
        mediaUrls: mediaUrls,
        webhookUrl: webhookUrl ? `${webhookUrl}/api/sms/telnyx/status` : undefined
      })

      smsLogger.info('Telnyx SMS sent successfully', {
        data: { id: telnyxResponse.id, status: telnyxResponse.status, to: telnyxResponse.to, from: telnyxResponse.from, segments: telnyxResponse.parts }
      })

      // Update message record with Telnyx message ID
      await supabase
        .from('sms_messages')
        .update({
          telnyx_message_id: telnyxResponse.id,
          status: 'sent',
          sent_at: new Date().toISOString(),
          segments: telnyxResponse.parts || 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', messageRecord.id)

      // Update conversation last message time
      await supabase
        .from('sms_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', finalConversationId)

      // Check if message contains opt-out keyword
      if (isOptOutKeyword(finalMessage)) {
        await supabase
          .from('sms_conversations')
          .update({
            is_opted_out: true,
            opted_out_at: new Date().toISOString()
          })
          .eq('id', finalConversationId)
      }

      // Trigger async analysis
      if (webhookUrl) {
        fetch(`${webhookUrl}/api/sms/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: messageRecord.id,
            conversationId: finalConversationId
          })
        }).catch(err => smsLogger.error('Failed to trigger SMS analysis', { error: err }))
      }

      return NextResponse.json({
        success: true,
        messageId: messageRecord.id,
        conversationId: finalConversationId,
        telnyxMessageId: telnyxResponse.id,
        status: 'sent',
        segments: telnyxResponse.parts || 1
      })

    } catch (error) {
      smsLogger.error('Error sending SMS', { error })

      // Update message status to failed
      await supabase
        .from('sms_messages')
        .update({
          status: 'failed',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          updated_at: new Date().toISOString()
        })
        .eq('id', messageRecord.id)

      return NextResponse.json({
        error: 'Failed to send SMS',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 })
    }
    
  } catch (error) {
    smsLogger.error('SMS send error', { error })
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// GET endpoint for testing
export async function GET() {
  const configStatus = TelnyxService.getConfigurationStatus()
  return NextResponse.json({
    status: 'ok',
    message: 'SMS send endpoint',
    provider: 'Telnyx',
    configured: configStatus.apiKey && configStatus.messagingProfileId
  })
}