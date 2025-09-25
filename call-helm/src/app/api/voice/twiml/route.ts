import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    console.log('=== TWIML ENDPOINT CALLED ===')
    console.log('Request URL:', request.url)
    console.log('Request method:', request.method)
    
    // Parse form data from SignalWire
    const formData = await request.formData()
    const from = formData.get('From') as string
    const to = formData.get('To') as string
    const callSid = formData.get('CallSid') as string
    const direction = formData.get('Direction') as string
    
    // Get custom parameters from URL query string
    const { searchParams } = new URL(request.url)
    const targetNumber = searchParams.get('TargetNumber')
    const agentNumber = searchParams.get('AgentNumber')
    const isAgentLeg = searchParams.get('IsAgentLeg')
    const callId = searchParams.get('CallId') // Pass the call ID for recording preference check
    const organizationId = searchParams.get('OrgId') // Pass org ID for plan check
    const enableRecording = searchParams.get('EnableRecording') === 'true' // Explicit recording preference
    
    console.log('Form data from SignalWire:', { from, to, callSid, direction })
    console.log('Custom parameters:', { targetNumber, agentNumber, isAgentLeg, callId, organizationId, enableRecording })
    
    // If this is the agent leg of the call, connect them to the target number
    if (isAgentLeg === 'true' && targetNumber) {
      console.log('This is the agent leg - will connect to target number:', targetNumber)
      
      // Check if recording should be enabled
      let shouldRecord = false
      let recordingParams = ''
      
      if (enableRecording && organizationId) {
        // Double-check Pro plan status before recording
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        
        const { data: limits } = await supabase
          .from('organization_limits')
          .select('features')
          .eq('organization_id', organizationId)
          .single()
        
        if (limits?.features?.call_recording_transcription === true) {
          shouldRecord = true
          const recordingCallback = `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/voice/recording-complete`
          // Use record-from-answer to capture the entire call from when it's answered
          recordingParams = `record="record-from-answer" recordingStatusCallback="${recordingCallback}" recordingStatusCallbackEvent="completed" recordingStatusCallbackMethod="POST"`
          console.log('Recording ENABLED - Pro plan confirmed (will record entire call)')
        } else {
          console.log('Recording DISABLED - Not on Pro plan')
        }
      } else {
        console.log('Recording DISABLED - Not requested or missing org ID')
      }
      
      const actionUrl = `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/voice/status`
      const statusCallback = `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/voice/status`
      
      // Update call record with recording status if we have a callId
      if (callId && shouldRecord) {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        
        await supabase
          .from('calls')
          .update({ recording_enabled: true })
          .eq('id', callId)
      }
      
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting your call. Please wait.</Say>
  <Dial callerId="${from}" timeout="30" action="${actionUrl}" method="POST" ${recordingParams}>
    <Number statusCallback="${statusCallback}" statusCallbackEvent="initiated ringing answered completed" statusCallbackMethod="POST">${targetNumber}</Number>
  </Dial>
  <Say voice="alice">The call has ended. Goodbye.</Say>
</Response>`
      
      console.log('Returning TwiML to connect agent to contact:')
      console.log(twiml)
      
      return new NextResponse(twiml, {
        status: 200,
        headers: {
          'Content-Type': 'application/xml',
        },
      })
    }
    
    // Default behavior - just play a message
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Hello! This is a call from Call Helm. Connecting you now.</Say>
  <Pause length="1"/>
  <Say voice="alice">Thank you for using Call Helm.</Say>
</Response>`
    
    return new NextResponse(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
      },
    })
  } catch (error) {
    console.error('TwiML generation error:', error)
    
    // Return a basic TwiML response even on error to prevent call from hanging up abruptly
    const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're sorry, an error occurred. Please try again later.</Say>
  <Hangup/>
</Response>`
    
    return new NextResponse(errorTwiml, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
      },
    })
  }
}

// SignalWire might send GET requests for webhook verification
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    status: 'ok',
    message: 'TwiML endpoint active'
  })
}