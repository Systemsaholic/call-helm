import { NextRequest, NextResponse } from 'next/server'

// TwiML endpoint that speaks the verification code
// This is called by Telnyx when the verification call is answered
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code') || ''

  // Generate TwiML that speaks the verification code
  // The code is already formatted with pauses (e.g., "1. 2. 3. 4. 5. 6")
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice" language="en-US">
    Hello! This is Call Helm calling with your verification code.
  </Say>
  <Pause length="1"/>
  <Say voice="alice" language="en-US">
    Your verification code is:
  </Say>
  <Pause length="1"/>
  <Say voice="alice" language="en-US">
    ${code}
  </Say>
  <Pause length="2"/>
  <Say voice="alice" language="en-US">
    I will repeat the code one more time.
  </Say>
  <Pause length="1"/>
  <Say voice="alice" language="en-US">
    ${code}
  </Say>
  <Pause length="1"/>
  <Say voice="alice" language="en-US">
    This code will expire in 10 minutes. Thank you and goodbye.
  </Say>
</Response>`

  return new NextResponse(twiml, {
    headers: {
      'Content-Type': 'application/xml',
    },
  })
}

// Also handle POST in case Telnyx uses POST
export async function POST(request: NextRequest) {
  return GET(request)
}
