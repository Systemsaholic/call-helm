/**
 * Telnyx SMS Inbound Webhook Handler
 *
 * Handles incoming SMS/MMS messages from Telnyx.
 * Event type: message.received
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { smsLogger } from '@/lib/logger'

interface TelnyxInboundMessagePayload {
  id: string
  direction: 'inbound'
  type: 'SMS' | 'MMS'
  messaging_profile_id: string
  from: {
    phone_number: string
    carrier?: string
    line_type?: string
  }
  to: {
    phone_number: string
    carrier?: string
    line_type?: string
  }[]
  text: string
  media?: {
    url: string
    content_type: string
    size?: number
  }[]
  received_at: string
  valid_until: string
}

interface TelnyxWebhookBody {
  data: {
    event_type: 'message.received'
    id: string
    occurred_at: string
    payload: TelnyxInboundMessagePayload
    record_type: string
  }
  meta?: {
    attempt: number
    delivered_to: string
  }
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
    const body: TelnyxWebhookBody = await request.json()
    const { data } = body
    const { payload } = data

    const fromNumber = payload.from.phone_number
    const toNumber = payload.to[0]?.phone_number
    const messageBody = payload.text || ''
    const telnyxMessageId = payload.id

    smsLogger.info('Telnyx SMS inbound message', {
      data: { id: telnyxMessageId, from: fromNumber, to: toNumber, type: payload.type, bodyLength: messageBody.length }
    })

    if (!fromNumber || !toNumber) {
      smsLogger.error('Missing from/to numbers')
      return NextResponse.json({ received: true, error: 'Missing phone numbers' })
    }

    // Collect media URLs if present
    const mediaUrls: string[] = payload.media?.map(m => m.url) || []

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
      return NextResponse.json({ received: true, error: 'Organization not found' })
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
        return NextResponse.json({ received: true, error: 'Failed to create conversation' })
      }

      conversation = newConversation
    } else {
      // Update existing conversation
      const updateData: Record<string, unknown> = {
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
        telnyx_message_id: telnyxMessageId,
        status: 'delivered',
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (messageError) {
      smsLogger.error('Error storing message', { error: messageError })
      return NextResponse.json({ received: true, error: 'Failed to store message' })
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

        const businessHours = autoReply.business_hours as { start?: number; end?: number; weekdaysOnly?: boolean }
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

    // Handle broadcast reply tracking
    await handleBroadcastReply(supabase, organizationId, fromNumber, messageBody, payload.received_at)

    // Return 200 to acknowledge receipt
    return NextResponse.json({ received: true })

  } catch (error) {
    smsLogger.error('Telnyx SMS receive error', { error })
    return NextResponse.json({ received: true, error: 'Processing error' })
  }
}

/**
 * Check if this message is a reply to a broadcast and update stats
 */
async function handleBroadcastReply(
  supabase: SupabaseClient,
  organizationId: string,
  fromPhone: string,
  messageText: string,
  receivedAt: string
) {
  // Find any recent broadcasts sent to this phone number
  const { data: broadcastRecipient } = await supabase
    .from('sms_broadcast_recipients')
    .select('id, broadcast_id')
    .eq('phone_number', fromPhone)
    .eq('status', 'sent')
    .gte('sent_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (broadcastRecipient) {
    // Update recipient with reply info
    await supabase
      .from('sms_broadcast_recipients')
      .update({
        status: 'replied',
        skip_reason: messageText.substring(0, 500) // Store reply text in skip_reason for now
      })
      .eq('id', broadcastRecipient.id)

    smsLogger.info('Broadcast reply recorded', { data: { broadcastId: broadcastRecipient.broadcast_id } })
  }
}

// Telnyx may send HEAD requests to verify webhook
export async function HEAD() {
  return new Response(null, { status: 200 })
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'telnyx-sms-receive',
    description: 'Telnyx inbound SMS webhook handler'
  })
}
