import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { smsLogger } from '@/lib/logger'

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
  return phone.startsWith('+') ? phone : `+${phone}`
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

// SignalWire incoming SMS webhook handler
export async function POST(request: NextRequest) {
  try {
    smsLogger.info('Incoming SMS webhook received')

    // Parse form-encoded data from SignalWire
    const formData = await request.formData()
    const data: Record<string, string> = {}
    formData.forEach((value, key) => {
      data[key] = String(value)
    })

    smsLogger.debug('Incoming SMS', {
      data: {
        from: data.From,
        to: data.To,
        body: data.Body,
        messageSid: data.MessageSid,
        numMedia: data.NumMedia
      }
    })
    
    const fromNumber = formatPhoneNumber(data.From || '')
    const toNumber = formatPhoneNumber(data.To || '')
    const messageBody = data.Body || ''
    const messageSid = data.MessageSid
    const numMedia = parseInt(data.NumMedia || '0')
    
    // Collect media URLs if present
    const mediaUrls: string[] = []
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = data[`MediaUrl${i}`]
      if (mediaUrl) {
        mediaUrls.push(mediaUrl)
      }
    }
    
    if (!fromNumber || !toNumber) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    // Use service role client to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Get organization ID from URL parameter first (preferred method)
    const url = new URL(request.url)
    const orgIdFromUrl = url.searchParams.get('org')

    let organizationId: string | null = null

    if (orgIdFromUrl) {
      // Verify the org exists and has this phone number
      const { data: phoneData } = await supabase
        .from('phone_numbers')
        .select('organization_id')
        .eq('number', toNumber)
        .eq('organization_id', orgIdFromUrl)
        .eq('status', 'active')
        .maybeSingle()

      if (phoneData) {
        organizationId = phoneData.organization_id
      }
    }

    // Second: check for existing conversation with this sender (for broadcast replies)
    if (!organizationId) {
      const { data: existingConversation } = await supabase
        .from('sms_conversations')
        .select('organization_id')
        .eq('phone_number', fromNumber)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (existingConversation) {
        // Verify this org has the phone number
        const { data: phoneData } = await supabase
          .from('phone_numbers')
          .select('organization_id')
          .eq('number', toNumber)
          .eq('organization_id', existingConversation.organization_id)
          .eq('status', 'active')
          .maybeSingle()

        if (phoneData) {
          organizationId = phoneData.organization_id
          smsLogger.debug('Routed reply to org via existing conversation', { data: { organizationId } })
        }
      }
    }

    // Fallback: look up organization by phone number (first match)
    if (!organizationId) {
      const { data: phoneData } = await supabase
        .from('phone_numbers')
        .select('organization_id')
        .eq('number', toNumber)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()

      if (phoneData) {
        organizationId = phoneData.organization_id
      }
    }

    if (!organizationId) {
      smsLogger.error('No organization found for phone number', { data: { toNumber } })
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    smsLogger.info('Incoming SMS routed to organization', { data: { organizationId } })
    
    // Check if conversation exists
    let { data: conversation } = await supabase
      .from('sms_conversations')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('phone_number', fromNumber)
      .single()
    
    // Check for opt-out/opt-in keywords
    const isOptOut = isOptOutKeyword(messageBody)
    const isOptIn = isOptInKeyword(messageBody)
    
    if (!conversation) {
      // Create new conversation
      const { data: newConversation, error: convError } = await supabase
        .from('sms_conversations')
        .insert({
          organization_id: organizationId,
          phone_number: fromNumber,
          status: 'active',
          unread_count: 1,
          is_opted_out: false,
          last_message_at: new Date().toISOString()
        })
        .select()
        .single()
      
      if (convError) {
        smsLogger.error('Error creating conversation', { error: convError })
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
      }
      
      conversation = newConversation
    } else {
      // Update existing conversation
      const updateData: Record<string, string | number | boolean | null> = {
        last_message_at: new Date().toISOString(),
        unread_count: (conversation.unread_count || 0) + 1
      }
      
      if (isOptOut) {
        updateData.is_opted_out = true
        updateData.opted_out_at = new Date().toISOString()
      } else if (isOptIn && conversation.is_opted_out) {
        updateData.is_opted_out = false
        updateData.opted_out_at = null
      }
      
      const { error: updateError } = await supabase
        .from('sms_conversations')
        .update(updateData)
        .eq('id', conversation.id)
      
      if (updateError) {
        smsLogger.error('Error updating conversation', { error: updateError })
      }
    }
    
    // Store the incoming message
    const { data: messageRecord, error: messageError } = await supabase
      .from('sms_messages')
      .insert({
        conversation_id: conversation.id,
        organization_id: organizationId,
        direction: 'inbound',
        from_number: fromNumber,
        to_number: toNumber,
        message_body: messageBody,
        media_urls: mediaUrls,
        signalwire_message_sid: messageSid,
        status: 'delivered',
        created_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (messageError) {
      smsLogger.error('Error storing message', { error: messageError })
      return NextResponse.json({ error: 'Failed to store message' }, { status: 500 })
    }

    smsLogger.info('Incoming SMS stored', { data: { messageId: messageRecord.id } })
    
    // Check for auto-reply settings
    const { data: autoReply } = await supabase
      .from('sms_auto_replies')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .single()
    
    // Send auto-reply if configured
    if (autoReply && !conversation.is_opted_out) {
      // Check business hours if configured
      let shouldSendReply = true
      
      if (autoReply.business_hours_only && autoReply.business_hours) {
        const now = new Date()
        const currentHour = now.getHours()
        const currentDay = now.getDay() // 0 = Sunday, 6 = Saturday
        
        const businessHours = autoReply.business_hours as any
        const isWeekday = currentDay >= 1 && currentDay <= 5
        const isBusinessHours = currentHour >= (businessHours.start || 9) && 
                                currentHour < (businessHours.end || 17)
        const isBusinessDay = businessHours.weekdaysOnly ? isWeekday : true
        
        shouldSendReply = isBusinessHours && isBusinessDay
      }
      
      if (shouldSendReply) {
        // Send auto-reply via our SMS send endpoint
        const webhookUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''
        if (webhookUrl) {
          fetch(`${webhookUrl}/api/sms/send`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // Add internal auth header if needed
            },
            body: JSON.stringify({
              to: fromNumber,
              message: autoReply.message_template,
              conversationId: conversation.id
            })
          }).catch(err => smsLogger.error('Failed to send auto-reply', { error: err }))
        }
      }
    }
    
    // Trigger AI analysis for the incoming message
    const webhookUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''
    if (webhookUrl) {
      fetch(`${webhookUrl}/api/sms/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageId: messageRecord.id,
          conversationId: conversation.id
        })
      }).catch(err => smsLogger.error('Failed to trigger SMS analysis', { error: err }))
    }
    
    // Return empty response to SignalWire
    return new Response(null, { status: 204 })
    
  } catch (error) {
    smsLogger.error('Incoming SMS webhook error', { error })
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// SignalWire may send HEAD requests to verify webhook
export async function HEAD() {
  return new Response(null, { status: 200 })
}

// SignalWire may send GET requests to verify webhook
export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    message: 'SMS receive webhook endpoint' 
  })
}