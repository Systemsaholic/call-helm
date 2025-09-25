import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Function to format transcript with speaker identification
function formatTranscriptWithSpeakers(segments: any[], recordingSid?: string): string {
  if (!segments || segments.length === 0) {
    return ''
  }

  let formattedTranscript = ''
  let currentSpeaker = 'Agent' // Start with Agent since calls usually begin with agent speaking
  let lastEndTime = 0
  let speakerTurnCount = 0
  
  // Analyze segments to identify speaker changes
  // Speaker changes are indicated by:
  // 1. Significant pause (> 1.5 seconds)
  // 2. Change in speech patterns
  // 3. Natural conversation flow
  
  segments.forEach((segment, index) => {
    const pauseDuration = segment.start - lastEndTime
    
    // Detect speaker change based on pause and conversation flow
    if (pauseDuration > 1.5 || 
        (pauseDuration > 0.8 && containsSpeakerChangeIndicators(segment.text))) {
      // Toggle speaker
      if (speakerTurnCount > 0) { // Don't change on first segment
        currentSpeaker = currentSpeaker === 'Agent' ? 'Customer' : 'Agent'
      }
      
      // Add speaker label with new line
      if (formattedTranscript.length > 0) {
        formattedTranscript += '\n\n'
      }
      formattedTranscript += `${currentSpeaker}: `
      speakerTurnCount++
    } else if (index === 0) {
      // First segment
      formattedTranscript = `${currentSpeaker}: `
      speakerTurnCount++
    }
    
    // Add the text
    formattedTranscript += segment.text.trim() + ' '
    lastEndTime = segment.end
  })
  
  // Clean up the transcript
  formattedTranscript = formattedTranscript
    .replace(/\s+/g, ' ') // Remove extra spaces
    .replace(/(\w)\s+\./g, '$1.') // Fix spacing before periods
    .replace(/\s+,/g, ',') // Fix spacing before commas
    .replace(/\s+\?/g, '?') // Fix spacing before questions
    .trim()
  
  return formattedTranscript
}

// Helper function to detect phrases that indicate speaker change
function containsSpeakerChangeIndicators(text: string): boolean {
  const lowerText = text.toLowerCase().trim()
  
  // Common conversation turn indicators
  const turnIndicators = [
    // Greetings and farewells
    'hello', 'hi', 'hey', 'goodbye', 'bye', 'thanks', 'thank you',
    // Questions
    '?',
    // Affirmatives/Negatives that often start a turn
    '^yes', '^no', '^okay', '^sure', '^absolutely',
    // Common response starters
    'well,', 'actually,', 'um,', 'uh,',
    // Professional phrases
    'how can i help', 'may i help', 'calling about', 'calling from'
  ]
  
  return turnIndicators.some(indicator => {
    if (indicator.startsWith('^')) {
      return lowerText.startsWith(indicator.substring(1))
    }
    return lowerText.includes(indicator)
  })
}

// OpenAI Whisper transcription service
async function transcribeWithWhisper(audioUrl: string, recordingSid?: string): Promise<string> {
  const openaiApiKey = process.env.OPENAI_API_KEY
  
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured')
  }

  try {
    // Always use direct URL with authentication for server-side fetching
    let fetchUrl = audioUrl
    const headers: HeadersInit = {}
    
    // Add SignalWire authentication if it's a SignalWire URL
    if (audioUrl.includes('signalwire.com')) {
      const swProjectId = process.env.SIGNALWIRE_PROJECT_ID
      const swApiToken = process.env.SIGNALWIRE_API_TOKEN
      
      if (swProjectId && swApiToken) {
        const auth = Buffer.from(`${swProjectId}:${swApiToken}`).toString('base64')
        headers['Authorization'] = `Basic ${auth}`
      } else {
        console.warn('SignalWire credentials not configured')
      }
    }
    
    console.log('Fetching audio from:', fetchUrl)
    console.log('Using authentication:', audioUrl.includes('signalwire.com') ? 'Yes' : 'No')
    
    // First, fetch the audio file with redirect following
    const audioResponse = await fetch(fetchUrl, { 
      headers,
      redirect: 'follow' // Explicitly follow redirects
    })
    if (!audioResponse.ok) {
      console.error('Audio fetch failed:', {
        status: audioResponse.status,
        statusText: audioResponse.statusText,
        url: fetchUrl,
        hasAuth: !!headers['Authorization']
      })
      throw new Error(`Failed to fetch audio: ${audioResponse.statusText}`)
    }
    
    const audioBlob = await audioResponse.blob()
    
    // Log audio file details
    console.log('Audio file details:', {
      size: audioBlob.size,
      sizeInMB: (audioBlob.size / (1024 * 1024)).toFixed(2),
      type: audioBlob.type || 'audio/mpeg'
    })
    
    // Check if the audio file is too small (might be truncated)
    if (audioBlob.size < 1000) {
      console.warn('Audio file seems too small, might be truncated:', audioBlob.size)
    }
    
    // Create form data for OpenAI Whisper API
    const formData = new FormData()
    
    // Ensure proper file naming for better processing
    const fileName = `recording_${Date.now()}.mp3`
    formData.append('file', audioBlob, fileName)
    
    // Use the best Whisper model
    formData.append('model', 'whisper-1')
    
    // Get detailed output with word-level timestamps
    formData.append('response_format', 'verbose_json')
    
    // Use deterministic mode for consistent results
    formData.append('temperature', '0')
    
    // Provide context to improve accuracy
    // This helps Whisper understand domain-specific terms and names
    formData.append('prompt', 'A business phone call between a sales agent and customer. Common terms: appointment, schedule, product, service, pricing, promotion, travel, cruise, voyages.')
    
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
    
    const transcriptionData = await transcriptionResponse.json()
    
    // verbose_json format returns an object with text, language, duration, segments, etc.
    const rawTranscription = transcriptionData.text || transcriptionData
    
    // Log detected language and duration for debugging
    if (transcriptionData.language) {
      console.log('Detected language:', transcriptionData.language)
    }
    if (transcriptionData.duration) {
      console.log('Audio duration from Whisper:', transcriptionData.duration, 'seconds')
    }
    
    // Process segments to identify speaker changes based on timing gaps
    let formattedTranscript = rawTranscription
    if (transcriptionData.segments) {
      formattedTranscript = formatTranscriptWithSpeakers(transcriptionData.segments, recordingSid)
    }
    
    return typeof formattedTranscript === 'string' ? formattedTranscript.trim() : JSON.stringify(formattedTranscript)
    
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
      
      // Trigger AI analysis
      console.log('Triggering AI analysis for transcription...')
      const analysisUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''
      
      fetch(`${analysisUrl}/api/analysis/process`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          callId,
          transcription
        })
      }).catch(error => {
        console.error('Failed to trigger AI analysis:', error)
      })
      
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