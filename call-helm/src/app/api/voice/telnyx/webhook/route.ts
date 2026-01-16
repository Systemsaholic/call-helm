/**
 * Telnyx Voice Webhook Handler
 *
 * Handles all voice events from Telnyx Call Control API:
 * - call.initiated - Call started
 * - call.answered - Call was answered
 * - call.hangup - Call ended
 * - call.dtmf.received - DTMF digit pressed
 * - call.speak.ended - TTS finished
 * - call.playback.ended - Audio playback finished
 * - call.recording.saved - Recording available
 * - call.machine.detection.ended - AMD result
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TelnyxService } from '@/lib/services/telnyx'

// Use service role client to bypass RLS for webhook processing
function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Telnyx webhook event types
type TelnyxEventType =
  | 'call.initiated'
  | 'call.answered'
  | 'call.hangup'
  | 'call.dtmf.received'
  | 'call.speak.started'
  | 'call.speak.ended'
  | 'call.playback.started'
  | 'call.playback.ended'
  | 'call.recording.saved'
  | 'call.bridged'
  | 'call.machine.detection.ended'
  | 'call.gather.ended'

interface TelnyxWebhookPayload {
  call_control_id: string
  call_session_id: string
  call_leg_id: string
  connection_id: string
  from: string
  to: string
  direction: 'incoming' | 'outgoing'
  state?: string
  client_state?: string
  // Hangup specific
  hangup_cause?: string
  hangup_source?: string
  sip_hangup_cause?: string
  start_time?: string
  end_time?: string
  // Quality stats
  call_quality_stats?: {
    inbound: {
      mos: string
      jitter_max_variance: string
      packet_count: string
      skip_packet_count: string
    }
    outbound: {
      packet_count: string
      skip_packet_count: string
    }
  }
  // DTMF
  digit?: string
  // Recording
  recording_id?: string
  recording_urls?: {
    wav?: string
    mp3?: string
  }
  channels?: string
  format?: string
  recording_started_at?: string
  recording_ended_at?: string
  // AMD
  result?: string // human, machine, not_sure
  // Gather
  digits?: string
  termination_reason?: string
}

interface TelnyxWebhookBody {
  data: {
    event_type: TelnyxEventType
    id: string
    occurred_at: string
    payload: TelnyxWebhookPayload
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

    console.log(`[Telnyx Voice Webhook] Event: ${event_type}`, {
      callControlId: payload.call_control_id,
      from: payload.from,
      to: payload.to,
      direction: payload.direction
    })

    // Decode client state if present
    let clientState: Record<string, unknown> = {}
    if (payload.client_state) {
      try {
        const decoded = TelnyxService.decodeClientState(payload.client_state)
        clientState = JSON.parse(decoded)
      } catch {
        // Client state might not be JSON
        clientState = { raw: payload.client_state }
      }
    }

    // Handle different event types
    switch (event_type) {
      case 'call.initiated':
        await handleCallInitiated(payload, clientState)
        break

      case 'call.answered':
        await handleCallAnswered(payload, clientState)
        break

      case 'call.hangup':
        await handleCallHangup(payload, clientState)
        break

      case 'call.dtmf.received':
        await handleDTMFReceived(payload, clientState)
        break

      case 'call.recording.saved':
        await handleRecordingSaved(payload, clientState)
        break

      case 'call.machine.detection.ended':
        await handleAMDResult(payload, clientState)
        break

      case 'call.gather.ended':
        await handleGatherEnded(payload, clientState)
        break

      case 'call.speak.ended':
      case 'call.playback.ended':
        // These are informational - log but no action needed
        console.log(`[Telnyx] ${event_type} for call:`, payload.call_control_id)
        break

      default:
        console.log(`[Telnyx] Unhandled event type: ${event_type}`)
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('[Telnyx Voice Webhook] Error:', error)
    // Still return 200 to prevent retries for processing errors
    return NextResponse.json({ received: true, error: 'Processing error' })
  }
}

/**
 * Handle call.initiated event
 * Call has been started (outbound) or received (inbound)
 */
async function handleCallInitiated(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>
) {
  const supabase = getServiceClient()

  // For incoming calls, we might want to auto-answer and start recording
  if (payload.direction === 'incoming') {
    console.log('[Telnyx] Incoming call from:', payload.from, 'to:', payload.to)

    // Look up the phone number to find the organization
    const { data: phoneNumber } = await supabase
      .from('phone_numbers')
      .select('organization_id, auto_record')
      .eq('phone_number', payload.to)
      .single()

    if (phoneNumber) {
      // Create call record
      await supabase.from('calls').insert({
        organization_id: phoneNumber.organization_id,
        external_id: payload.call_control_id,
        session_id: payload.call_session_id,
        from_number: payload.from,
        to_number: payload.to,
        direction: 'inbound',
        status: 'ringing',
        provider: 'telnyx',
        started_at: new Date().toISOString()
      })
    }
  } else {
    // Outbound call initiated
    console.log('[Telnyx] Outbound call to:', payload.to, 'from:', payload.from)

    // Update existing call record if we have one from clientState
    if (clientState.callId) {
      await supabase
        .from('calls')
        .update({
          external_id: payload.call_control_id,
          session_id: payload.call_session_id,
          status: 'initiated'
        })
        .eq('id', clientState.callId)
    }
  }
}

/**
 * Handle call.answered event
 * Call was answered by the other party
 */
async function handleCallAnswered(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>
) {
  const supabase = getServiceClient()

  console.log('[Telnyx] Call answered:', payload.call_control_id)

  // Find the call by external_id in metadata (JSONB query)
  const { data: call } = await supabase
    .from('calls')
    .select('id, metadata')
    .eq('metadata->>external_id', payload.call_control_id)
    .single()

  if (!call) {
    console.error('[Telnyx] Call not found for answered event:', payload.call_control_id)
    return
  }

  // Update call status with metadata.call_status for status API
  // Note: Don't update the DB status column as it has a limited enum
  // Use metadata.call_status for the UI-friendly status
  const updatedMetadata = {
    ...call.metadata,
    call_status: 'in-progress',
    answered_at: new Date().toISOString()
  }

  const { error: updateError } = await supabase
    .from('calls')
    .update({
      metadata: updatedMetadata
    })
    .eq('id', call.id)

  if (updateError) {
    console.error('[Telnyx] Failed to update call status:', updateError)
  } else {
    console.log('[Telnyx] Call metadata updated with call_status=in-progress:', call.id)
  }

  // Auto-start recording if configured
  const shouldRecord = clientState.autoRecord !== false

  if (shouldRecord) {
    try {
      const telnyx = new TelnyxService()
      await telnyx.startRecording(payload.call_control_id, {
        format: 'wav',
        channels: 'dual', // Best for AI analysis
        playBeep: false,
        transcription: true,
        transcriptionEngine: 'B' // Telnyx engine - lower latency
      })
      console.log('[Telnyx] Auto-recording started for:', payload.call_control_id)
    } catch (error) {
      console.error('[Telnyx] Failed to start recording:', error)
    }
  }
}

/**
 * Handle call.hangup event
 * Call has ended
 */
async function handleCallHangup(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>
) {
  const supabase = getServiceClient()

  console.log('[Telnyx] Call ended:', payload.call_control_id, {
    cause: payload.hangup_cause,
    source: payload.hangup_source
  })

  // Find the call by external_id in metadata (JSONB query)
  const { data: call } = await supabase
    .from('calls')
    .select('id, organization_id, metadata')
    .eq('metadata->>external_id', payload.call_control_id)
    .single()

  if (!call) {
    console.error('[Telnyx] Call not found for hangup event:', payload.call_control_id)
    return
  }

  // Calculate duration
  let durationSeconds = 0
  if (payload.start_time && payload.end_time) {
    const start = new Date(payload.start_time).getTime()
    const end = new Date(payload.end_time).getTime()
    durationSeconds = Math.round((end - start) / 1000)
  }

  // Map hangup cause to status
  let status = 'completed'
  if (payload.hangup_cause === 'busy') {
    status = 'busy'
  } else if (payload.hangup_cause === 'no_answer') {
    status = 'no-answer'
  } else if (payload.hangup_cause === 'call_rejected') {
    status = 'failed'
  } else if (payload.hangup_cause === 'originator_cancel') {
    status = 'canceled'
  }

  // Update metadata with call_status for status API
  const updatedMetadata = {
    ...call.metadata,
    call_status: status
  }

  // Update call record
  const updateData: Record<string, unknown> = {
    status,
    end_time: payload.end_time || new Date().toISOString(),
    duration: durationSeconds,
    metadata: updatedMetadata
  }

  await supabase
    .from('calls')
    .update(updateData)
    .eq('id', call.id)

  console.log('[Telnyx] Call ended, status updated to:', status, 'for call:', call.id)

  // Broadcast call ended event for real-time UI updates
  await supabase
    .channel(`org-${call.organization_id}`)
    .send({
      type: 'broadcast',
      event: 'call_ended',
      payload: {
        callId: call.id,
        status,
        duration: durationSeconds
      }
    })
}

/**
 * Handle DTMF digit received
 */
async function handleDTMFReceived(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>
) {
  console.log('[Telnyx] DTMF received:', payload.digit, 'for call:', payload.call_control_id)

  // Handle DTMF based on client state context
  // This could be used for IVR navigation, surveys, etc.
  if (clientState.context === 'ivr') {
    // Handle IVR menu selection
    // Implementation depends on your IVR logic
  }
}

/**
 * Handle recording saved event
 */
async function handleRecordingSaved(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>
) {
  const supabase = getServiceClient()

  console.log('[Telnyx] Recording saved:', payload.recording_id)

  // Get recording URL (valid for 10 minutes)
  const recordingUrl = payload.recording_urls?.wav || payload.recording_urls?.mp3

  if (!recordingUrl) {
    console.error('[Telnyx] No recording URL in payload')
    return
  }

  // Find the call by external_id in metadata
  const { data: call } = await supabase
    .from('calls')
    .select('id, organization_id')
    .eq('metadata->>external_id', payload.call_control_id)
    .single()

  if (!call) {
    console.error('[Telnyx] Call not found for recording:', payload.call_control_id)
    return
  }

  // Calculate recording duration
  let durationSeconds = 0
  if (payload.recording_started_at && payload.recording_ended_at) {
    const start = new Date(payload.recording_started_at).getTime()
    const end = new Date(payload.recording_ended_at).getTime()
    durationSeconds = Math.round((end - start) / 1000)
  }

  // Create recording record
  await supabase.from('recordings').insert({
    call_id: call.id,
    organization_id: call.organization_id,
    external_id: payload.recording_id,
    provider: 'telnyx',
    format: payload.format || 'wav',
    channels: payload.channels || 'dual',
    duration_seconds: durationSeconds,
    temporary_url: recordingUrl,
    temporary_url_expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 min
    status: 'pending_download'
  })

  // Queue job to download and store recording permanently
  // This should be handled by a background job/cron
  console.log('[Telnyx] Recording queued for download:', payload.recording_id)

  // Update call with recording reference
  await supabase
    .from('calls')
    .update({ has_recording: true })
    .eq('id', call.id)
}

/**
 * Handle answering machine detection result
 */
async function handleAMDResult(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>
) {
  const supabase = getServiceClient()

  console.log('[Telnyx] AMD result:', payload.result, 'for call:', payload.call_control_id)

  // Find the call by external_id in metadata
  const { data: call } = await supabase
    .from('calls')
    .select('id, metadata')
    .eq('metadata->>external_id', payload.call_control_id)
    .single()

  if (!call) {
    console.error('[Telnyx] Call not found for AMD result:', payload.call_control_id)
    return
  }

  // Update metadata with AMD result
  const updatedMetadata = {
    ...call.metadata,
    amd_result: payload.result // 'human', 'machine', 'not_sure'
  }

  await supabase
    .from('calls')
    .update({
      metadata: updatedMetadata
    })
    .eq('id', call.id)

  // If machine detected, you might want to leave a voicemail or hang up
  if (payload.result === 'machine') {
    console.log('[Telnyx] Machine detected, handling accordingly')
  }
}

/**
 * Handle gather ended event (DTMF collection complete)
 */
async function handleGatherEnded(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>
) {
  console.log('[Telnyx] Gather ended:', {
    digits: payload.digits,
    reason: payload.termination_reason,
    callControlId: payload.call_control_id
  })

  // Process gathered digits based on context
  // This would typically trigger the next step in an IVR flow
}

// Also handle GET for webhook verification (if Telnyx requires it)
export async function GET(request: NextRequest) {
  // Return 200 for health checks
  return NextResponse.json({ status: 'ok', service: 'telnyx-voice-webhook' })
}
