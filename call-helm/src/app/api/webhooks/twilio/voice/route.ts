import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Validate Twilio request signature
async function validateTwilioRequest(req: NextRequest): Promise<boolean> {
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const signature = req.headers.get('x-twilio-signature') || ''
  if (!authToken || !signature) return false

  // Build full URL - prefer server-side APP_URL
  const base = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''
  const url = base + req.nextUrl.pathname

  // Convert formData to plain object
  const form = await req.formData()
  const params: Record<string, string> = {}
  form.forEach((value, key) => {
    params[key] = String(value)
  })

  try {
    const twilio = require('twilio')
    return twilio.validateRequest(authToken, signature, url, params)
  } catch (err) {
    console.error('Twilio validation error:', err)
    return false
  }
}

// TwiML voice response handler
export async function POST(req: NextRequest) {
  try {
    // Validate request originates from Twilio
    const isValid = await validateTwilioRequest(req)
    if (!isValid) return NextResponse.json({ error: "Invalid Twilio signature" }, { status: 401 })

    const formData = await req.formData()
    const callSid = formData.get("CallSid") as string
    const from = formData.get("From") as string
    const to = formData.get("To") as string

    // Get call data from database
    const supabase = await createClient()
    const { data: call } = await supabase.from("calls").select("*, scripts(content)").eq("external_id", callSid).single()

    // Generate TwiML response
    let twimlResponse = '<?xml version="1.0" encoding="UTF-8"?><Response>'

    if (call?.scripts?.content) {
      // Use script content if available
      const scriptText = call.scripts.content
        .replace(/\[Contact Name\]/g, "valued customer")
        .replace(/\[Agent Name\]/g, "your representative")
        .replace(/\[Company Name\]/g, "Call Helm")

      twimlResponse += `<Say voice="alice">${scriptText}</Say>`
    } else {
      // Default message
      twimlResponse += '<Say voice="alice">Hello, this is a call from Call Helm. Thank you for your time.</Say>'
    }

    // Add recording and gather input
    twimlResponse += `
      <Gather numDigits="1" action="${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio/gather" method="POST">
        <Say>Press 1 if you would like to speak with a representative, or press 2 to be removed from our list.</Say>
      </Gather>
      <Say>We didn't receive any input. Goodbye!</Say>
    </Response>`

    return new NextResponse(twimlResponse, {
      status: 200,
      headers: {
        "Content-Type": "text/xml"
      }
    })
  } catch (error) {
    console.error('TwiML voice error:', error)
    
    // Return fallback TwiML
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say>We're sorry, there was an error processing your call. Please try again later.</Say>
      </Response>`
    
    return new NextResponse(fallbackTwiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml'
      }
    })
  }
}

// Handle GET requests (Twilio may use GET for initial webhook)
export async function GET(req: NextRequest) {
  return POST(req)
}