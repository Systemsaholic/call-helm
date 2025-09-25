import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// TEST ENDPOINT - Not for production use
// This endpoint allows re-transcribing calls for testing purposes
export async function POST(request: NextRequest) {
  try {
    console.log('=== TEST RETRANSCRIBE ENDPOINT ===')
    
    const body = await request.json()
    const { callId } = body
    
    if (!callId) {
      return NextResponse.json({ 
        error: 'Missing callId' 
      }, { status: 400 })
    }
    
    // Use service role client to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Get the call record
    const { data: call, error: callError } = await supabase
      .from('calls')
      .select('id, recording_url, recording_sid, organization_id')
      .eq('id', callId)
      .single()
    
    if (callError || !call) {
      return NextResponse.json({ error: 'Call not found' }, { status: 404 })
    }
    
    if (!call.recording_url) {
      return NextResponse.json({ error: 'No recording available' }, { status: 400 })
    }
    
    console.log('Re-transcribing call:', callId)
    console.log('Recording URL:', call.recording_url)
    console.log('Recording SID:', call.recording_sid)
    
    // Clear existing transcription and analysis
    await supabase
      .from('calls')
      .update({
        transcription: null,
        transcription_status: 'processing',
        ai_analysis: null,
        mood_sentiment: null,
        key_points: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', callId)
    
    // Trigger transcription
    const transcriptionUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''
    
    const transcriptionResponse = await fetch(`${transcriptionUrl}/api/transcription/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callId: call.id,
        recordingUrl: call.recording_url,
        recordingSid: call.recording_sid
      })
    })
    
    if (!transcriptionResponse.ok) {
      const error = await transcriptionResponse.text()
      console.error('Transcription failed:', error)
      return NextResponse.json({
        error: 'Transcription failed',
        details: error
      }, { status: 500 })
    }
    
    const result = await transcriptionResponse.json()
    
    return NextResponse.json({
      success: true,
      message: 'Re-transcription started',
      callId: callId,
      result
    })
    
  } catch (error) {
    console.error('Re-transcribe error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Test helper to list recent calls with recordings
export async function GET() {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { data: calls, error } = await supabase
      .from('calls')
      .select('id, caller_number, called_number, start_time, recording_url, transcription_status')
      .not('recording_url', 'is', null)
      .order('start_time', { ascending: false })
      .limit(10)
    
    if (error) throw error
    
    return NextResponse.json({
      message: 'Recent calls with recordings',
      usage: 'POST /api/test/retranscribe with { "callId": "<id>" }',
      calls: calls?.map(c => ({
        id: c.id,
        from: c.caller_number,
        to: c.called_number,
        date: c.start_time,
        has_transcription: !!c.transcription_status
      }))
    })
    
  } catch (error) {
    return NextResponse.json({
      error: 'Failed to fetch calls',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}