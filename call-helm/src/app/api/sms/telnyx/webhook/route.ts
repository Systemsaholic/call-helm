/**
 * Unified Telnyx SMS Webhook Handler
 *
 * Telnyx sends ALL SMS events to the same webhook URL.
 * This handler routes based on event_type:
 * - message.received - Inbound SMS
 * - message.sent - Message sent to carrier
 * - message.finalized - Final delivery status (delivered/failed)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { smsLogger } from '@/lib/logger'

// ============================================================================
// Type Definitions
// ============================================================================

type TelnyxDeliveryStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'sending_failed'
  | 'delivery_failed'
  | 'delivery_unconfirmed'

interface TelnyxInboundPayload {
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

interface TelnyxOutboundPayload {
  id: string
  direction: 'outbound'
  type: 'SMS' | 'MMS'
  messaging_profile_id: string
  from: {
    phone_number: string
    carrier?: string
    line_type?: string
    status?: string
  }
  to: {
    phone_number: string
    carrier?: string
    line_type?: string
    status: TelnyxDeliveryStatus
  }[]
  text: string
  media?: {
    url: string
    content_type: string
  }[]
  encoding?: string
  parts?: number
  cost?: {
    amount: string
    currency: string
  }
  errors?: {
    code: string
    title: string
    detail?: string
  }[]
  received_at: string
  sent_at?: string
  completed_at?: string
  valid_until: string
}

interface TelnyxWebhookBody {
  data: {
    event_type: 'message.received' | 'message.sent' | 'message.finalized'
    id: string
    occurred_at: string
    payload: TelnyxInboundPayload | TelnyxOutboundPayload
    record_type: string
  }
  meta?: {
    attempt: number
    delivered_to: string
  }
}

// ============================================================================
// Main Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body: TelnyxWebhookBody = await request.json()
    const { data } = body
    const { event_type, payload } = data

    smsLogger.info('Telnyx SMS webhook received', {
      data: { eventType: event_type, id: payload.id, direction: payload.direction }
    })

    // Use service role client to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Route based on event type
    switch (event_type) {
      case 'message.received':
        return handleInboundMessage(request, supabase, payload as TelnyxInboundPayload)
      case 'message.sent':
      case 'message.finalized':
        return handleStatusUpdate(supabase, payload as TelnyxOutboundPayload)
      default:
        smsLogger.debug('Telnyx SMS unknown event type', { data: { eventType: event_type } })
        return NextResponse.json({ received: true })
    }
  } catch (error) {
    smsLogger.error('Telnyx SMS webhook error', { error })
    return NextResponse.json({ received: true, error: 'Processing error' })
  }
}

// ============================================================================
// Inbound Message Handler
// ============================================================================

function isOptOutKeyword(message: string): boolean {
  const optOutKeywords = ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT', 'STOPALL']
  const normalizedMessage = message.trim().toUpperCase()
  return optOutKeywords.includes(normalizedMessage)
}

function isOptInKeyword(message: string): boolean {
  const optInKeywords = ['START', 'YES', 'SUBSCRIBE', 'OPTIN', 'JOIN']
  const normalizedMessage = message.trim().toUpperCase()
  return optInKeywords.includes(normalizedMessage)
}

async function handleInboundMessage(
  request: NextRequest,
  supabase: SupabaseClient,
  payload: TelnyxInboundPayload
) {
  const fromNumber = payload.from.phone_number
  const toNumber = payload.to[0]?.phone_number
  const messageBody = payload.text || ''
  const telnyxMessageId = payload.id

  smsLogger.info('Telnyx SMS inbound message', {
    data: { id: telnyxMessageId, from: fromNumber, to: toNumber, type: payload.type, bodyLength: messageBody.length }
  })

  if (!fromNumber || !toNumber) {
    smsLogger.error('Telnyx SMS missing from/to numbers')
    return NextResponse.json({ received: true, error: 'Missing phone numbers' })
  }

  // Collect media URLs if present
  const mediaUrls: string[] = payload.media?.map(m => m.url) || []

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
        smsLogger.debug('Telnyx SMS routed reply via existing conversation', { data: { organizationId } })
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
    smsLogger.error('Telnyx SMS no organization found for phone number', { data: { toNumber } })
    return NextResponse.json({ received: true, error: 'Organization not found' })
  }

  smsLogger.info('Telnyx SMS incoming message routed to organization', { data: { organizationId } })

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
      smsLogger.error('Telnyx SMS error creating conversation', { error: convError })
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
      smsLogger.error('Telnyx SMS error updating conversation', { error: updateError })
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
    smsLogger.error('Telnyx SMS error storing message', { error: messageError })
    return NextResponse.json({ received: true, error: 'Failed to store message' })
  }

  smsLogger.debug('Telnyx SMS incoming message stored', { data: { messageId: messageRecord.id } })

  // Handle broadcast reply tracking
  await handleBroadcastReply(supabase, organizationId, fromNumber, messageBody, payload.received_at)

  return NextResponse.json({ received: true })
}

// ============================================================================
// Status Update Handler
// ============================================================================

function mapTelnyxStatus(telnyxStatus: TelnyxDeliveryStatus): string {
  const statusMap: Record<TelnyxDeliveryStatus, string> = {
    queued: 'queued',
    sending: 'sending',
    sent: 'sent',
    delivered: 'delivered',
    sending_failed: 'failed',
    delivery_failed: 'undelivered',
    delivery_unconfirmed: 'unconfirmed'
  }

  return statusMap[telnyxStatus] || 'unknown'
}

async function handleStatusUpdate(supabase: SupabaseClient, payload: TelnyxOutboundPayload) {
  const recipientStatus = payload.to[0]?.status
  const recipientPhone = payload.to[0]?.phone_number

  smsLogger.info('Telnyx SMS status processing', {
    data: { id: payload.id, to: recipientPhone, status: recipientStatus, cost: payload.cost?.amount, parts: payload.parts }
  })

  // Map Telnyx status to our internal status
  const status = mapTelnyxStatus(recipientStatus)

  // Build update data
  const updateData: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString()
  }

  // Add timing info
  if (payload.sent_at) {
    updateData.sent_at = payload.sent_at
  }

  // Add segment count
  if (payload.parts) {
    updateData.segments = payload.parts
  }

  // Add error info if failed
  if (payload.errors && payload.errors.length > 0) {
    updateData.error_message = payload.errors[0].detail || payload.errors[0].title
  }

  // Update the message record by telnyx_message_id
  const { data: updatedMessage, error: updateError } = await supabase
    .from('sms_messages')
    .update(updateData)
    .eq('telnyx_message_id', payload.id)
    .select('id, organization_id, conversation_id')
    .single()

  if (updateError) {
    smsLogger.error('Telnyx SMS status failed to update message', { error: updateError })
    // Still return 200 to acknowledge receipt
    return NextResponse.json({ received: true, error: 'Message not found' })
  }

  smsLogger.debug('Telnyx SMS status updated message', { data: { messageId: updatedMessage?.id, status } })

  // Handle broadcast recipient status updates
  await updateBroadcastRecipient(supabase, payload, status)

  // For failures, log for monitoring
  if (status === 'failed' || status === 'undelivered') {
    smsLogger.warn('Telnyx SMS delivery failed', {
      data: { messageId: payload.id, to: recipientPhone, error: payload.errors?.[0]?.detail || 'Unknown error' }
    })
  }

  return NextResponse.json({ received: true })
}

// ============================================================================
// Broadcast Helpers
// ============================================================================

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

    smsLogger.debug('Telnyx SMS broadcast reply recorded', { data: { broadcastId: broadcastRecipient.broadcast_id } })
  }
}

async function updateBroadcastRecipient(
  supabase: SupabaseClient,
  payload: TelnyxOutboundPayload,
  status: string
) {
  const recipientPhone = payload.to[0]?.phone_number

  // Find broadcast recipient by phone number and message_id reference
  const { data: recipient } = await supabase
    .from('sms_broadcast_recipients')
    .select('id, broadcast_id, message_id, status')
    .eq('phone_number', recipientPhone)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!recipient) {
    return // Not a broadcast message or already updated
  }

  // Verify this is the right message by checking the message record
  if (recipient.message_id) {
    const { data: message } = await supabase
      .from('sms_messages')
      .select('telnyx_message_id')
      .eq('id', recipient.message_id)
      .single()

    if (message?.telnyx_message_id !== payload.id) {
      return // Different message
    }
  }

  // Update recipient status
  const recipientUpdate: Record<string, unknown> = {
    status: status === 'delivered' ? 'delivered' : status === 'failed' || status === 'undelivered' ? 'failed' : recipient.status
  }

  if (payload.errors?.[0]?.detail) {
    recipientUpdate.error_message = payload.errors[0].detail
  }

  await supabase
    .from('sms_broadcast_recipients')
    .update(recipientUpdate)
    .eq('id', recipient.id)

  // Update broadcast counters
  if (status === 'delivered') {
    try {
      await supabase.rpc('increment_broadcast_delivered', {
        broadcast_id: recipient.broadcast_id
      })
    } catch {
      // RPC might not exist, that's ok
    }
  } else if (status === 'failed' || status === 'undelivered') {
    try {
      await supabase.rpc('increment_broadcast_failed', {
        broadcast_id: recipient.broadcast_id
      })
    } catch {
      // RPC might not exist, that's ok
    }
  }

  smsLogger.debug('Telnyx SMS status updated broadcast recipient', { data: { recipientId: recipient.id, status } })
}

// ============================================================================
// Health Check
// ============================================================================

export async function HEAD() {
  return new Response(null, { status: 200 })
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'telnyx-sms-webhook',
    description: 'Unified Telnyx SMS webhook handler (inbound + status)',
    events: ['message.received', 'message.sent', 'message.finalized']
  })
}
