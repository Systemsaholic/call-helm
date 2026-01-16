import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TelnyxService } from '@/lib/services/telnyx'

// Use service role for cron job
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// Initialize Telnyx service
const telnyx = new TelnyxService()

// Configuration
const RATE_LIMIT = 10 // messages per second
const BATCH_SIZE = 50 // recipients per cron run
const MAX_RETRIES = 3

// Broadcast SMS pricing - higher than conversational to cover Canadian carrier fees
// Canadian SMS costs ~$0.0175 (base $0.0025 + carrier fee $0.015)
// US SMS costs ~$0.004
// At $0.025, we maintain 30%+ margin even for Canadian destinations
const BROADCAST_SMS_UNIT_COST = 0.025

// Verify cron secret for security
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    return process.env.NODE_ENV === 'development'
  }

  return authHeader === `Bearer ${cronSecret}`
}

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

// Replace template variables in message
function processTemplate(
  template: string,
  variables: Record<string, string> = {},
  contactName?: string | null
): string {
  let message = template

  // Default variables
  const defaultVars: Record<string, string> = {
    name: contactName || 'there',
    first_name: contactName?.split(' ')[0] || 'there',
    ...variables
  }

  // Replace all variables
  for (const [key, value] of Object.entries(defaultVars)) {
    message = message.replace(new RegExp(`{${key}}`, 'gi'), value)
  }

  return message
}

// Send SMS via Telnyx
async function sendSMS(
  from: string,
  to: string,
  body: string
): Promise<{ success: boolean; messageId?: string; error?: string; segments?: number; cost?: number }> {
  try {
    const result = await telnyx.sendMessage({
      from,
      to,
      text: body
    })

    return {
      success: true,
      messageId: result.id,
      segments: result.parts || 1,
      cost: result.cost ? parseFloat(result.cost.amount) : undefined
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

// Process a single broadcast
async function processBroadcast(broadcastId: string): Promise<{
  processed: number
  sent: number
  failed: number
  skipped: number
  completed: boolean
}> {
  const stats = { processed: 0, sent: 0, failed: 0, skipped: 0, completed: false }

  // Get broadcast details
  const { data: broadcast, error: broadcastError } = await supabaseAdmin
    .from('sms_broadcasts')
    .select(`
      *,
      phone_numbers (
        number,
        status
      )
    `)
    .eq('id', broadcastId)
    .single()

  if (broadcastError || !broadcast) {
    console.error('Broadcast not found:', broadcastId)
    return stats
  }

  // Verify broadcast is still in sending status
  if (broadcast.status !== 'sending') {
    console.log(`Broadcast ${broadcastId} is no longer sending (status: ${broadcast.status})`)
    return stats
  }

  // Verify phone number is active
  if (!broadcast.phone_numbers?.number) {
    console.error('Phone number not found for broadcast:', broadcastId)
    await supabaseAdmin
      .from('sms_broadcasts')
      .update({ status: 'failed', error_message: 'Phone number not available' })
      .eq('id', broadcastId)
    return stats
  }

  const fromNumber = broadcast.phone_numbers.number

  // Get pending recipients
  const { data: recipients, error: recipientsError } = await supabaseAdmin
    .from('sms_broadcast_recipients')
    .select('*')
    .eq('broadcast_id', broadcastId)
    .eq('status', 'pending')
    .limit(BATCH_SIZE)

  if (recipientsError) {
    console.error('Error fetching recipients:', recipientsError)
    return stats
  }

  if (!recipients || recipients.length === 0) {
    // No more pending recipients - mark broadcast as completed
    // Get final counts
    const { data: finalCounts } = await supabaseAdmin
      .from('sms_broadcast_recipients')
      .select('status')
      .eq('broadcast_id', broadcastId)

    if (finalCounts) {
      const sentCount = finalCounts.filter(r => r.status === 'sent' || r.status === 'delivered').length
      const deliveredCount = finalCounts.filter(r => r.status === 'delivered').length
      const failedCount = finalCounts.filter(r => r.status === 'failed').length
      const skippedCount = finalCounts.filter(r => r.status === 'skipped').length

      await supabaseAdmin
        .from('sms_broadcasts')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          sent_count: sentCount,
          delivered_count: deliveredCount,
          failed_count: failedCount,
          opted_out_skipped: skippedCount,
          updated_at: new Date().toISOString()
        })
        .eq('id', broadcastId)

      console.log(`Broadcast ${broadcastId} completed: sent=${sentCount}, delivered=${deliveredCount}, failed=${failedCount}, skipped=${skippedCount}`)
    }

    stats.completed = true
    return stats
  }

  // Process each recipient with rate limiting
  for (const recipient of recipients) {
    stats.processed++

    // Check if recipient has opted out (double-check)
    const { data: conversation } = await supabaseAdmin
      .from('sms_conversations')
      .select('is_opted_out')
      .eq('organization_id', broadcast.organization_id)
      .eq('phone_number', recipient.phone_number)
      .maybeSingle()

    if (conversation?.is_opted_out) {
      // Mark as skipped
      await supabaseAdmin
        .from('sms_broadcast_recipients')
        .update({
          status: 'skipped',
          skip_reason: 'opted_out'
        })
        .eq('id', recipient.id)
      stats.skipped++
      continue
    }

    // Mark as sending
    await supabaseAdmin
      .from('sms_broadcast_recipients')
      .update({ status: 'sending' })
      .eq('id', recipient.id)

    // Process template variables
    const messageBody = processTemplate(
      broadcast.message_template,
      recipient.variables || {},
      recipient.contact_name
    )

    // Send SMS
    const result = await sendSMS(fromNumber, recipient.phone_number, messageBody)

    if (result.success) {
      // Find or create conversation for this recipient
      let conversationId: string | null = null

      const { data: existingConversation } = await supabaseAdmin
        .from('sms_conversations')
        .select('id')
        .eq('organization_id', broadcast.organization_id)
        .eq('phone_number', recipient.phone_number)
        .maybeSingle()

      if (existingConversation) {
        conversationId = existingConversation.id
        // Update conversation's last message time
        await supabaseAdmin
          .from('sms_conversations')
          .update({
            last_message_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq('id', conversationId)
      } else {
        // Create new conversation
        const { data: newConversation } = await supabaseAdmin
          .from('sms_conversations')
          .insert({
            organization_id: broadcast.organization_id,
            phone_number: recipient.phone_number,
            contact_name: recipient.contact_name,
            from_phone_number_id: broadcast.from_phone_number_id,
            status: 'active',
            last_message_at: new Date().toISOString()
          })
          .select('id')
          .single()

        conversationId = newConversation?.id || null
      }

      // Create SMS message record
      const { data: messageRecord, error: messageError } = await supabaseAdmin
        .from('sms_messages')
        .insert({
          conversation_id: conversationId,
          organization_id: broadcast.organization_id,
          direction: 'outbound',
          from_number: fromNumber,
          to_number: recipient.phone_number,
          message_body: messageBody,
          status: 'sent',
          telnyx_message_id: result.messageId,
          segments: result.segments,
          sent_at: new Date().toISOString()
        })
        .select()
        .single()

      if (messageError) {
        console.error('Error creating message record:', messageError)
      }

      // Update recipient status
      await supabaseAdmin
        .from('sms_broadcast_recipients')
        .update({
          status: 'sent',
          message_id: messageRecord?.id || null,
          sent_at: new Date().toISOString()
        })
        .eq('id', recipient.id)

      // Track usage for billing (using admin client to bypass RLS)
      // Broadcast SMS is priced higher than conversational to cover Canadian carrier fees
      const { error: usageError } = await supabaseAdmin
        .from('usage_events')
        .insert({
          organization_id: broadcast.organization_id,
          resource_type: 'sms_broadcast',
          amount: 1,
          unit_cost: BROADCAST_SMS_UNIT_COST,
          total_cost: BROADCAST_SMS_UNIT_COST,
          description: 'SMS broadcast message',
          metadata: {
            broadcast_id: broadcastId,
            recipient_id: recipient.id,
            message_id: messageRecord?.id,
            telnyx_cost: result.cost
          }
        })

      if (usageError) {
        console.error('Error tracking usage (non-critical):', usageError)
      }

      stats.sent++
    } else {
      // Mark as failed
      await supabaseAdmin
        .from('sms_broadcast_recipients')
        .update({
          status: 'failed',
          error_message: result.error
        })
        .eq('id', recipient.id)
      stats.failed++
    }

    // Rate limiting delay
    await new Promise(resolve => setTimeout(resolve, 1000 / RATE_LIMIT))

    // Check if broadcast was paused/cancelled mid-processing
    const { data: currentStatus } = await supabaseAdmin
      .from('sms_broadcasts')
      .select('status')
      .eq('id', broadcastId)
      .single()

    if (currentStatus?.status !== 'sending') {
      console.log(`Broadcast ${broadcastId} status changed to ${currentStatus?.status}, stopping`)
      break
    }
  }

  // After processing batch, update broadcast counters
  // Get current counts from recipients table for accuracy
  const { data: recipientCounts } = await supabaseAdmin
    .from('sms_broadcast_recipients')
    .select('status')
    .eq('broadcast_id', broadcastId)

  if (recipientCounts) {
    const sentCount = recipientCounts.filter(r => r.status === 'sent' || r.status === 'delivered').length
    const deliveredCount = recipientCounts.filter(r => r.status === 'delivered').length
    const failedCount = recipientCounts.filter(r => r.status === 'failed').length
    const skippedCount = recipientCounts.filter(r => r.status === 'skipped').length
    const pendingCount = recipientCounts.filter(r => r.status === 'pending' || r.status === 'sending').length

    // Check if all recipients are processed
    const isComplete = pendingCount === 0

    const updateData: Record<string, any> = {
      sent_count: sentCount,
      delivered_count: deliveredCount,
      failed_count: failedCount,
      opted_out_skipped: skippedCount,
      updated_at: new Date().toISOString()
    }

    if (isComplete) {
      updateData.status = 'completed'
      updateData.completed_at = new Date().toISOString()
      stats.completed = true
    }

    await supabaseAdmin
      .from('sms_broadcasts')
      .update(updateData)
      .eq('id', broadcastId)

    console.log(`Broadcast ${broadcastId} updated: sent=${sentCount}, delivered=${deliveredCount}, failed=${failedCount}, skipped=${skippedCount}, complete=${isComplete}`)
  }

  return stats
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('=== BROADCAST PROCESSING JOB ===')
  console.log('Started at:', new Date().toISOString())

  const results = {
    broadcasts_processed: 0,
    total_sent: 0,
    total_failed: 0,
    total_skipped: 0,
    broadcasts_completed: 0,
    errors: [] as string[]
  }

  try {
    // Check if specific broadcast was requested
    const body = await request.json().catch(() => ({}))
    const specificBroadcastId = body.broadcastId as string | undefined

    let broadcasts: { id: string; name: string; organization_id: string }[]

    if (specificBroadcastId) {
      // Process specific broadcast
      const { data, error } = await supabaseAdmin
        .from('sms_broadcasts')
        .select('id, name, organization_id')
        .eq('id', specificBroadcastId)
        .eq('status', 'sending')

      if (error || !data || data.length === 0) {
        return NextResponse.json({
          success: true,
          message: 'No broadcast to process or broadcast not in sending status',
          broadcastId: specificBroadcastId
        })
      }

      broadcasts = data
    } else {
      // Get all broadcasts that need processing
      // 1. Currently sending
      // 2. Scheduled and past their scheduled time
      const now = new Date().toISOString()

      const { data: sendingBroadcasts, error: sendingError } = await supabaseAdmin
        .from('sms_broadcasts')
        .select('id, name, organization_id')
        .eq('status', 'sending')

      const { data: scheduledBroadcasts, error: scheduledError } = await supabaseAdmin
        .from('sms_broadcasts')
        .select('id, name, organization_id')
        .eq('status', 'scheduled')
        .lte('scheduled_at', now)

      if (sendingError || scheduledError) {
        console.error('Error fetching broadcasts:', sendingError || scheduledError)
        return NextResponse.json({ error: 'Failed to fetch broadcasts' }, { status: 500 })
      }

      // Start scheduled broadcasts
      for (const broadcast of scheduledBroadcasts || []) {
        await supabaseAdmin
          .from('sms_broadcasts')
          .update({
            status: 'sending',
            started_at: now,
            updated_at: now
          })
          .eq('id', broadcast.id)
      }

      broadcasts = [
        ...(sendingBroadcasts || []),
        ...(scheduledBroadcasts || [])
      ]
    }

    console.log(`Processing ${broadcasts.length} broadcasts`)

    for (const broadcast of broadcasts) {
      console.log(`Processing broadcast: ${broadcast.name} (${broadcast.id})`)
      results.broadcasts_processed++

      try {
        const stats = await processBroadcast(broadcast.id)

        results.total_sent += stats.sent
        results.total_failed += stats.failed
        results.total_skipped += stats.skipped

        if (stats.completed) {
          results.broadcasts_completed++
          console.log(`Broadcast ${broadcast.id} completed`)
        }

        console.log(`Broadcast ${broadcast.id} stats:`, stats)
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error(`Error processing broadcast ${broadcast.id}:`, errorMsg)
        results.errors.push(`Broadcast ${broadcast.id}: ${errorMsg}`)

        // Mark broadcast as failed on critical errors
        await supabaseAdmin
          .from('sms_broadcasts')
          .update({
            status: 'failed',
            updated_at: new Date().toISOString()
          })
          .eq('id', broadcast.id)
      }
    }

    console.log('=== JOB COMPLETE ===')
    console.log('Results:', results)

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Broadcast processing job error:', error)
    return NextResponse.json({
      error: 'Job failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      results
    }, { status: 500 })
  }
}

// GET for health check and scheduled broadcast check
export async function GET() {
  // Check for any broadcasts that need processing
  const now = new Date().toISOString()

  const { count: sendingCount } = await supabaseAdmin
    .from('sms_broadcasts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'sending')

  const { count: scheduledCount } = await supabaseAdmin
    .from('sms_broadcasts')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'scheduled')
    .lte('scheduled_at', now)

  return NextResponse.json({
    status: 'ok',
    endpoint: 'process-broadcasts',
    description: 'Processes SMS broadcast campaigns',
    config: {
      rate_limit: `${RATE_LIMIT} messages/second`,
      batch_size: BATCH_SIZE
    },
    pending: {
      sending: sendingCount || 0,
      scheduled_ready: scheduledCount || 0
    }
  })
}
