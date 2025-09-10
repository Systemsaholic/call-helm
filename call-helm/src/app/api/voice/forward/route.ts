import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Get incoming call data from SignalWire
    const formData = await request.formData()
    const callSid = formData.get('CallSid') as string
    const from = formData.get('From') as string
    const to = formData.get('To') as string
    
    console.log('Incoming call for forwarding:', {
      callSid,
      from,
      to
    })

    // Look up forwarding configuration
    const { data: phoneNumber } = await supabase
      .from('phone_numbers')
      .select('forwarding_destination, organization_id, friendly_name')
      .eq('number', to)
      .eq('forwarding_enabled', true)
      .single()

    if (!phoneNumber || !phoneNumber.forwarding_destination) {
      // No forwarding configured, send to voicemail
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>The number you have reached is not available. Please leave a message after the beep.</Say>
  <Record 
    maxLength="120" 
    recordingStatusCallback="${process.env.NEXT_PUBLIC_APP_URL}/api/voice/voicemail"
    transcribe="true"
    transcribeCallback="${process.env.NEXT_PUBLIC_APP_URL}/api/voice/transcribe"
  />
  <Say>Thank you for your message. Goodbye.</Say>
  <Hangup/>
</Response>`

      return new NextResponse(twiml, {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    // Create call record
    await supabase
      .from('calls')
      .insert({
        organization_id: phoneNumber.organization_id,
        call_sid: callSid,
        from_number: from,
        to_number: to,
        direction: 'inbound',
        status: 'forwarding',
        started_at: new Date().toISOString()
      })

    // Forward the call with recording
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting your call to ${phoneNumber.friendly_name || 'the business'}. Please wait.</Say>
  <Dial 
    record="record-from-answer" 
    recordingStatusCallback="${process.env.NEXT_PUBLIC_APP_URL}/api/voice/recording"
    action="${process.env.NEXT_PUBLIC_APP_URL}/api/voice/forward/complete"
    timeout="30"
  >
    <Number 
      statusCallbackEvent="initiated ringing answered completed"
      statusCallback="${process.env.NEXT_PUBLIC_APP_URL}/api/voice/status"
    >${phoneNumber.forwarding_destination}</Number>
  </Dial>
</Response>`

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    })
  } catch (error) {
    console.error('Error handling call forwarding:', error)
    
    // Error response with fallback
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, but we cannot connect your call at this time. Please try again later.</Say>
  <Hangup/>
</Response>`

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    })
  }
}

// Handle the completion of forwarding (after dial ends)
export async function POST_COMPLETE(request: NextRequest) {
  try {
    const formData = await request.formData()
    const dialCallStatus = formData.get('DialCallStatus') as string
    
    // Check if the call was answered
    if (dialCallStatus !== 'completed' && dialCallStatus !== 'answered') {
      // Call was not answered, send to voicemail
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>The person you're trying to reach is unavailable. Please leave a message after the beep.</Say>
  <Record 
    maxLength="120" 
    recordingStatusCallback="${process.env.NEXT_PUBLIC_APP_URL}/api/voice/voicemail"
    transcribe="true"
    transcribeCallback="${process.env.NEXT_PUBLIC_APP_URL}/api/voice/transcribe"
  />
  <Say>Thank you for your message. Goodbye.</Say>
  <Hangup/>
</Response>`

      return new NextResponse(twiml, {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    // Call was completed successfully
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    })
  } catch (error) {
    console.error('Error handling forward completion:', error)
    
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Hangup/>
</Response>`

    return new NextResponse(twiml, {
      headers: { 'Content-Type': 'text/xml' }
    })
  }
}