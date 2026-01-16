import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { voiceLogger } from '@/lib/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ callId: string }> }
) {
  try {
    const { callId } = await params
    
    // Get authenticated user
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get the call and verify user has access
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('id, recording_url, recording_sid, organization_id, transcription_status')
      .eq('id', callId)
      .single()

    if (callError || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 })
    }

    // Verify user has access to this organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('organization_id', call.organization_id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Check if call has a recording
    if (!call.recording_url) {
      return NextResponse.json({ 
        error: 'No recording available for this call' 
      }, { status: 400 })
    }

    // Check if transcription is already in progress
    if (call.transcription_status === 'processing') {
      return NextResponse.json({ 
        message: 'Transcription already in progress',
        status: 'processing'
      })
    }

    voiceLogger.info('Manual transcription trigger', { data: { callId } })
    
    // Trigger transcription processing
    try {
      const transcriptionResponse = await fetch(`${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/transcription/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callId: call.id,
          recordingUrl: call.recording_url,
          recordingSid: call.recording_sid // Pass SID for proxy authentication
        })
      })
      
      if (!transcriptionResponse.ok) {
        const errorText = await transcriptionResponse.text()
        voiceLogger.error('Failed to trigger transcription', { error: new Error(errorText) })
        return NextResponse.json({
          error: 'Failed to start transcription',
          details: errorText
        }, { status: 500 })
      }
      
      const result = await transcriptionResponse.json()
      voiceLogger.info('Transcription triggered successfully', { data: { result } })
      
      return NextResponse.json({
        message: 'Transcription started successfully',
        callId: call.id,
        status: 'processing'
      })
      
    } catch (transcriptionError) {
      voiceLogger.error('Error triggering transcription', { error: transcriptionError })
      return NextResponse.json({
        error: 'Failed to start transcription',
        details: transcriptionError instanceof Error ? transcriptionError.message : 'Unknown error'
      }, { status: 500 })
    }
    
  } catch (error) {
    voiceLogger.error('Manual transcription trigger error', { error })
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}