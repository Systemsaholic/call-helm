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
      scriptId
    } = body

    voiceLogger.info('Call initiate request', {
      data: { provider: 'telnyx', contactId, phoneNumber, callListId, scriptId, userId: user?.id }
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

    // Get user's organization and member details
    const { data: member, error: memberError } = await supabase
      .from("organization_members")
      .select("id, organization_id, phone")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single()
    
    voiceLogger.debug('Member lookup result', { data: { member, error: memberError } })

    if (!member?.organization_id) {
      voiceLogger.error('No organization found for user')
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }

    voiceLogger.debug('Organization context', {
      data: { organizationId: member.organization_id, memberId: member.id, memberPhone: member.phone }
    })

    // Check usage limits before allowing call
    const { data: usageData } = await supabase.from("usage_tracking").select("used_amount, tier_included").eq("organization_id", member.organization_id).eq("resource_type", "call_minutes").gte("billing_period_end", new Date().toISOString()).single()

    const { data: orgData } = await supabase.from("organizations").select("subscription_tier").eq("id", member.organization_id).single()

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
    
    voiceLogger.debug('Recording check', { data: { canRecord, wantsToRecord, enableRecording } })

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

    // Initiate call via Telnyx
    let externalCallId: string | null = null
    let callControlData: { callControlId: string; callSessionId: string; callLegId: string } | null = null

    let callData: any = {
      organization_id: member.organization_id,
      contact_id: contactId || null,
      direction: "outbound",
      caller_number: fromNumber,
      called_number: formattedPhoneNumber,
      status: "answered",  // Using 'answered' as the initial status since 'initiated' isn't valid
      member_id: member.id,
      start_time: new Date().toISOString(),
      recording_enabled: enableRecording,
      metadata: {
        call_list_id: callListId,
        script_id: scriptId,
        initiated_by: user.id,
        provider: 'telnyx',
        initial_status: "initiated"
      }
    }

    try {
      // Build client state with context for webhooks
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
      callData.metadata.external_id = callControlData.callControlId
      callData.metadata.call_session_id = callControlData.callSessionId
      callData.metadata.call_leg_id = callControlData.callLegId
    } catch (telnyxError: any) {
      voiceLogger.error('Telnyx call initiation error', { error: telnyxError })
      return NextResponse.json({
        error: `Failed to initiate call: ${telnyxError.message}`
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

    voiceLogger.info('Call record created', { data: { callId: call.id } })

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
      description: `Outbound call to ${formattedPhoneNumber}`,
      metadata: {
        call_id: call.id,
        external_id: externalCallId,
        provider: 'telnyx',
        call_control_id: externalCallId,
        call_session_id: callControlData?.callSessionId,
        initiated_at: new Date().toISOString()
      }
    })

    return NextResponse.json({
      success: true,
      callId: call.id,
      externalId: externalCallId,
      status: call.status
    })
  } catch (error) {
    voiceLogger.error('Call initiation error', { error })
    return NextResponse.json(
      { error: 'Failed to initiate call' },
      { status: 500 }
    )
  }
}