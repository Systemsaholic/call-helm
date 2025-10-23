import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client with service role for webhook
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Format phone number to E.164 format
function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10) {
    return `+1${cleaned}`
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`
  }
  return cleaned.startsWith('+') ? phone : `+${cleaned}`
}

// Check for opt-out keywords
function checkOptOutKeyword(message: string): boolean {
  const optOutKeywords = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'STOPALL', 'STOP ALL']
  const normalizedMessage = message.trim().toUpperCase().replace(/[^\w\s]/g, '')
  return optOutKeywords.some(keyword => normalizedMessage === keyword || normalizedMessage.startsWith(keyword + ' '))
}

// Check for opt-in keywords
function checkOptInKeyword(message: string): boolean {
  const optInKeywords = ['START', 'YES', 'SUBSCRIBE', 'OPTIN', 'JOIN', 'UNSTOP']
  const normalizedMessage = message.trim().toUpperCase().replace(/[^\w\s]/g, '')
  return optInKeywords.some(keyword => normalizedMessage === keyword)
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== SMS WEBHOOK RECEIVED ===')
    
    // Parse form data from SignalWire
    const formData = await request.formData()
    
    // Extract SMS details
    const messageSid = formData.get('MessageSid') as string
    const from = formatPhoneNumber(formData.get('From') as string)
    const to = formatPhoneNumber(formData.get('To') as string)
    const body = formData.get('Body') as string
    const numMedia = parseInt(formData.get('NumMedia') as string || '0')
    const status = formData.get('SmsStatus') as string || 'received'
    
    // Extract media URLs if present
    const mediaUrls: string[] = []
    for (let i = 0; i < numMedia; i++) {
      const mediaUrl = formData.get(`MediaUrl${i}`) as string
      if (mediaUrl) {
        mediaUrls.push(mediaUrl)
      }
    }
    
    console.log('SMS Details:', {
      messageSid,
      from,
      to,
      body: body.substring(0, 50) + '...',
      numMedia,
      status
    })
    
    // Find organization by phone number
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .select('id, auto_reply_enabled')
      .eq('phone_number', to)
      .single()
    
    if (orgError || !org) {
      console.error('Organization not found for phone:', to)
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }
    
    // Check if conversation exists
    const { data: existingConvData } = await supabase
      .from('sms_conversations')
      .select('*')
      .eq('organization_id', org.id)
      .eq('phone_number', from)
      .single()
    
    let conversationData = existingConvData
    
    // Handle opt-out
    if (checkOptOutKeyword(body)) {
      if (conversationData) {
        await supabase
          .from('sms_conversations')
          .update({
            is_opted_out: true,
            opted_out_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', conversationData.id)
      }
      
      // Send opt-out confirmation
      const optOutReply = "You have been unsubscribed from SMS messages. Reply START to resubscribe."
      await sendAutoReply(org.id, to, from, optOutReply)
      
      return NextResponse.json({ 
        success: true,
        action: 'opted_out'
      })
    }
    
    // Handle opt-in
    if (checkOptInKeyword(body)) {
      if (conversationData?.is_opted_out) {
        await supabase
          .from('sms_conversations')
          .update({
            is_opted_out: false,
            opted_out_at: null,
            updated_at: new Date().toISOString()
          })
          .eq('id', conversationData.id)
        
        // Send opt-in confirmation
        const optInReply = "You have been resubscribed to SMS messages. Reply STOP to unsubscribe."
        await sendAutoReply(org.id, to, from, optInReply)
        
        return NextResponse.json({ 
          success: true,
          action: 'opted_in'
        })
      }
    }
    
    // Check if contact is opted out
    if (conversationData?.is_opted_out) {
      console.log('Contact is opted out, ignoring message')
      return NextResponse.json({ 
        success: true,
        action: 'ignored_opted_out'
      })
    }
    
    // Try to match contact by phone number
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, full_name, assigned_to')
      .eq('organization_id', org.id)
      .eq('phone_normalized', from)
      .single()
    
    let assignedAgentId = contact?.assigned_to || null
    
    // Create or update conversation
    if (!conversationData) {
      // Create new conversation
      const { data: newConversation, error: convError } = await supabase
        .from('sms_conversations')
        .insert({
          organization_id: org.id,
          contact_id: contact?.id || null,
          assigned_agent_id: assignedAgentId,
          phone_number: from,
          status: 'active',
          last_message_at: new Date().toISOString(),
          unread_count: 1
        })
        .select()
        .single()
      
      if (convError) {
        console.error('Error creating conversation:', convError)
        return NextResponse.json({ error: 'Failed to create conversation' }, { status: 500 })
      }
      
      conversationData = newConversation
    } else {
      // Update existing conversation
      await supabase
        .from('sms_conversations')
        .update({
          last_message_at: new Date().toISOString(),
          unread_count: (conversationData.unread_count || 0) + 1,
          status: 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationData.id)

      assignedAgentId = conversationData.assigned_agent_id
    }
    
    // Store the message
    const { data: message, error: messageError } = await supabase
      .from('sms_messages')
      .insert({
        conversation_id: conversationData.id,
        organization_id: org.id,
        direction: 'inbound',
        from_number: from,
        to_number: to,
        message_body: body,
        media_urls: mediaUrls,
        signalwire_message_sid: messageSid,
        status: 'delivered',
        delivered_at: new Date().toISOString()
      })
      .select()
      .single()
    
    if (messageError) {
      console.error('Error storing message:', messageError)
      return NextResponse.json({ error: 'Failed to store message' }, { status: 500 })
    }
    
    // Send notifications to assigned agent
    if (assignedAgentId) {
      // In a real app, you would send push notifications, websocket events, etc.
      console.log(`Notifying agent ${assignedAgentId} of new message`)
      
      // You could also create a notification record
      await supabase
        .from('notifications')
        .insert({
          organization_id: org.id,
          user_id: assignedAgentId,
          type: 'new_sms',
          title: `New SMS from ${contact?.full_name || from}`,
          message: body.substring(0, 100),
          data: {
            conversationId: conversationData.id,
            messageId: message.id
          }
        })
        .select()
    }
    
    // Check for auto-reply rules
    if (org.auto_reply_enabled) {
      await handleAutoReplies(org.id, conversationData.id, body, from, to)
    }
    
    // Trigger async analysis
    const webhookUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''
    if (webhookUrl) {
      fetch(`${webhookUrl}/api/sms/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId: message.id,
          conversationId: conversationData.id
        })
      }).catch(err => console.error('Failed to trigger SMS analysis:', err))
    }
    
    // Return TwiML response (empty to acknowledge receipt)
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: {
          'Content-Type': 'text/xml',
        },
      }
    )
    
  } catch (error) {
    console.error('SMS webhook error:', error)
    
    // Return TwiML error response
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 500,
        headers: {
          'Content-Type': 'text/xml',
        },
      }
    )
  }
}

// Handle auto-reply rules
async function handleAutoReplies(
  organizationId: string,
  conversationId: string,
  messageBody: string,
  fromNumber: string,
  toNumber: string
) {
  try {
    // Check for keyword-based auto-replies
    const { data: keywordReplies } = await supabase
      .from('sms_auto_replies')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('trigger_type', 'keyword')
      .eq('is_active', true)
      .order('priority', { ascending: false })
    
    if (keywordReplies && keywordReplies.length > 0) {
      const normalizedMessage = messageBody.toLowerCase().trim()
      
      for (const reply of keywordReplies) {
        if (reply.trigger_value && normalizedMessage.includes(reply.trigger_value.toLowerCase())) {
          await sendAutoReply(organizationId, toNumber, fromNumber, reply.reply_message, conversationId)
          return // Only send one auto-reply
        }
      }
    }
    
    // Check for after-hours auto-reply
    const currentHour = new Date().getHours()
    const isAfterHours = currentHour < 9 || currentHour >= 17 // 9 AM - 5 PM
    
    if (isAfterHours) {
      const { data: afterHoursReply } = await supabase
        .from('sms_auto_replies')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('trigger_type', 'after_hours')
        .eq('is_active', true)
        .single()
      
      if (afterHoursReply) {
        await sendAutoReply(organizationId, toNumber, fromNumber, afterHoursReply.reply_message, conversationId)
      }
    }
    
    // Check for general auto-reply (if no other replies sent)
    const { data: generalReply } = await supabase
      .from('sms_auto_replies')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('trigger_type', 'general')
      .eq('is_active', true)
      .single()
    
    if (generalReply) {
      await sendAutoReply(organizationId, toNumber, fromNumber, generalReply.reply_message, conversationId)
    }
    
  } catch (error) {
    console.error('Auto-reply error:', error)
  }
}

// Send auto-reply message
async function sendAutoReply(
  organizationId: string,
  fromNumber: string,
  toNumber: string,
  message: string,
  conversationId?: string
) {
  try {
    // Store auto-reply message
    const { data: autoReplyMessage } = await supabase
      .from('sms_messages')
      .insert({
        conversation_id: conversationId,
        organization_id: organizationId,
        direction: 'outbound',
        from_number: fromNumber,
        to_number: toNumber,
        message_body: `[Auto-Reply] ${message}`,
        status: 'queued'
      })
      .select()
      .single()
    
    // Send via SignalWire
    const signalwireAuth = Buffer.from(
      `${process.env.SIGNALWIRE_PROJECT_ID}:${process.env.SIGNALWIRE_API_TOKEN}`
    ).toString('base64')
    
    const formData = new URLSearchParams()
    formData.append('From', fromNumber)
    formData.append('To', toNumber)
    formData.append('Body', message)
    
    const response = await fetch(
      `https://${process.env.SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${process.env.SIGNALWIRE_PROJECT_ID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${signalwireAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString()
      }
    )
    
    if (response.ok && autoReplyMessage) {
      const signalwireResponse = await response.json()
      
      // Update message status
      await supabase
        .from('sms_messages')
        .update({
          signalwire_message_sid: signalwireResponse.sid,
          status: 'sent',
          sent_at: new Date().toISOString()
        })
        .eq('id', autoReplyMessage.id)
    }
    
  } catch (error) {
    console.error('Failed to send auto-reply:', error)
  }
}

// GET endpoint for testing
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'SMS webhook endpoint',
    provider: 'SignalWire'
  })
}