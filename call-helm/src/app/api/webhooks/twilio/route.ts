import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import twilio from 'twilio'

// Twilio webhook handler for call events
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const formData = await req.formData()
    
    // Parse Twilio webhook data
    const callSid = formData.get('CallSid') as string
    const callStatus = formData.get('CallStatus') as string
    const from = formData.get('From') as string
    const to = formData.get('To') as string
    const direction = formData.get('Direction') as string
    const duration = formData.get('CallDuration') as string
    const recordingUrl = formData.get('RecordingUrl') as string
    
    // Validate webhook signature (optional but recommended)
    const twilioSignature = req.headers.get('x-twilio-signature')
    if (process.env.TWILIO_AUTH_TOKEN) {
      const url = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/twilio`
      const params = Object.fromEntries(formData.entries())
      const isValid = twilio.validateRequest(
        process.env.TWILIO_AUTH_TOKEN,
        twilioSignature || '',
        url,
        params
      )
      
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    // Map Twilio status to our status
    const statusMap: Record<string, string> = {
      'queued': 'queued',
      'ringing': 'ringing',
      'in-progress': 'in_progress',
      'completed': 'completed',
      'busy': 'busy',
      'failed': 'failed',
      'no-answer': 'no_answer'
    }

    const mappedStatus = statusMap[callStatus] || 'unknown'

    // Handle different call events
    switch (callStatus) {
      case 'initiated':
      case 'ringing':
        // Create or update call record
        await supabase.from('calls').upsert({
          external_id: callSid,
          provider: 'twilio',
          direction: direction === 'outbound-api' ? 'outbound' : 'inbound',
          caller_number: from,
          called_number: to,
          status: mappedStatus,
          start_time: new Date().toISOString(),
          metadata: {
            twilio_sid: callSid,
            twilio_status: callStatus
          }
        }, {
          onConflict: 'external_id'
        })
        break

      case 'in-progress':
        // Update call as answered
        await supabase
          .from('calls')
          .update({
            status: 'answered',
            answered_at: new Date().toISOString()
          })
          .eq('external_id', callSid)
        break

      case 'completed':
        // Update call with final details
        await supabase
          .from('calls')
          .update({
            status: 'completed',
            end_time: new Date().toISOString(),
            duration: parseInt(duration || '0'),
            recording_url: recordingUrl,
            metadata: {
              twilio_sid: callSid,
              twilio_status: callStatus,
              final_duration: duration
            }
          })
          .eq('external_id', callSid)
        break

      case 'busy':
      case 'no-answer':
      case 'failed':
        // Update call as failed/busy/no-answer
        await supabase
          .from('calls')
          .update({
            status: mappedStatus,
            end_time: new Date().toISOString(),
            metadata: {
              twilio_sid: callSid,
              twilio_status: callStatus
            }
          })
          .eq('external_id', callSid)
        break
    }

    // Return TwiML response if needed
    const twimlResponse = `<?xml version="1.0" encoding="UTF-8"?>
      <Response>
        <Say>Call status recorded</Say>
      </Response>`

    return new NextResponse(twimlResponse, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml'
      }
    })
  } catch (error) {
    console.error('Twilio webhook error:', error)
    return NextResponse.json(
      { error: 'Failed to process webhook' },
      { status: 500 }
    )
  }
}