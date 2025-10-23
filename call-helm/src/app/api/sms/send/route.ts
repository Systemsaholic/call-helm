import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// SignalWire API configuration
const SIGNALWIRE_SPACE_URL = process.env.SIGNALWIRE_SPACE_URL
const SIGNALWIRE_API_URL = SIGNALWIRE_SPACE_URL 
  ? `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01`
  : null

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
        .select('message_body, variables')
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
    // Get the primary phone number or the first active one
    const { data: phoneNumbers, error: phoneError } = await supabase
      .from('phone_numbers')
      .select('number')
      .eq('organization_id', member.organization_id)
      .eq('status', 'active')
      .order('is_primary', { ascending: false })
      .limit(1)
    
    if (phoneError || !phoneNumbers || phoneNumbers.length === 0) {
      return NextResponse.json({ 
        error: 'Organization phone number not configured. Please add and verify a phone number in Settings.' 
      }, { status: 400 })
    }
    
    const fromNumber = phoneNumbers[0].number
    
    // Check if contact is opted out
    let conversationData: any = null
    
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
          console.error('Error creating conversation:', convError)
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
      console.error('Error creating message record:', messageError)
      return NextResponse.json({ error: 'Failed to create message record' }, { status: 500 })
    }
    
    // Send SMS via SignalWire
    try {
      if (!SIGNALWIRE_API_URL) {
        console.error('SignalWire configuration error: SIGNALWIRE_SPACE_URL is not set')
        throw new Error('SignalWire configuration error')
      }

      const projectId = process.env.SIGNALWIRE_PROJECT_ID
      const apiToken = process.env.SIGNALWIRE_API_TOKEN

      if (!projectId || !apiToken) {
        console.error('SignalWire credentials missing')
        throw new Error('SignalWire credentials not configured')
      }

      const signalwireAuth = Buffer.from(`${projectId}:${apiToken}`).toString('base64')
      
      // Prepare form data for SignalWire
      const formData = new URLSearchParams()
      formData.append('From', fromNumber)
      formData.append('To', formattedTo)
      formData.append('Body', finalMessage)
      
      // Add media URLs if present (for MMS)
      if (mediaUrls && mediaUrls.length > 0) {
        mediaUrls.forEach(url => {
          formData.append('MediaUrl', url)
        })
      }
      
      // Add webhook for status updates
      const webhookUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''
      if (webhookUrl) {
        formData.append('StatusCallback', `${webhookUrl}/api/sms/status`)
      }

      const signalwireEndpoint = `${SIGNALWIRE_API_URL}/Accounts/${projectId}/Messages.json`
      
      console.log('SignalWire SMS Request:', {
        endpoint: signalwireEndpoint,
        from: fromNumber,
        to: formattedTo,
        messageLength: finalMessage.length,
        hasWebhook: !!webhookUrl
      })
      
      const response = await fetch(signalwireEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${signalwireAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('SignalWire API error:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        })
        
        // Try to parse error as JSON for better error message
        let errorMessage = errorText
        try {
          const errorJson = JSON.parse(errorText)
          errorMessage = errorJson.message || errorJson.error || errorText
        } catch (e) {
          // Keep original error text if not JSON
        }
        
        // Update message status to failed
        await supabase
          .from('sms_messages')
          .update({ 
            status: 'failed',
            error_message: `SignalWire Error (${response.status}): ${errorMessage}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', messageRecord.id)
        
        return NextResponse.json({ 
          error: 'Failed to send SMS',
          details: errorMessage,
          status: response.status
        }, { status: 500 })
      }
      
      const signalwireResponse = await response.json()
      
      console.log('SignalWire SMS sent successfully:', {
        sid: signalwireResponse.sid,
        status: signalwireResponse.status,
        to: signalwireResponse.to,
        from: signalwireResponse.from,
        segments: signalwireResponse.num_segments
      })
      
      // Update message record with SignalWire SID
      await supabase
        .from('sms_messages')
        .update({ 
          signalwire_message_sid: signalwireResponse.sid,
          status: 'sent',
          sent_at: new Date().toISOString(),
          segments: signalwireResponse.num_segments || 1,
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
        }).catch(err => console.error('Failed to trigger SMS analysis:', err))
      }
      
      return NextResponse.json({
        success: true,
        messageId: messageRecord.id,
        conversationId: finalConversationId,
        signalwireSid: signalwireResponse.sid,
        status: 'sent',
        segments: signalwireResponse.num_segments || 1
      })
      
    } catch (error) {
      console.error('Error sending SMS:', error)
      
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
    console.error('SMS send error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// GET endpoint for testing
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'SMS send endpoint',
    provider: 'SignalWire'
  })
}