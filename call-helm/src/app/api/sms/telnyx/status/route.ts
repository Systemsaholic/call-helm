/**
 * Telnyx SMS Status Webhook Handler
 *
 * Handles SMS delivery status updates from Telnyx.
 * Event types:
 * - message.sent - Message sent to carrier
 * - message.finalized - Final delivery status (delivered/failed)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { smsLogger } from '@/lib/logger'

// Telnyx delivery statuses
type TelnyxDeliveryStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'sending_failed'
  | 'delivery_failed'
  | 'delivery_unconfirmed'

interface TelnyxStatusPayload {
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
  cost_breakdown?: {
    carrier_fee: {
      amount: string
      currency: string
    }
    rate: {
      amount: string
      currency: string
    }
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
    event_type: 'message.sent' | 'message.finalized'
    id: string
    occurred_at: string
    payload: TelnyxStatusPayload
    record_type: string
  }
  meta?: {
    attempt: number
    delivered_to: string
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: TelnyxWebhookBody = await request.json()
    const { data } = body
    const { event_type, payload } = data

    // Get the delivery status from the first recipient
    const recipientStatus = payload.to[0]?.status
    const recipientPhone = payload.to[0]?.phone_number

    smsLogger.info('Telnyx SMS status update', {
      data: { eventType: event_type, id: payload.id, to: recipientPhone, status: recipientStatus, cost: payload.cost?.amount, parts: payload.parts }
    })

    // Use service role client to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

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
      smsLogger.error('Telnyx SMS status - failed to update message', { error: updateError })
      // Still return 200 to acknowledge receipt
      return NextResponse.json({ received: true, error: 'Message not found' })
    }

    smsLogger.debug('Telnyx SMS status - updated message', { data: { messageId: updatedMessage?.id, status } })

    // Handle broadcast recipient status updates
    await updateBroadcastRecipient(supabase, payload, status)

    // For failures, log for monitoring
    if (status === 'failed' || status === 'undelivered') {
      smsLogger.warn('Telnyx SMS delivery failed', {
        data: { messageId: payload.id, to: recipientPhone, error: payload.errors?.[0]?.detail || 'Unknown error' }
      })
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    smsLogger.error('Telnyx SMS status webhook error', { error })
    return NextResponse.json({ received: true, error: 'Processing error' })
  }
}

/**
 * Map Telnyx delivery status to our internal status
 */
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

/**
 * Update broadcast recipient status if this message was part of a broadcast
 */
async function updateBroadcastRecipient(
  supabase: SupabaseClient,
  payload: TelnyxStatusPayload,
  status: string
) {
  const recipientPhone = payload.to[0]?.phone_number

  // Find broadcast recipient by phone number and message_id reference
  // The broadcast processor stores message_id in sms_broadcast_recipients
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

  // Update broadcast counters using RPC
  if (status === 'delivered') {
    try {
      await supabase.rpc('increment_broadcast_delivered', {
        broadcast_id: recipient.broadcast_id
      })
    } catch {
      // RPC might not exist, that's ok - fall back to updating timestamp
      await supabase
        .from('sms_broadcasts')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', recipient.broadcast_id)
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

  smsLogger.debug('Telnyx SMS status - updated broadcast recipient', { data: { recipientId: recipient.id, status } })
}

// Health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'telnyx-sms-status',
    description: 'Telnyx SMS delivery status webhook handler'
  })
}
