import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { smsLogger } from '@/lib/logger'

// Telnyx SMS status webhook handler
export async function POST(request: NextRequest) {
  try {
    smsLogger.info('SMS status webhook received')

    // Parse form-encoded data from Telnyx
    const formData = await request.formData()
    const data: Record<string, unknown> = {}
    formData.forEach((value, key) => {
      data[key] = value
    })

    smsLogger.debug('SMS status update', {
      data: { messageSid: data.MessageSid, messageStatus: data.MessageStatus, to: data.To, from: data.From, errorCode: data.ErrorCode }
    })
    
    const messageSid = data.MessageSid as string | undefined
    const messageStatus = data.MessageStatus as string | undefined
    const errorCode = data.ErrorCode as string | undefined
    const errorMessage = data.ErrorMessage as string | undefined

    if (!messageSid || !messageStatus) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Use service role client to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Map Telnyx status to our status
    let mappedStatus = messageStatus.toLowerCase()
    if (mappedStatus === 'sent') {
      mappedStatus = 'sent'
    } else if (mappedStatus === 'delivered') {
      mappedStatus = 'delivered'
    } else if (mappedStatus === 'undelivered' || mappedStatus === 'failed') {
      mappedStatus = 'failed'
    } else if (mappedStatus === 'queued' || mappedStatus === 'accepted') {
      mappedStatus = 'queued'
    } else if (mappedStatus === 'sending') {
      mappedStatus = 'sending'
    }
    
    // Update message status in database
    const updateData: Record<string, string> = {
      status: mappedStatus,
      updated_at: new Date().toISOString()
    }
    
    if (mappedStatus === 'delivered') {
      updateData.delivered_at = new Date().toISOString()
    }
    
    if (errorCode || errorMessage) {
      updateData.error_message = `Error ${errorCode}: ${errorMessage}`
    }
    
    // Update message and get the message record
    const { data: messageRecord, error: updateError } = await supabase
      .from('sms_messages')
      .update(updateData)
      .eq('signalwire_message_sid', messageSid)
      .select('id')
      .maybeSingle()

    if (updateError) {
      smsLogger.error('Error updating message status', { error: updateError })
      return NextResponse.json({ error: 'Failed to update status' }, { status: 500 })
    }

    smsLogger.debug('SMS status updated', { data: { messageSid, status: mappedStatus } })

    // Sync status to broadcast recipient if this message is part of a broadcast
    if (messageRecord?.id && (mappedStatus === 'delivered' || mappedStatus === 'failed')) {
      const { data: recipient } = await supabase
        .from('sms_broadcast_recipients')
        .select('id, broadcast_id')
        .eq('message_id', messageRecord.id)
        .maybeSingle()

      if (recipient) {
        // Update recipient status
        await supabase
          .from('sms_broadcast_recipients')
          .update({
            status: mappedStatus,
            ...(mappedStatus === 'failed' && errorMessage ? { error_message: `${errorCode}: ${errorMessage}` } : {})
          })
          .eq('id', recipient.id)

        // Update broadcast counters
        const { data: recipientCounts } = await supabase
          .from('sms_broadcast_recipients')
          .select('status')
          .eq('broadcast_id', recipient.broadcast_id)

        if (recipientCounts) {
          const sentCount = recipientCounts.filter(r => r.status === 'sent' || r.status === 'delivered').length
          const deliveredCount = recipientCounts.filter(r => r.status === 'delivered').length
          const failedCount = recipientCounts.filter(r => r.status === 'failed').length

          await supabase
            .from('sms_broadcasts')
            .update({
              sent_count: sentCount,
              delivered_count: deliveredCount,
              failed_count: failedCount,
              updated_at: new Date().toISOString()
            })
            .eq('id', recipient.broadcast_id)

          smsLogger.debug('Broadcast counters updated', {
            data: { broadcastId: recipient.broadcast_id, sentCount, deliveredCount, failedCount }
          })
        }
      }
    }

    // Return empty response for Telnyx (they expect 204 No Content)
    return new Response(null, { status: 204 })
    
  } catch (error) {
    smsLogger.error('SMS status webhook error', { error })
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Telnyx may send HEAD requests to verify webhook
export async function HEAD() {
  return new Response(null, { status: 200 })
}

// Telnyx may send GET requests to verify webhook
export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    message: 'SMS status webhook endpoint' 
  })
}