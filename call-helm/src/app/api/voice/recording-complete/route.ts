import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    console.log('=== RECORDING COMPLETE WEBHOOK ===')
    
    // Parse form data from SignalWire
    const formData = await request.formData()
    const recordingSid = formData.get('RecordingSid') as string
    const recordingUrl = formData.get('RecordingUrl') as string
    const recordingDuration = formData.get('RecordingDuration') as string
    const callSid = formData.get('CallSid') as string
    const recordingStatus = formData.get('RecordingStatus') as string
    
    console.log('Recording webhook data:', {
      recordingSid,
      recordingUrl,
      recordingDuration,
      callSid,
      recordingStatus
    })
    
    if (!recordingSid || !recordingUrl || !callSid) {
      console.error('Missing required recording data')
      return NextResponse.json({ received: true })
    }
    
    // Use service role client to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Find the call record by external_id (call SID)
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('id, organization_id')
      .or(`metadata->>external_id.eq.${callSid},metadata->>contact_call_sid.eq.${callSid}`)
      .single()
    
    if (callError || !call) {
      console.error('Call not found for recording:', callSid)
      return NextResponse.json({ received: true })
    }
    
    console.log('Found call for recording:', call.id)
    
    // Update call record with recording information
    const { error: updateError } = await supabase
      .from('calls')
      .update({
        recording_url: recordingUrl,
        recording_sid: recordingSid,
        transcription_status: 'pending', // Mark as pending for transcription
        metadata: {
          recording_duration: recordingDuration,
          recording_completed_at: new Date().toISOString()
        },
        updated_at: new Date().toISOString()
      })
      .eq('id', call.id)
    
    if (updateError) {
      console.error('Error updating call with recording:', updateError)
      return NextResponse.json({ received: true })
    }
    
    // Create a transcription job
    const { error: jobError } = await supabase
      .from('call_analysis_jobs')
      .insert({
        call_id: call.id,
        organization_id: call.organization_id,
        job_type: 'transcription',
        status: 'pending',
        created_at: new Date().toISOString()
      })
    
    if (jobError) {
      console.error('Error creating transcription job:', jobError)
    }
    
    // Queue transcription processing (this would normally trigger a background job)
    // For now, we'll just log it
    console.log('Recording saved and transcription job queued for call:', call.id)
    
    // In production, you would trigger transcription here:
    // await triggerTranscription(call.id, recordingUrl)
    
    return NextResponse.json({ 
      received: true,
      callId: call.id,
      recordingSid
    })
    
  } catch (error) {
    console.error('Error handling recording webhook:', error)
    return NextResponse.json({ 
      error: 'Recording webhook failed' 
    }, { status: 500 })
  }
}

// SignalWire might send GET requests for verification
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    status: 'ok',
    message: 'Recording webhook endpoint active'
  })
}