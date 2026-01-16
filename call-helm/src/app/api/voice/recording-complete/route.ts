import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { voiceLogger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    voiceLogger.info('Recording complete webhook received')

    // Parse form data from Telnyx
    const formData = await request.formData()
    const recordingSid = formData.get('RecordingSid') as string
    const recordingUrl = formData.get('RecordingUrl') as string
    const recordingDuration = formData.get('RecordingDuration') as string
    const callSid = formData.get('CallSid') as string
    const recordingStatus = formData.get('RecordingStatus') as string

    voiceLogger.debug('Recording webhook data', {
      data: { recordingSid, recordingUrl, recordingDuration, callSid, recordingStatus }
    })

    if (!recordingSid || !recordingUrl || !callSid) {
      voiceLogger.error('Missing required recording data')
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
      voiceLogger.error('Call not found for recording', { data: { callSid } })
      return NextResponse.json({ received: true })
    }

    voiceLogger.debug('Found call for recording', { data: { callId: call.id } })
    
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
      voiceLogger.error('Error updating call with recording', { error: updateError })
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
      voiceLogger.error('Error creating transcription job', { error: jobError })
    }

    // Queue transcription processing
    voiceLogger.info('Recording saved, triggering transcription', { data: { callId: call.id } })
    
    // Trigger transcription processing asynchronously
    try {
      const transcriptionResponse = await fetch(`${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/transcription/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callId: call.id,
          recordingUrl: recordingUrl
        })
      })
      
      if (!transcriptionResponse.ok) {
        voiceLogger.error('Failed to trigger transcription', { data: { status: transcriptionResponse.statusText } })
      } else {
        voiceLogger.info('Transcription triggered successfully')
      }
    } catch (transcriptionError) {
      voiceLogger.error('Error triggering transcription', { error: transcriptionError })
    }
    
    return NextResponse.json({ 
      received: true,
      callId: call.id,
      recordingSid
    })
    
  } catch (error) {
    voiceLogger.error('Error handling recording webhook', { error })
    return NextResponse.json({
      error: 'Recording webhook failed'
    }, { status: 500 })
  }
}

// Telnyx might send GET requests for verification
export async function GET(request: NextRequest) {
  return NextResponse.json({ 
    status: 'ok',
    message: 'Recording webhook endpoint active'
  })
}