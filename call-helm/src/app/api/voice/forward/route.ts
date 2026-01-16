import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import crypto from "crypto"
import { voiceLogger } from '@/lib/logger'

function timingSafeCompare(a: string, b: string): boolean {
  const aa = Buffer.from(a || "", "utf8")
  const bb = Buffer.from(b || "", "utf8")
  if (aa.length !== bb.length) return false
  return crypto.timingSafeEqual(aa, bb)
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Read raw body and verify signature
    const rawBody = await request.text()
    const signature = request.headers.get("x-signalwire-signature") || request.headers.get("x-webhook-signature") || ""

    // Attempt to look up webhook secret for the receiving number before parsing
    const params = new URLSearchParams(rawBody)
    const callSid = params.get("CallSid") || ""
    const from = params.get("From") || ""
    const to = params.get("To") || ""

    // Ensure required params present
    if (!callSid || !from || !to) {
      voiceLogger.error("Missing required webhook form fields", { data: { callSid, from, to } })
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>\n<Response>\n  <Say>We could not process this call due to missing data. Goodbye.</Say>\n  <Hangup/>\n</Response>`
      return new NextResponse(twiml, { headers: { "Content-Type": "text/xml" }, status: 400 })
    }

    // Find webhook secret for 'to' number
    const { data: integration } = await supabase.from("voice_integrations").select("webhook_secret").contains("phone_numbers", [to]).single()

    const webhookSecret = integration?.webhook_secret
    if (webhookSecret) {
      const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex")
      if (!timingSafeCompare(expected, signature)) {
        voiceLogger.warn("Invalid SignalWire signature for forwarding")
        return new NextResponse("Invalid signature", { status: 403 })
      }
    }

    voiceLogger.info("Incoming call for forwarding", { data: { callSid, from, to } })

    // Look up forwarding configuration
    const { data: phoneNumber } = await supabase.from("phone_numbers").select("forwarding_destination, organization_id, friendly_name").eq("number", to).eq("forwarding_enabled", true).single()

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
        headers: { "Content-Type": "text/xml" }
      })
    }

    // Create call record
    await supabase.from("calls").insert({
      organization_id: phoneNumber.organization_id,
      call_sid: callSid,
      from_number: from,
      to_number: to,
      direction: "inbound",
      status: "forwarding",
      started_at: new Date().toISOString()
    })

    // Forward the call with recording
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Connecting your call to ${phoneNumber.friendly_name || "the business"}. Please wait.</Say>
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
      headers: { "Content-Type": "text/xml" }
    })
  } catch (error) {
    voiceLogger.error('Error handling call forwarding', { error })
    
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