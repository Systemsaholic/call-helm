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
 * - call.bridged - Two calls were bridged together
 *
 * Two-Leg Bridge Flow:
 * 1. Agent clicks CALL → initiateAgentLeg() called
 * 2. Agent's phone rings (cell/3CX/SIP)
 * 3. Agent answers → webhook receives call.answered (phase: 'agent_leg')
 * 4. Play "Connecting to destination..." announcement
 * 5. Initiate contact leg call
 * 6. Contact answers → webhook receives call.answered (phase: 'contact_leg')
 * 7. Play recording announcement (if enabled)
 * 8. Bridge the two calls together
 * 9. Start recording on agent leg
 * 10. call.bridged event received - both parties connected
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TelnyxService } from '@/lib/services/telnyx'
import { webhookLogger } from '@/lib/logger'

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

    webhookLogger.info('Telnyx voice webhook event', {
      data: { eventType: event_type, callControlId: payload.call_control_id, from: payload.from, to: payload.to, direction: payload.direction }
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

      case 'call.bridged':
        await handleCallBridged(payload, clientState)
        break

      case 'call.speak.ended':
        await handleSpeakEnded(payload, clientState)
        break

      case 'call.playback.ended':
        await handlePlaybackEnded(payload, clientState)
        break

      default:
        webhookLogger.debug('Unhandled Telnyx event type', { data: { eventType: event_type } })
    }

    // Always return 200 to acknowledge receipt
    return NextResponse.json({ received: true })
  } catch (error) {
    webhookLogger.error('Telnyx voice webhook error', { error })
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
    webhookLogger.info('Telnyx incoming call', { data: { from: payload.from, to: payload.to } })

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
    webhookLogger.info('Telnyx outbound call', { data: { to: payload.to, from: payload.from } })

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
 *
 * For two-leg bridge flow:
 * - If agent leg answered: Play "Connecting..." then call contact
 * - If contact leg answered: Play recording announcement (if enabled), then bridge
 */
async function handleCallAnswered(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>
) {
  const supabase = getServiceClient()
  const telnyx = new TelnyxService()

  const isBridgeFlow = clientState.bridgeFlow === true
  const phase = clientState.phase as string | undefined

  webhookLogger.info('Telnyx call answered', {
    data: {
      callControlId: payload.call_control_id,
      bridgeFlow: isBridgeFlow,
      phase
    }
  })

  // Handle two-leg bridge flow
  if (isBridgeFlow) {
    if (phase === 'agent_leg') {
      await handleAgentLegAnswered(payload, clientState, supabase, telnyx)
    } else if (phase === 'contact_leg') {
      await handleContactLegAnswered(payload, clientState, supabase, telnyx)
    }
    return
  }

  // Legacy direct call flow (non-bridge)
  await handleLegacyCallAnswered(payload, clientState, supabase, telnyx)
}

/**
 * Handle agent leg answered in two-leg bridge flow
 * 1. Update bridge_status to 'agent_answered'
 * 2. Play "Connecting to destination..." announcement
 * 3. After playback, the contact leg will be initiated
 */
async function handleAgentLegAnswered(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>,
  supabase: ReturnType<typeof getServiceClient>,
  telnyx: TelnyxService
) {
  webhookLogger.info('Agent leg answered - starting bridge flow', {
    data: { callControlId: payload.call_control_id }
  })

  // Find the call by agent_call_control_id
  const { data: call } = await supabase
    .from('calls')
    .select('id, metadata, organization_id')
    .eq('agent_call_control_id', payload.call_control_id)
    .single()

  if (!call) {
    webhookLogger.error('Call not found for agent leg answered', {
      data: { callControlId: payload.call_control_id }
    })
    return
  }

  // Update bridge status and agent_answered_at
  const updatedMetadata = {
    ...call.metadata,
    call_status: 'agent_answered'
  }

  await supabase
    .from('calls')
    .update({
      bridge_status: 'agent_answered',
      agent_answered_at: new Date().toISOString(),
      metadata: updatedMetadata
    })
    .eq('id', call.id)

  // Broadcast status update for real-time UI
  await supabase
    .channel(`org-${call.organization_id}`)
    .send({
      type: 'broadcast',
      event: 'bridge_status_update',
      payload: {
        callId: call.id,
        bridgeStatus: 'agent_answered',
        message: 'Agent answered, connecting to contact...'
      }
    })

  // Play "Connecting to destination..." announcement
  // The contact leg will be initiated when playback ends (in handlePlaybackEnded)
  try {
    const newClientState = {
      ...clientState,
      callId: call.id,
      nextAction: 'initiate_contact_leg'
    }

    await telnyx.playConnectingAnnouncement(
      payload.call_control_id,
      TelnyxService.encodeClientState(JSON.stringify(newClientState))
    )

    webhookLogger.info('Playing connecting announcement to agent', {
      data: { callId: call.id }
    })
  } catch (error) {
    webhookLogger.error('Failed to play connecting announcement', { error })
    // Continue anyway - initiate contact leg directly
    await initiateContactLeg(call.id, clientState, supabase, telnyx)
  }
}

/**
 * Handle contact leg answered in two-leg bridge flow
 * 1. Update bridge_status to 'contact_answered'
 * 2. Play recording announcement (if enabled)
 * 3. Bridge the two calls together
 * 4. Start recording on agent leg
 */
async function handleContactLegAnswered(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>,
  supabase: ReturnType<typeof getServiceClient>,
  telnyx: TelnyxService
) {
  const callId = clientState.callId as string

  webhookLogger.info('Contact leg answered', {
    data: { callControlId: payload.call_control_id, callId }
  })

  // Find the call
  const { data: call } = await supabase
    .from('calls')
    .select('id, agent_call_control_id, metadata, organization_id, recording_enabled')
    .eq('id', callId)
    .single()

  if (!call) {
    webhookLogger.error('Call not found for contact leg answered', { data: { callId } })
    return
  }

  // Update call with contact call control ID and bridge status
  const updatedMetadata = {
    ...call.metadata,
    call_status: 'bridging'
  }

  await supabase
    .from('calls')
    .update({
      contact_call_control_id: payload.call_control_id,
      bridge_status: 'bridging',
      contact_answered_at: new Date().toISOString(),
      metadata: updatedMetadata
    })
    .eq('id', call.id)

  // Broadcast status update
  await supabase
    .channel(`org-${call.organization_id}`)
    .send({
      type: 'broadcast',
      event: 'bridge_status_update',
      payload: {
        callId: call.id,
        bridgeStatus: 'bridging',
        message: 'Contact answered, bridging calls...'
      }
    })

  // Check if we need to play recording announcement
  const announceRecording = clientState.announceRecording === true && call.recording_enabled
  const recordingAnnouncementUrl = clientState.recordingAnnouncementUrl as string | undefined

  if (announceRecording) {
    // Play recording announcement to contact, then bridge
    try {
      const newClientState = {
        ...clientState,
        nextAction: 'bridge_calls',
        agentCallControlId: call.agent_call_control_id,
        contactCallControlId: payload.call_control_id
      }

      await telnyx.playRecordingAnnouncement(
        payload.call_control_id,
        recordingAnnouncementUrl,
        TelnyxService.encodeClientState(JSON.stringify(newClientState))
      )

      webhookLogger.info('Playing recording announcement to contact', { data: { callId } })
    } catch (error) {
      webhookLogger.error('Failed to play recording announcement', { error })
      // Continue anyway - bridge calls directly
      await bridgeCallsAndStartRecording(call, payload.call_control_id, supabase, telnyx)
    }
  } else {
    // No recording announcement, bridge calls directly
    await bridgeCallsAndStartRecording(call, payload.call_control_id, supabase, telnyx)
  }
}

/**
 * Initiate the contact leg of the bridge call
 */
async function initiateContactLeg(
  callId: string,
  clientState: Record<string, unknown>,
  supabase: ReturnType<typeof getServiceClient>,
  telnyx: TelnyxService
) {
  // Get call details
  const { data: call } = await supabase
    .from('calls')
    .select('id, called_number, caller_number, agent_call_control_id, metadata, organization_id, recording_enabled')
    .eq('id', callId)
    .single()

  if (!call) {
    webhookLogger.error('Call not found for initiating contact leg', { data: { callId } })
    return
  }

  webhookLogger.info('Initiating contact leg', {
    data: {
      callId,
      contactNumber: call.called_number,
      from: call.caller_number
    }
  })

  // Update bridge status
  await supabase
    .from('calls')
    .update({ bridge_status: 'connecting_contact' })
    .eq('id', call.id)

  // Broadcast status update
  await supabase
    .channel(`org-${call.organization_id}`)
    .send({
      type: 'broadcast',
      event: 'bridge_status_update',
      payload: {
        callId: call.id,
        bridgeStatus: 'connecting_contact',
        message: 'Calling contact...'
      }
    })

  try {
    // Prepare client state for contact leg
    const contactClientState = {
      ...clientState,
      callId: call.id,
      phase: 'contact_leg',
      agentCallControlId: call.agent_call_control_id,
      announceRecording: call.metadata?.announce_recording,
      recordingAnnouncementUrl: call.metadata?.recording_announcement_url
    }

    // Initiate call to contact
    const contactCallData = await telnyx.initiateContactLeg({
      contactNumber: call.called_number,
      from: call.caller_number,
      agentCallControlId: call.agent_call_control_id,
      clientState: contactClientState
    })

    // Update call with contact call control ID
    await supabase
      .from('calls')
      .update({
        contact_call_control_id: contactCallData.callControlId,
        bridge_status: 'contact_ringing'
      })
      .eq('id', call.id)

    webhookLogger.info('Contact leg initiated', {
      data: {
        callId,
        contactCallControlId: contactCallData.callControlId
      }
    })

    // Broadcast contact ringing status
    await supabase
      .channel(`org-${call.organization_id}`)
      .send({
        type: 'broadcast',
        event: 'bridge_status_update',
        payload: {
          callId: call.id,
          bridgeStatus: 'contact_ringing',
          message: "Contact's phone is ringing..."
        }
      })
  } catch (error) {
    webhookLogger.error('Failed to initiate contact leg', { error })

    // Update status to failed
    await supabase
      .from('calls')
      .update({ bridge_status: 'failed' })
      .eq('id', call.id)

    // Hang up agent leg
    try {
      await telnyx.hangup(call.agent_call_control_id)
    } catch {
      // Ignore hangup errors
    }
  }
}

/**
 * Bridge the two call legs and start recording
 */
async function bridgeCallsAndStartRecording(
  call: {
    id: string
    agent_call_control_id: string | null
    organization_id: string
    recording_enabled: boolean
    metadata: Record<string, unknown>
  },
  contactCallControlId: string,
  supabase: ReturnType<typeof getServiceClient>,
  telnyx: TelnyxService
) {
  if (!call.agent_call_control_id) {
    webhookLogger.error('No agent call control ID for bridging', { data: { callId: call.id } })
    return
  }

  webhookLogger.info('Bridging calls', {
    data: {
      callId: call.id,
      agentCallControlId: call.agent_call_control_id,
      contactCallControlId
    }
  })

  try {
    // Bridge calls - join contact leg to agent leg
    await telnyx.bridge(call.agent_call_control_id, contactCallControlId)

    // Update bridge status
    await supabase
      .from('calls')
      .update({
        bridge_status: 'bridged',
        bridge_created_at: new Date().toISOString(),
        metadata: {
          ...call.metadata,
          call_status: 'in-progress'
        }
      })
      .eq('id', call.id)

    webhookLogger.info('Calls bridged successfully', { data: { callId: call.id } })

    // Broadcast bridged status
    await supabase
      .channel(`org-${call.organization_id}`)
      .send({
        type: 'broadcast',
        event: 'bridge_status_update',
        payload: {
          callId: call.id,
          bridgeStatus: 'bridged',
          message: 'Call connected'
        }
      })

    // Start recording on agent leg if enabled
    if (call.recording_enabled) {
      try {
        await telnyx.startRecording(call.agent_call_control_id, {
          format: 'wav',
          channels: 'dual',
          playBeep: false,
          transcription: true,
          transcriptionEngine: 'B'
        })
        webhookLogger.info('Recording started on bridged call', { data: { callId: call.id } })
      } catch (recordError) {
        webhookLogger.error('Failed to start recording', { error: recordError })
      }
    }
  } catch (error) {
    webhookLogger.error('Failed to bridge calls', { error })

    // Update status to failed
    await supabase
      .from('calls')
      .update({ bridge_status: 'failed' })
      .eq('id', call.id)

    // Hang up both legs
    try {
      await telnyx.hangup(call.agent_call_control_id)
      await telnyx.hangup(contactCallControlId)
    } catch {
      // Ignore hangup errors
    }
  }
}

/**
 * Handle legacy (non-bridge) call answered
 */
async function handleLegacyCallAnswered(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>,
  supabase: ReturnType<typeof getServiceClient>,
  telnyx: TelnyxService
) {
  // Find the call by external_id in metadata (JSONB query)
  const { data: call } = await supabase
    .from('calls')
    .select('id, metadata')
    .eq('metadata->>external_id', payload.call_control_id)
    .single()

  if (!call) {
    webhookLogger.error('Telnyx call not found for answered event', { data: { callControlId: payload.call_control_id } })
    return
  }

  // Update call status with metadata.call_status for status API
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
    webhookLogger.error('Telnyx failed to update call status', { error: updateError })
  } else {
    webhookLogger.debug('Telnyx call metadata updated', { data: { callId: call.id, callStatus: 'in-progress' } })
  }

  // Auto-start recording if configured
  const shouldRecord = clientState.autoRecord !== false

  if (shouldRecord) {
    try {
      await telnyx.startRecording(payload.call_control_id, {
        format: 'wav',
        channels: 'dual',
        playBeep: false,
        transcription: true,
        transcriptionEngine: 'B'
      })
      webhookLogger.info('Telnyx auto-recording started', { data: { callControlId: payload.call_control_id } })
    } catch (error) {
      webhookLogger.error('Telnyx failed to start recording', { error })
    }
  }
}

/**
 * Handle call.hangup event
 * Call has ended - handles both bridge flow and legacy flow
 */
async function handleCallHangup(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>
) {
  const supabase = getServiceClient()
  const telnyx = new TelnyxService()

  const isBridgeFlow = clientState.bridgeFlow === true
  const phase = clientState.phase as string | undefined

  webhookLogger.info('Telnyx call ended', {
    data: {
      callControlId: payload.call_control_id,
      cause: payload.hangup_cause,
      source: payload.hangup_source,
      bridgeFlow: isBridgeFlow,
      phase
    }
  })

  // Try to find call by agent or contact call control ID (for bridge flow)
  let call = await supabase
    .from('calls')
    .select('id, organization_id, metadata, agent_call_control_id, contact_call_control_id, bridge_status, start_time')
    .eq('agent_call_control_id', payload.call_control_id)
    .single()
    .then(r => r.data)

  if (!call) {
    call = await supabase
      .from('calls')
      .select('id, organization_id, metadata, agent_call_control_id, contact_call_control_id, bridge_status, start_time')
      .eq('contact_call_control_id', payload.call_control_id)
      .single()
      .then(r => r.data)
  }

  // Fallback to metadata lookup for legacy flow
  if (!call) {
    const { data: legacyCall } = await supabase
      .from('calls')
      .select('id, organization_id, metadata, agent_call_control_id, contact_call_control_id, bridge_status, start_time')
      .eq('metadata->>external_id', payload.call_control_id)
      .single()
    call = legacyCall
  }

  if (!call) {
    webhookLogger.debug('Call not found for hangup event', { data: { callControlId: payload.call_control_id } })
    return
  }

  // Calculate duration
  let durationSeconds = 0
  if (payload.start_time && payload.end_time) {
    const start = new Date(payload.start_time).getTime()
    const end = new Date(payload.end_time).getTime()
    durationSeconds = Math.round((end - start) / 1000)
  } else if (call.start_time) {
    const start = new Date(call.start_time).getTime()
    const end = Date.now()
    durationSeconds = Math.round((end - start) / 1000)
  }

  // Determine bridge status based on which leg hung up and why
  let bridgeStatus = 'completed'
  let status = 'completed'

  if (isBridgeFlow || call.bridge_status) {
    const isAgentLeg = payload.call_control_id === call.agent_call_control_id
    const isContactLeg = payload.call_control_id === call.contact_call_control_id

    // Determine status based on hangup cause and current state
    switch (payload.hangup_cause) {
      case 'busy':
        bridgeStatus = isAgentLeg ? 'agent_busy' : 'contact_busy'
        status = 'busy'
        break
      case 'no_answer':
        bridgeStatus = isAgentLeg ? 'agent_no_answer' : 'contact_no_answer'
        status = 'no-answer'
        break
      case 'call_rejected':
        bridgeStatus = 'failed'
        status = 'failed'
        break
      case 'originator_cancel':
        // If agent leg hung up before contact answered, it's a cancel
        if (isAgentLeg && call.bridge_status !== 'bridged') {
          bridgeStatus = 'cancelled'
          status = 'canceled'
        } else {
          bridgeStatus = 'completed'
          status = 'completed'
        }
        break
      default:
        // Normal hangup after bridged call
        if (call.bridge_status === 'bridged') {
          bridgeStatus = 'completed'
          status = 'completed'
        }
    }

    // If one leg hung up while bridged, hang up the other leg
    if (call.bridge_status === 'bridged') {
      const otherLegId = isAgentLeg ? call.contact_call_control_id : call.agent_call_control_id
      if (otherLegId) {
        try {
          webhookLogger.info('Hanging up other leg of bridge', { data: { otherLegId } })
          await telnyx.hangup(otherLegId)
        } catch (error) {
          // Other leg may have already hung up
          webhookLogger.debug('Failed to hang up other leg (may already be disconnected)', { error })
        }
      }
    }

    // If agent hung up before bridging, clean up contact leg if it exists
    if (isAgentLeg && call.contact_call_control_id && call.bridge_status !== 'bridged') {
      try {
        await telnyx.hangup(call.contact_call_control_id)
      } catch {
        // Ignore errors
      }
    }
  } else {
    // Legacy flow status mapping
    if (payload.hangup_cause === 'busy') {
      status = 'busy'
    } else if (payload.hangup_cause === 'no_answer') {
      status = 'no-answer'
    } else if (payload.hangup_cause === 'call_rejected') {
      status = 'failed'
    } else if (payload.hangup_cause === 'originator_cancel') {
      status = 'canceled'
    }
  }

  // Update metadata with call_status for status API
  const updatedMetadata = {
    ...call.metadata,
    call_status: status,
    hangup_cause: payload.hangup_cause,
    hangup_source: payload.hangup_source
  }

  // Update call record
  const updateData: Record<string, unknown> = {
    status,
    end_time: payload.end_time || new Date().toISOString(),
    duration: durationSeconds,
    metadata: updatedMetadata
  }

  // Add bridge status if this was a bridge flow call
  if (isBridgeFlow || call.bridge_status) {
    updateData.bridge_status = bridgeStatus
  }

  await supabase
    .from('calls')
    .update(updateData)
    .eq('id', call.id)

  webhookLogger.info('Call status updated', {
    data: { callId: call.id, status, bridgeStatus, duration: durationSeconds }
  })

  // Broadcast call ended event for real-time UI updates
  await supabase
    .channel(`org-${call.organization_id}`)
    .send({
      type: 'broadcast',
      event: 'call_ended',
      payload: {
        callId: call.id,
        status,
        bridgeStatus,
        duration: durationSeconds,
        hangupCause: payload.hangup_cause
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
  webhookLogger.debug('Telnyx DTMF received', { data: { digit: payload.digit, callControlId: payload.call_control_id } })

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

  webhookLogger.info('Telnyx recording saved', { data: { recordingId: payload.recording_id } })

  // Get recording URL (valid for 10 minutes)
  const recordingUrl = payload.recording_urls?.wav || payload.recording_urls?.mp3

  if (!recordingUrl) {
    webhookLogger.error('Telnyx no recording URL in payload')
    return
  }

  // Find the call by external_id in metadata
  const { data: call } = await supabase
    .from('calls')
    .select('id, organization_id')
    .eq('metadata->>external_id', payload.call_control_id)
    .single()

  if (!call) {
    webhookLogger.error('Telnyx call not found for recording', { data: { callControlId: payload.call_control_id } })
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
  webhookLogger.info('Telnyx recording queued for download', { data: { recordingId: payload.recording_id } })

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

  webhookLogger.info('Telnyx AMD result', { data: { result: payload.result, callControlId: payload.call_control_id } })

  // Find the call by external_id in metadata
  const { data: call } = await supabase
    .from('calls')
    .select('id, metadata')
    .eq('metadata->>external_id', payload.call_control_id)
    .single()

  if (!call) {
    webhookLogger.error('Telnyx call not found for AMD result', { data: { callControlId: payload.call_control_id } })
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
    webhookLogger.info('Telnyx machine detected, handling accordingly')
  }
}

/**
 * Handle gather ended event (DTMF collection complete)
 */
async function handleGatherEnded(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>
) {
  webhookLogger.debug('Telnyx gather ended', {
    data: { digits: payload.digits, reason: payload.termination_reason, callControlId: payload.call_control_id }
  })

  // Process gathered digits based on context
  // This would typically trigger the next step in an IVR flow
}

/**
 * Handle call.bridged event
 * Confirms that two call legs have been successfully bridged
 */
async function handleCallBridged(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>
) {
  const supabase = getServiceClient()

  webhookLogger.info('Telnyx calls bridged', {
    data: { callControlId: payload.call_control_id }
  })

  // Find the call by either agent or contact call control ID
  let call = await supabase
    .from('calls')
    .select('id, organization_id')
    .eq('agent_call_control_id', payload.call_control_id)
    .single()
    .then(r => r.data)

  if (!call) {
    call = await supabase
      .from('calls')
      .select('id, organization_id')
      .eq('contact_call_control_id', payload.call_control_id)
      .single()
      .then(r => r.data)
  }

  if (!call) {
    webhookLogger.debug('Call not found for bridged event (may be expected)', {
      data: { callControlId: payload.call_control_id }
    })
    return
  }

  // Confirm bridge status
  await supabase
    .from('calls')
    .update({
      bridge_status: 'bridged',
      bridge_created_at: new Date().toISOString()
    })
    .eq('id', call.id)

  webhookLogger.info('Bridge confirmed', { data: { callId: call.id } })
}

/**
 * Handle call.speak.ended event
 * TTS playback has finished
 */
async function handleSpeakEnded(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>
) {
  webhookLogger.debug('Telnyx speak ended', {
    data: { callControlId: payload.call_control_id, nextAction: clientState.nextAction }
  })

  // Check if there's a next action to perform after TTS
  await handleNextAction(payload, clientState)
}

/**
 * Handle call.playback.ended event
 * Audio file playback has finished - this triggers next steps in bridge flow
 */
async function handlePlaybackEnded(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>
) {
  webhookLogger.debug('Telnyx playback ended', {
    data: { callControlId: payload.call_control_id, nextAction: clientState.nextAction }
  })

  // Check if there's a next action to perform after playback
  await handleNextAction(payload, clientState)
}

/**
 * Handle next action after playback/speak ends
 * This is the continuation of the bridge flow
 */
async function handleNextAction(
  payload: TelnyxWebhookPayload,
  clientState: Record<string, unknown>
) {
  const nextAction = clientState.nextAction as string | undefined
  const supabase = getServiceClient()
  const telnyx = new TelnyxService()

  if (!nextAction) {
    return
  }

  switch (nextAction) {
    case 'initiate_contact_leg': {
      // After "Connecting..." announcement, initiate contact leg
      const callId = clientState.callId as string
      if (callId) {
        await initiateContactLeg(callId, clientState, supabase, telnyx)
      }
      break
    }

    case 'bridge_calls': {
      // After recording announcement, bridge the calls
      const callId = clientState.callId as string
      const agentCallControlId = clientState.agentCallControlId as string
      const contactCallControlId = clientState.contactCallControlId as string

      if (callId && agentCallControlId && contactCallControlId) {
        const { data: call } = await supabase
          .from('calls')
          .select('id, agent_call_control_id, organization_id, recording_enabled, metadata')
          .eq('id', callId)
          .single()

        if (call) {
          await bridgeCallsAndStartRecording(
            call,
            contactCallControlId,
            supabase,
            telnyx
          )
        }
      }
      break
    }

    default:
      webhookLogger.debug('Unknown next action', { data: { nextAction } })
  }
}

// Also handle GET for webhook verification (if Telnyx requires it)
export async function GET(request: NextRequest) {
  // Return 200 for health checks
  return NextResponse.json({ status: 'ok', service: 'telnyx-voice-webhook' })
}
