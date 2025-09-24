import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// OpenAI Whisper transcription service
async function transcribeWithWhisper(audioUrl: string, recordingSid?: string): Promise<string> {
  const openaiApiKey = process.env.OPENAI_API_KEY
  
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured')
  }

  try {
    // If we have a recording SID, use our proxy endpoint
    // Otherwise, try direct URL (for non-SignalWire recordings)
    let fetchUrl = audioUrl
    const headers: HeadersInit = {}
    
    if (recordingSid) {
      // Use proxy endpoint for SignalWire recordings
      const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''
      fetchUrl = `${baseUrl}/api/recordings/${recordingSid}`
    } else if (audioUrl.includes('signalwire.com')) {
      // Add SignalWire authentication for direct URLs
      const swProjectId = process.env.SIGNALWIRE_PROJECT_ID
      const swApiToken = process.env.SIGNALWIRE_API_TOKEN
      
      if (swProjectId && swApiToken) {
        const auth = Buffer.from(`${swProjectId}:${swApiToken}`).toString('base64')
        headers['Authorization'] = `Basic ${auth}`
      }
    }
    
    console.log('Fetching audio from:', fetchUrl)
    
    // First, fetch the audio file
    const audioResponse = await fetch(fetchUrl, { headers })
    if (!audioResponse.ok) {
      throw new Error(`Failed to fetch audio: ${audioResponse.statusText}`)
    }
    
    const audioBlob = await audioResponse.blob()
    
    // Create form data for OpenAI Whisper API
    const formData = new FormData()
    formData.append('file', audioBlob, 'recording.mp3')
    formData.append('model', 'whisper-1')
    formData.append('language', 'en') // Can be made configurable
    formData.append('response_format', 'text')
    
    // Call OpenAI Whisper API
    const transcriptionResponse = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: formData,
    })
    
    if (!transcriptionResponse.ok) {
      const error = await transcriptionResponse.text()
      throw new Error(`OpenAI API error: ${transcriptionResponse.status} - ${error}`)
    }
    
    const transcription = await transcriptionResponse.text()
    return transcription.trim()
    
  } catch (error) {
    console.error('Whisper transcription error:', error)
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== TRANSCRIPTION PROCESS WEBHOOK ===')
    
    const body = await request.json()
    const { callId, recordingUrl, recordingSid } = body
    
    if (!callId || !recordingUrl) {
      return NextResponse.json({ 
        error: 'Missing required fields: callId and recordingUrl' 
      }, { status: 400 })
    }
    
    console.log('Processing transcription for call:', callId)
    console.log('Recording URL:', recordingUrl)
    console.log('Recording SID:', recordingSid)
    
    // Use service role client to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Update status to processing
    await supabase
      .from('calls')
      .update({ 
        transcription_status: 'processing',
        updated_at: new Date().toISOString()
      })
      .eq('id', callId)
    
    try {
      // Transcribe the audio
      console.log('Starting transcription with Whisper...')
      const transcription = await transcribeWithWhisper(recordingUrl, recordingSid)
      console.log('Transcription completed:', transcription.substring(0, 100) + '...')
      
      // Update call record with transcription
      const { error: updateError } = await supabase
        .from('calls')
        .update({
          transcription,
          transcription_status: 'completed',
          updated_at: new Date().toISOString()
        })
        .eq('id', callId)
      
      if (updateError) {
        console.error('Error updating transcription:', updateError)
        throw updateError
      }
      
      console.log('Transcription saved successfully for call:', callId)
      
      return NextResponse.json({
        success: true,
        callId,
        transcriptionLength: transcription.length
      })
      
    } catch (transcriptionError) {
      console.error('Transcription failed:', transcriptionError)
      
      // Update status to failed
      await supabase
        .from('calls')
        .update({
          transcription_status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', callId)
      
      return NextResponse.json({
        error: 'Transcription failed',
        details: transcriptionError instanceof Error ? transcriptionError.message : 'Unknown error'
      }, { status: 500 })
    }
    
  } catch (error) {
    console.error('Transcription process error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Allow GET for health checks
export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    message: 'Transcription service active' 
  })
}