import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

// Helper to lazily create Twilio client
let _twilioClient: any = null
function getTwilioClient() {
  if (_twilioClient) return _twilioClient
  const sid = process.env.TWILIO_ACCOUNT_SID
  const auth = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !auth) return null
  // require dynamically so tests/environment without Twilio don't fail at module load
  const twilio = require('twilio')
  _twilioClient = twilio(sid, auth)
  return _twilioClient
}

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
      provider = "twilio" // Default to Twilio
    } = body
    
    console.log('=== CALL INITIATE REQUEST ===')
    console.log('Provider:', provider)
    console.log('Contact ID:', contactId)
    console.log('Phone Number (raw):', phoneNumber)
    console.log('Call List ID:', callListId)
    console.log('Script ID:', scriptId)
    console.log('User ID:', user?.id)

    if (!phoneNumber) {
      console.error('ERROR: No phone number provided')
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

    console.log('Formatted phone number:', formattedPhoneNumber)
    
    // Validate E.164 phone number
    if (!PHONE_E164_REGEX.test(formattedPhoneNumber)) {
      console.error('ERROR: Invalid phone number format:', formattedPhoneNumber)
      return NextResponse.json({ error: "Invalid phone number format" }, { status: 400 })
    }

    // Get user's organization and member details
    const { data: member, error: memberError } = await supabase
      .from("organization_members")
      .select("id, organization_id, phone")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .single()
    
    console.log('Member lookup result:', { member, error: memberError })

    if (!member?.organization_id) {
      console.error('ERROR: No organization found for user')
      return NextResponse.json({ error: "No organization found" }, { status: 400 })
    }
    
    console.log('Organization ID:', member.organization_id)
    console.log('Member ID:', member.id)
    console.log('Member Phone:', member.phone)

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

    // Initiate call based on provider
    let externalCallId = null
    let callData: any = {
      organization_id: member.organization_id,
      contact_id: contactId || null,
      direction: "outbound",
      caller_number: process.env.TWILIO_PHONE_NUMBER || "system",
      called_number: formattedPhoneNumber,
      status: "answered",  // Using 'answered' as the initial status since 'initiated' isn't valid
      member_id: member.id,
      start_time: new Date().toISOString(),
      metadata: {
        call_list_id: callListId,
        script_id: scriptId,
        initiated_by: user.id,
        provider,
        initial_status: "initiated"  // Store the actual initial status in metadata
      }
    }

    if (provider === "twilio") {
      const twilioClient = getTwilioClient()
      if (!twilioClient) {
        return NextResponse.json({ error: "Twilio credentials not configured" }, { status: 500 })
      }
      try {
        // Initiate call via Twilio
        const call = await twilioClient.calls.create({
          to: formattedPhoneNumber,
          from: process.env.TWILIO_PHONE_NUMBER,
          // Use server-side APP_URL for webhook callbacks
          url: `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/voice`, // TwiML endpoint
          statusCallback: `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`,
          statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
          statusCallbackMethod: "POST",
          record: true, // Enable recording if needed
          recordingStatusCallback: `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/recording`
        })

        externalCallId = call.sid
        callData.metadata.external_id = call.sid
      } catch (twilioError: any) {
        console.error("Twilio call initiation error:", twilioError)
        return NextResponse.json({ error: `Failed to initiate call: ${twilioError.message}` }, { status: 500 })
      }
    } else if (provider === "signalwire") {
      console.log('=== SIGNALWIRE CALL FLOW ===')
      
      // Import SignalWire service
      const { signalwireService } = await import('@/lib/services/signalwire')
      
      // Get the organization's primary phone number for SignalWire
      const { data: phoneNumberData, error: phoneError } = await supabase
        .from("phone_numbers")
        .select("number")
        .eq("organization_id", member.organization_id)
        .eq("provider", "signalwire")
        .eq("is_primary", true)
        .single()
      
      console.log('SignalWire phone lookup:', { phoneNumberData, phoneError })
      
      if (!phoneNumberData?.number) {
        console.error('ERROR: No SignalWire phone number configured')
        return NextResponse.json({ error: "No SignalWire phone number configured" }, { status: 400 })
      }
      
      console.log('SignalWire phone number:', phoneNumberData.number)
      
      // The member.phone was already fetched above
      if (!member?.phone) {
        console.error('ERROR: Agent has no phone number configured')
        return NextResponse.json({ 
          error: "Your phone number is not configured. Please update your profile with a phone number." 
        }, { status: 400 })
      }
      
      // Format agent's phone number
      let agentPhone = member.phone.replace(/[\s()-]/g, "")
      if (!agentPhone.startsWith('+')) {
        if (agentPhone.length === 10) {
          agentPhone = '+1' + agentPhone
        } else if (agentPhone.length === 11 && agentPhone.startsWith('1')) {
          agentPhone = '+' + agentPhone
        } else {
          agentPhone = '+' + agentPhone
        }
      }
      
      console.log('Agent phone (formatted):', agentPhone)
      console.log('Contact phone (formatted):', formattedPhoneNumber)
      console.log('Will call agent first, then connect to contact')
      
      try {
        // For click-to-call, we call the agent first, then connect them to the contact
        // We'll pass the target number as a parameter to the TwiML endpoint
        console.log('Initiating SignalWire call with params:')
        console.log('  From:', phoneNumberData.number)
        console.log('  To (Agent):', agentPhone)
        console.log('  Target (Contact):', formattedPhoneNumber)
        
        // Check if user wants to record and has Pro plan
        const { data: userPrefs } = await supabase
          .from('organization_members')
          .select('default_record_calls')
          .eq('id', member.id)
          .single()
        
        const { data: limits } = await supabase
          .from('organization_limits')
          .select('features')
          .eq('organization_id', member.organization_id)
          .single()
        
        const canRecord = limits?.features?.call_recording_transcription === true
        const wantsToRecord = userPrefs?.default_record_calls === true // TODO: Add toggle in UI
        const enableRecording = canRecord && wantsToRecord
        
        if (wantsToRecord && !canRecord) {
          console.log('User wants to record but not on Pro plan')
        }
        
        const callSid = await signalwireService.initiateCallWithParams({
          from: phoneNumberData.number,
          to: agentPhone, // Call the agent first
          callerId: phoneNumberData.number,
          recordingEnabled: false, // Don't use SW's built-in recording, we control it via TwiML
          params: {
            TargetNumber: formattedPhoneNumber, // The contact to connect to
            IsAgentLeg: 'true',
            CallId: callData.id, // Pass call ID for updating recording status
            OrgId: member.organization_id, // Pass org ID for plan check
            EnableRecording: enableRecording ? 'true' : 'false' // Pass recording preference
          }
        })
        
        console.log('SignalWire call initiated successfully! SID:', callSid)
        
        externalCallId = callSid
        callData.metadata.external_id = callSid
        callData.metadata.agent_phone = agentPhone
        callData.metadata.contact_phone = formattedPhoneNumber
        callData.caller_number = phoneNumberData.number
      } catch (signalwireError: any) {
        console.error("SignalWire call initiation error:", signalwireError)
        return NextResponse.json({ 
          error: `Failed to initiate call: ${signalwireError.message}` 
        }, { status: 500 })
      }
    } else {
      // Mock call for development/testing
      externalCallId = `mock-${Date.now()}`
      callData.metadata.external_id = externalCallId
      callData.status = "answered" // Mock as answered for testing
    }

    // Create call record in database
    console.log('=== CREATING CALL RECORD ===')
    console.log('Call data to insert:', JSON.stringify(callData, null, 2))
    
    const { data: call, error: dbError } = await supabase.from("calls").insert(callData).select().single()

    if (dbError) {
      console.error("=== DATABASE ERROR ===")
      console.error("Error code:", dbError.code)
      console.error("Error message:", dbError.message)
      console.error("Error details:", dbError.details)
      console.error("Error hint:", dbError.hint)
      console.error("Call data attempted:", callData)
      
      return NextResponse.json({ 
        error: "Failed to create call record",
        details: dbError.message,
        code: dbError.code,
        hint: dbError.hint
      }, { status: 500 })
    }
    
    console.log('Call record created successfully:', call.id)

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
        provider,
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
    console.error('Call initiation error:', error)
    return NextResponse.json(
      { error: 'Failed to initiate call' },
      { status: 500 }
    )
  }
}