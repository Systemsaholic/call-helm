import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { TelnyxService } from '@/lib/services/telnyx'

// Initialize Telnyx service
const telnyx = new TelnyxService()

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user }
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get request body
    const body = await request.json()
    const { contactId, phoneNumber, callListContactId, campaignId, agentId } = body

    // Validate required fields
    if (!phoneNumber) {
      return NextResponse.json(
        {
          error: "Phone number is required"
        },
        { status: 400 }
      )
    }

    // Validate phone number format (E.164)
    const phoneRegex = /^\+?[1-9]\d{1,14}$/
    if (!phoneRegex.test(phoneNumber.replace(/[\s()-]/g, ""))) {
      return NextResponse.json(
        {
          error: "Invalid phone number format"
        },
        { status: 400 }
      )
    }

    // Get user's organization and member info
    const { data: member } = await supabase.from("organization_members").select("id, organization_id").eq("user_id", user.id).single()

    if (!member) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 })
    }

    // Check if organization can make calls (billing check)
    const { data: canCall } = await supabase.rpc("can_make_call", { p_org_id: member.organization_id })

    if (!canCall) {
      return NextResponse.json(
        {
          error: "Unable to make calls. Please check your subscription and balance."
        },
        { status: 402 }
      )
    }

    // Get organization's phone number (from number)
    const { data: phoneNumbers, error: phoneError } = await supabase
      .from('phone_numbers')
      .select('number, status, auto_record')
      .eq('organization_id', member.organization_id)
      .in('status', ['active'])
      .order('is_primary', { ascending: false })
      .limit(1)

    if (phoneError || !phoneNumbers || phoneNumbers.length === 0) {
      return NextResponse.json({
        error: 'Organization phone number not configured. Please add a phone number in Settings.'
      }, { status: 400 })
    }

    const fromPhoneNumber = phoneNumbers[0]
    const fromNumber = fromPhoneNumber.number

    // Check if Telnyx is configured
    if (!TelnyxService.isConfigured()) {
      console.error('Telnyx not configured')
      return NextResponse.json({ error: 'Voice service not configured' }, { status: 503 })
    }

    // Initiate call via Telnyx Call Control API
    let callData: { callControlId: string; callSessionId: string; callLegId: string }
    try {
      // Build client state with context for webhooks
      const clientState = JSON.stringify({
        organizationId: member.organization_id,
        agentId: agentId || member.id,
        contactId,
        callListContactId,
        campaignId,
        autoRecord: fromPhoneNumber.auto_record !== false
      })

      callData = await telnyx.initiateCall({
        from: fromNumber,
        to: phoneNumber,
        answeringMachineDetection: true,
        clientState
      })

      console.log('Telnyx call initiated:', {
        callControlId: callData.callControlId,
        to: phoneNumber,
        from: fromNumber
      })
    } catch (error) {
      console.error('Telnyx call error:', error)
      return NextResponse.json(
        {
          error: 'Failed to initiate call. Please try again.'
        },
        { status: 500 }
      )
    }

    // Create call attempt record
    const { data: callAttempt, error: attemptError } = await supabase
      .from("call_attempts")
      .insert({
        organization_id: member.organization_id,
        agent_id: agentId || member.id,
        contact_id: contactId,
        call_list_contact_id: callListContactId,
        campaign_id: campaignId,
        phone_number: phoneNumber,
        direction: "outbound",
        start_time: new Date().toISOString(),
        disposition: "initiated",
        provider_call_id: callData.callControlId,
        metadata: {
          initiated_by: user.id,
          initiated_at: new Date().toISOString(),
          provider: 'telnyx',
          call_session_id: callData.callSessionId,
          call_leg_id: callData.callLegId
        }
      })
      .select()
      .single()

    if (attemptError) {
      console.error("Error creating call attempt:", attemptError)
    }

    // Track call minute usage (estimated 1 minute per call initiation)
    if (callAttempt) {
      await supabase.from("usage_events").insert({
        organization_id: member.organization_id,
        resource_type: "call_minutes",
        amount: 1, // Initial estimate, will be updated by webhook
        unit_cost: 0.025,
        total_cost: 0.025,
        campaign_id: campaignId,
        agent_id: agentId || member.id,
        contact_id: contactId,
        call_attempt_id: callAttempt.id,
        description: `Outbound call initiated to ${phoneNumber}`,
        metadata: {
          phone_number: phoneNumber,
          provider: 'telnyx',
          call_control_id: callData.callControlId,
          call_session_id: callData.callSessionId,
          estimated: true
        }
      })
    }

    // Update call_list_contact if applicable
    if (callListContactId) {
      await supabase
        .from("call_list_contacts")
        .update({
          status: "in_progress",
          last_attempt_at: new Date().toISOString()
        })
        .eq("id", callListContactId)
    }

    // Return success without exposing provider details
    return NextResponse.json({
      success: true,
      callId: callAttempt?.id,
      message: "Call initiated successfully",
      phoneNumber: phoneNumber
    })
  } catch (error) {
    console.error('Call initiation error:', error)
    return NextResponse.json({ 
      error: 'Failed to initiate call' 
    }, { status: 500 })
  }
}

// End an active call
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const callId = searchParams.get('callId')

    if (!callId) {
      return NextResponse.json({ error: 'Call ID required' }, { status: 400 })
    }

    // Get call attempt to find provider call ID (call_control_id for Telnyx)
    const { data: callAttempt } = await supabase
      .from('call_attempts')
      .select('provider_call_id, organization_id')
      .eq('id', callId)
      .single()

    if (!callAttempt) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 })
    }

    if (!callAttempt.provider_call_id) {
      return NextResponse.json({ error: 'Call control ID not found' }, { status: 404 })
    }

    // End call via Telnyx Call Control API
    try {
      await telnyx.hangupCall(callAttempt.provider_call_id)
      console.log('Telnyx call ended:', callAttempt.provider_call_id)
    } catch (error) {
      console.error('Error ending Telnyx call:', error)
      // Continue to update the record even if the hangup fails
      // (the call may have already ended)
    }

    // Update call attempt
    await supabase
      .from('call_attempts')
      .update({
        end_time: new Date().toISOString(),
        disposition: 'ended_by_agent'
      })
      .eq('id', callId)

    return NextResponse.json({
      success: true,
      message: 'Call ended'
    })

  } catch (error) {
    console.error('End call error:', error)
    return NextResponse.json({ error: 'Failed to end call' }, { status: 500 })
  }
}