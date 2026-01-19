import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TelnyxService } from '@/lib/services/telnyx'
import { voiceLogger } from '@/lib/logger'

// Initialize Telnyx service
const telnyx = new TelnyxService()

const PHONE_E164_REGEX = /^\+?[1-9]\d{1,14}$/

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const {
      contactId,
      phoneNumber,
      callListId,
      scriptId,
      useBridgeFlow = true // Default to two-leg bridge flow
    } = body

    voiceLogger.info('Call initiate request', {
      data: { provider: 'telnyx', contactId, phoneNumber, callListId, scriptId, userId: user?.id, useBridgeFlow }
    })

    if (!phoneNumber) {
      voiceLogger.error('No phone number provided')
      return NextResponse.json({ error: "Phone number is required" }, { status: 400 })
    }

    // Format phone number to E.164 if not already
    let formattedPhoneNumber = phoneNumber.toString().replace(/[\s()-]/g, "")

    // Add + prefix if not present
    if (!formattedPhoneNumber.startsWith('+')) {
      // Assume US/Canada number if no country code
      if (formattedPhoneNumber.length === 10) {
        formattedPhoneNumber = '+1' + formattedPhoneNumber
      } else if (formattedPhoneNumber.length === 11 && formattedPhoneNumber.startsWith('1')) {
        formattedPhoneNumber = '+' + formattedPhoneNumber
      } else {
        formattedPhoneNumber = '+' + formattedPhoneNumber
      }
    }

    voiceLogger.debug('Formatted phone number', { data: { formattedPhoneNumber } })

    // Validate E.164 phone number
    if (!PHONE_E164_REGEX.test(formattedPhoneNumber)) {
      voiceLogger.error('Invalid phone number format', { data: { formattedPhoneNumber } })
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 })
    }

    // Get user's organization and member details including phone preferences
    const { data: member, error: memberError } = await supabase
      .from("organization_members")
      .select("id, organization_id, phone, phone_type, sip_uri, three_cx_extension")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single()

    voiceLogger.debug('Member lookup result', { data: { member, error: memberError } })

    if (!member?.organization_id) {
      voiceLogger.error('No organization found for user')
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    // Determine agent endpoint for two-leg bridge
    const phoneType = member.phone_type || 'cell'
    let agentEndpoint: string | null = null

    if (phoneType === 'sip_uri' && member.sip_uri) {
      agentEndpoint = member.sip_uri
    } else if (phoneType === '3cx_did' && member.phone) {
      agentEndpoint = member.phone
    } else if (member.phone) {
      agentEndpoint = member.phone
    }

    // Check if agent has a phone configured for bridge flow
    if (useBridgeFlow && !agentEndpoint) {
      voiceLogger.error('Agent phone not configured for bridge calling')
      return NextResponse.json({
        error: 'Your phone number is not configured. Please set your phone number in Settings to make calls.'
      }, { status: 400 })
    }

    voiceLogger.debug('Organization context', {
      data: {
        organizationId: member.organization_id,
        memberId: member.id,
        agentEndpoint,
        phoneType
      }
    })

    // Check usage limits before allowing call
    const { data: usageData } = await supabase.from("usage_tracking").select("used_amount, tier_included").eq("organization_id", member.organization_id).eq("resource_type", "call_minutes").gte("billing_period_end", new Date().toISOString()).single()

    const { data: orgData } = await supabase.from("organizations").select("subscription_tier, three_cx_server_url").eq("id", member.organization_id).single()

    // Check if user has available minutes
    const usedMinutes = usageData?.used_amount || 0
    const includedMinutes = usageData?.tier_included || 0

    if (usedMinutes >= includedMinutes && orgData?.subscription_tier === "starter") {
      return NextResponse.json(
        {
          error: "Call minutes limit reached",
          message: "You have used all your included minutes for this month. Please upgrade your plan to continue making calls.",
          usedMinutes,
          includedMinutes,
          showUpgrade: true
        },
        { status: 402 }
      )
    }

    // Get call list settings if provided (for recording announcement, custom dispositions)
    let callListSettings: {
      announce_recording?: boolean
      recording_announcement_url?: string
      custom_dispositions?: unknown[]
      call_goals?: string[]
      keywords?: string[]
    } | null = null

    if (callListId) {
      const { data: callList } = await supabase
        .from('call_lists')
        .select('announce_recording, recording_announcement_url, custom_dispositions, call_goals, keywords')
        .eq('id', callListId)
        .eq('organization_id', member.organization_id)
        .single()

      callListSettings = callList
    }

    // Get script if provided
    let scriptContent = null
    if (scriptId) {
      const { data: script } = await supabase.from("scripts").select("content").eq("id", scriptId).eq("organization_id", member.organization_id).single()

      scriptContent = script?.content
    }

    // Check if user wants to record and has Pro plan
    const { data: userPrefs } = await supabase
      .from('user_profiles')
      .select('default_record_calls')
      .eq('id', user.id)
      .single()

    const { data: limits } = await supabase
      .from('organization_limits')
      .select('features')
      .eq('organization_id', member.organization_id)
      .single()

    const canRecord = limits?.features?.call_recording_transcription === true
    const wantsToRecord = userPrefs?.default_record_calls === true
    const enableRecording = canRecord && wantsToRecord

    // Determine if we should announce recording
    const announceRecording = enableRecording && (callListSettings?.announce_recording !== false)
    const recordingAnnouncementUrl = callListSettings?.recording_announcement_url || null

    voiceLogger.debug('Recording check', {
      data: { canRecord, wantsToRecord, enableRecording, announceRecording, recordingAnnouncementUrl }
    })

    // Get organization's phone number (from number)
    const { data: phoneNumberData, error: phoneError } = await supabase
      .from('phone_numbers')
      .select('number, status, provider')
      .eq('organization_id', member.organization_id)
      .in('status', ['active'])
      .order('is_primary', { ascending: false })
      .limit(1)

    voiceLogger.debug('Phone number query result', { data: { phoneNumberData, phoneError } })

    if (phoneError || !phoneNumberData || phoneNumberData.length === 0) {
      voiceLogger.error('No phone number configured', { data: { phoneError, count: phoneNumberData?.length } })
      return NextResponse.json({
        error: 'Organization phone number not configured. Please add a phone number in Settings.'
      }, { status: 400 })
    }

    const fromNumber = phoneNumberData[0].number

    // Check if Telnyx is configured
    if (!TelnyxService.isConfigured()) {
      voiceLogger.error('Telnyx not configured')
      return NextResponse.json({ error: 'Voice service not configured' }, { status: 503 })
    }

    // Build SIP URI if needed (agent has extension but no SIP URI configured)
    if (phoneType === 'sip_uri' && member.three_cx_extension && !member.sip_uri && orgData?.three_cx_server_url) {
      agentEndpoint = TelnyxService.buildSipUri(member.three_cx_extension, orgData.three_cx_server_url)
      voiceLogger.debug('Built SIP URI from extension', { data: { agentEndpoint } })
    }

    // Initiate call - use two-leg bridge flow if enabled
    let externalCallId: string | null = null
    let callControlData: { callControlId: string; callSessionId: string; callLegId: string } | null = null

    const callData: Record<string, unknown> = {
      organization_id: member.organization_id,
      contact_id: contactId || null,
      direction: "outbound",
      caller_number: fromNumber,
      called_number: formattedPhoneNumber,
      status: "answered",  // Using 'answered' as the initial status since 'initiated' isn't valid
      member_id: member.id,
      start_time: new Date().toISOString(),
      recording_enabled: enableRecording,
      // Two-leg bridge specific fields
      bridge_status: useBridgeFlow ? 'agent_ringing' : null,
      agent_endpoint: useBridgeFlow ? agentEndpoint : null,
      agent_endpoint_type: useBridgeFlow ? phoneType : null,
      metadata: {
        call_list_id: callListId,
        script_id: scriptId,
        initiated_by: user.id,
        provider: 'telnyx',
        initial_status: "initiated",
        bridge_flow: useBridgeFlow,
        announce_recording: announceRecording,
        recording_announcement_url: recordingAnnouncementUrl,
        call_goals: callListSettings?.call_goals || [],
        keywords: callListSettings?.keywords || []
      } as Record<string, unknown>
    }

    try {
      if (useBridgeFlow && agentEndpoint) {
        // Two-leg bridge flow: Call agent first, then contact
        voiceLogger.info('Initiating two-leg bridge call', {
          data: { agentEndpoint, phoneType, contactNumber: formattedPhoneNumber }
        })

        callControlData = await telnyx.initiateAgentLeg({
          agentEndpoint,
          agentEndpointType: phoneType as 'cell' | '3cx_did' | 'sip_uri',
          contactNumber: formattedPhoneNumber,
          from: fromNumber,
          recordingEnabled: enableRecording,
          announceRecording,
          recordingAnnouncementUrl: recordingAnnouncementUrl || undefined,
          clientState: {
            organizationId: member.organization_id,
            memberId: member.id,
            contactId,
            callListId,
            autoRecord: enableRecording,
            bridgeFlow: true
          }
        })

        voiceLogger.info('Agent leg initiated', {
          data: { callControlId: callControlData.callControlId, agentEndpoint, from: fromNumber }
        })

        externalCallId = callControlData.callControlId
        const metadata = callData.metadata as Record<string, unknown>
        metadata.external_id = callControlData.callControlId
        metadata.call_session_id = callControlData.callSessionId
        metadata.call_leg_id = callControlData.callLegId
        callData.agent_call_control_id = callControlData.callControlId
      } else {
        // Legacy direct call flow (calls contact directly)
        voiceLogger.info('Initiating direct call (legacy flow)', {
          data: { to: formattedPhoneNumber, from: fromNumber }
        })

        const clientState = JSON.stringify({
          organizationId: member.organization_id,
          memberId: member.id,
          contactId,
          callListId,
          autoRecord: enableRecording
        })

        callControlData = await telnyx.initiateCall({
          from: fromNumber,
          to: formattedPhoneNumber,
          answeringMachineDetection: true,
          clientState
        })

        voiceLogger.info('Telnyx call initiated', {
          data: { callControlId: callControlData.callControlId, to: formattedPhoneNumber, from: fromNumber }
        })

        externalCallId = callControlData.callControlId
        const metadata = callData.metadata as Record<string, unknown>
        metadata.external_id = callControlData.callControlId
        metadata.call_session_id = callControlData.callSessionId
        metadata.call_leg_id = callControlData.callLegId
      }
    } catch (telnyxError) {
      voiceLogger.error('Telnyx call initiation error', { error: telnyxError })
      return NextResponse.json({
        error: `Failed to initiate call: ${telnyxError instanceof Error ? telnyxError.message : 'Unknown error'}`
      }, { status: 500 })
    }

    // Create call record in database
    voiceLogger.debug('Creating call record', { data: { callData } })

    const { data: call, error: dbError } = await supabase.from("calls").insert(callData).select().single()

    if (dbError) {
      voiceLogger.error('Database error creating call record', {
        error: dbError,
        data: { code: dbError.code, message: dbError.message, details: dbError.details, hint: dbError.hint, callData }
      })

      return NextResponse.json({
        error: "Failed to create call record",
        details: dbError.message,
        code: dbError.code,
        hint: dbError.hint
      }, { status: 500 })
    }

    voiceLogger.info('Call record created', { data: { callId: call.id, bridgeFlow: useBridgeFlow } })

    // Update call list contact status if applicable
    if (callListId && contactId) {
      // First get current attempt count
      const { data: contactData } = await supabase.from("call_list_contacts").select("total_attempts").eq("call_list_id", callListId).eq("contact_id", contactId).single()

      await supabase
        .from("call_list_contacts")
        .update({
          status: "in_progress",
          last_attempt_at: new Date().toISOString(),
          total_attempts: (contactData?.total_attempts || 0) + 1
        })
        .eq("call_list_id", callListId)
        .eq("contact_id", contactId)
    }

    // Track usage event for billing
    await supabase.from("usage_events").insert({
      organization_id: member.organization_id,
      resource_type: "call_minutes",
      amount: 0, // Will be updated when call completes
      unit_cost: 0.02, // $0.02 per minute for overage
      total_cost: 0,
      campaign_id: callListId,
      agent_id: user.id,
      contact_id: contactId,
      call_attempt_id: call.id,
      description: `Outbound call to ${formattedPhoneNumber}${useBridgeFlow ? ' (bridge)' : ''}`,
      metadata: {
        call_id: call.id,
        external_id: externalCallId,
        provider: 'telnyx',
        call_control_id: externalCallId,
        call_session_id: callControlData?.callSessionId,
        initiated_at: new Date().toISOString(),
        bridge_flow: useBridgeFlow,
        agent_endpoint: useBridgeFlow ? agentEndpoint : null
      }
    })

    return NextResponse.json({
      success: true,
      callId: call.id,
      externalId: externalCallId,
      status: call.status,
      bridgeStatus: useBridgeFlow ? 'agent_ringing' : null,
      bridgeFlow: useBridgeFlow
    })
  } catch (error) {
    voiceLogger.error('Call initiation error', { error })
    return NextResponse.json(
      { error: 'Failed to initiate call' },
      { status: 500 }
    )
  }
}
