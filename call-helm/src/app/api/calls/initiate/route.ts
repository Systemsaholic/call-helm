import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

// Twilio client setup (conditionally)
let twilioClient: any = null
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  const twilio = require('twilio')
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { 
      contactId, 
      phoneNumber, 
      callListId,
      scriptId,
      provider = 'twilio' // Default to Twilio
    } = await req.json()

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!member?.organization_id) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 })
    }

    // Get script if provided
    let scriptContent = null
    if (scriptId) {
      const { data: script } = await supabase
        .from('scripts')
        .select('content')
        .eq('id', scriptId)
        .eq('organization_id', member.organization_id)
        .single()
      
      scriptContent = script?.content
    }

    // Initiate call based on provider
    let externalCallId = null
    let callData: any = {
      organization_id: member.organization_id,
      contact_id: contactId,
      call_list_id: callListId,
      direction: 'outbound',
      caller_number: process.env.TWILIO_PHONE_NUMBER || 'system',
      called_number: phoneNumber,
      status: 'initiated',
      agent_id: user.id,
      start_time: new Date().toISOString(),
      provider,
      metadata: {
        script_id: scriptId,
        initiated_by: user.id
      }
    }

    if (provider === 'twilio' && twilioClient) {
      try {
        // Initiate call via Twilio
        const call = await twilioClient.calls.create({
          to: phoneNumber,
          from: process.env.TWILIO_PHONE_NUMBER,
          url: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/voice`, // TwiML endpoint
          statusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`,
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          statusCallbackMethod: 'POST',
          record: true, // Enable recording if needed
          recordingStatusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/recording`
        })

        externalCallId = call.sid
        callData.external_id = call.sid
      } catch (twilioError: any) {
        console.error('Twilio call initiation error:', twilioError)
        return NextResponse.json(
          { error: `Failed to initiate call: ${twilioError.message}` },
          { status: 500 }
        )
      }
    } else if (provider === 'signalwire') {
      // SignalWire implementation would go here
      // Similar to Twilio but with SignalWire SDK
      return NextResponse.json(
        { error: 'SignalWire integration not yet implemented' },
        { status: 501 }
      )
    } else {
      // Mock call for development/testing
      externalCallId = `mock-${Date.now()}`
      callData.external_id = externalCallId
      callData.status = 'answered' // Mock as answered for testing
    }

    // Create call record in database
    const { data: call, error: dbError } = await supabase
      .from('calls')
      .insert(callData)
      .select()
      .single()

    if (dbError) {
      console.error('Database error:', dbError)
      return NextResponse.json(
        { error: 'Failed to create call record' },
        { status: 500 }
      )
    }

    // Update call list contact status if applicable
    if (callListId && contactId) {
      // First get current attempt count
      const { data: contactData } = await supabase
        .from('call_list_contacts')
        .select('total_attempts')
        .eq('call_list_id', callListId)
        .eq('contact_id', contactId)
        .single()

      await supabase
        .from('call_list_contacts')
        .update({
          status: 'in_progress',
          last_attempt_at: new Date().toISOString(),
          total_attempts: (contactData?.total_attempts || 0) + 1
        })
        .eq('call_list_id', callListId)
        .eq('contact_id', contactId)
    }

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