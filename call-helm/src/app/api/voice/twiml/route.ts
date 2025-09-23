import { NextRequest, NextResponse } from 'next/server'

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
    
    console.log('Form data from SignalWire:', { from, to, callSid, direction })
    console.log('Custom parameters:', { targetNumber, agentNumber, isAgentLeg })
    
    // If this is the agent leg of the call, connect them to the target number
    if (isAgentLeg === 'true' && targetNumber) {
      console.log('This is the agent leg - will connect to target number:', targetNumber)
      
      const actionUrl = `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/voice/status`
      const statusCallback = `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/voice/status`
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Connecting your call. Please wait.</Say>
  <Dial callerId="${from}" timeout="30" action="${actionUrl}" method="POST" record="true" recordingStatusCallback="${statusCallback}">
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