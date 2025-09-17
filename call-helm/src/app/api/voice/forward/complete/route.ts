import { NextRequest, NextResponse } from 'next/server'

// Handle the completion of forwarding (after dial ends)
export async function POST(request: NextRequest) {
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