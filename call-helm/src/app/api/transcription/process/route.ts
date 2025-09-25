import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// AssemblyAI transcription service with native speaker diarization
async function transcribeWithAssemblyAI(
  audioUrl: string, 
  recordingSid?: string,
  callData?: {
    direction: 'inbound' | 'outbound',
    memberName?: string,
    contactName?: string
  }
): Promise<string> {
  const assemblyApiKey = process.env.ASSEMBLYAI_API_KEY || 'f16d9ecd7fbd4a108f305b303d940954'
  
  if (!assemblyApiKey) {
    throw new Error('AssemblyAI API key not configured')
  }

  try {
    // For SignalWire URLs, we need to fetch the audio and upload it to AssemblyAI
    // since the ngrok URL might not be accessible externally
    let audioUrlForAssembly = audioUrl
    
    if (audioUrl.includes('signalwire.com')) {
      console.log('Fetching audio from SignalWire for AssemblyAI upload...')
      
      // Fetch the audio with SignalWire authentication
      const swProjectId = process.env.SIGNALWIRE_PROJECT_ID
      const swApiToken = process.env.SIGNALWIRE_API_TOKEN
      const headers: HeadersInit = {}
      
      if (swProjectId && swApiToken) {
        const auth = Buffer.from(`${swProjectId}:${swApiToken}`).toString('base64')
        headers['Authorization'] = `Basic ${auth}`
      }
      
      const audioResponse = await fetch(audioUrl, { 
        headers,
        redirect: 'follow'
      })
      
      if (!audioResponse.ok) {
        throw new Error(`Failed to fetch audio: ${audioResponse.statusText}`)
      }
      
      const audioBlob = await audioResponse.blob()
      console.log('Audio fetched, size:', (audioBlob.size / 1024 / 1024).toFixed(2), 'MB')
      
      // Upload the audio file to AssemblyAI
      console.log('Uploading audio to AssemblyAI...')
      const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'Authorization': assemblyApiKey,
          'Content-Type': audioBlob.type || 'audio/mpeg',
        },
        body: audioBlob,
      })
      
      if (!uploadResponse.ok) {
        const error = await uploadResponse.text()
        throw new Error(`AssemblyAI upload error: ${uploadResponse.status} - ${error}`)
      }
      
      const uploadData = await uploadResponse.json()
      audioUrlForAssembly = uploadData.upload_url
      console.log('Audio uploaded to AssemblyAI successfully')
    }
    
    console.log('Submitting transcription request to AssemblyAI...')
    
    // Submit the transcription request to AssemblyAI
    const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': assemblyApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audio_url: audioUrlForAssembly,
        speaker_labels: true, // Enable speaker diarization
        speakers_expected: 2, // We typically expect 2 speakers (agent and customer)
        language_detection: true, // Auto-detect language
        punctuate: true, // Add punctuation
        format_text: true, // Format text for better readability
        disfluencies: false, // Remove filler words like "um", "uh"
        word_boost: [ // Boost accuracy for common business terms
          'appointment', 'schedule', 'product', 'service', 'pricing', 
          'promotion', 'travel', 'cruise', 'voyages', 'booking', 'reservation'
        ],
        boost_param: 'default', // Use default boost weight
        auto_highlights: true, // Highlight important phrases
        content_safety: true, // Detect sensitive content
        iab_categories: true, // Categorize content
        sentiment_analysis: true, // Analyze sentiment
        entity_detection: true, // Detect entities (names, locations, etc.)
        summarization: true, // Generate summary
        summary_model: 'conversational', // Use conversational summary model
        summary_type: 'bullets' // Get bullet point summary
      })
    })
    
    if (!transcriptResponse.ok) {
      const error = await transcriptResponse.text()
      throw new Error(`AssemblyAI transcript error: ${transcriptResponse.status} - ${error}`)
    }
    
    const transcriptData = await transcriptResponse.json()
    const transcriptId = transcriptData.id
    
    console.log('AssemblyAI transcript ID:', transcriptId)
    
    // Poll for the transcription result
    let transcriptionData: any = null
    let pollCount = 0
    const maxPolls = 120 // Max 10 minutes (5 seconds * 120)
    
    while (pollCount < maxPolls) {
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds
      
      const statusResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: {
          'Authorization': assemblyApiKey,
        },
      })
      
      if (!statusResponse.ok) {
        throw new Error(`AssemblyAI status error: ${statusResponse.status}`)
      }
      
      transcriptionData = await statusResponse.json()
      
      console.log(`Transcription status (attempt ${pollCount + 1}):`, transcriptionData.status)
      
      if (transcriptionData.status === 'completed') {
        break
      } else if (transcriptionData.status === 'error') {
        throw new Error(`AssemblyAI transcription failed: ${transcriptionData.error}`)
      }
      
      pollCount++
    }
    
    if (!transcriptionData || transcriptionData.status !== 'completed') {
      throw new Error('Transcription timed out')
    }
    
    // Step 3: Format the transcript with speaker labels
    let formattedTranscript = ''
    
    if (transcriptionData.utterances && transcriptionData.utterances.length > 0) {
      // AssemblyAI provides utterances with speaker labels
      const utterances = transcriptionData.utterances
      
      // Map speakers to actual names based on call direction
      const speakerMapping: { [key: string]: string } = {}
      
      // Get unique speakers from utterances
      const speakers = new Set(utterances.map((u: any) => u.speaker))
      const speakerArray = Array.from(speakers)
      
      if (callData) {
        // Use actual names when available
        const agentName = callData.memberName || 'Agent'
        const customerName = callData.contactName || 'Customer'
        
        // Analyze first few utterances to determine who is the agent
        // Look for typical agent greetings or patterns
        const firstUtterances = utterances.slice(0, 5)
        let agentSpeaker: string | null = null
        
        for (const utterance of firstUtterances) {
          const text = utterance.text.toLowerCase()
          // Common agent/business greetings
          if (text.includes('thank') && text.includes('calling') ||
              text.includes('how can i help') ||
              text.includes('how may i help') ||
              text.includes('calling from') ||
              text.includes('calling because') ||
              text.includes('i\'m calling') ||
              text.includes('this is') && text.includes('from')) {
            agentSpeaker = utterance.speaker
            break
          }
        }
        
        // If we couldn't identify agent from speech patterns, use call direction as hint
        if (!agentSpeaker && speakerArray.length === 2) {
          if (callData.direction === 'outbound') {
            // For outbound: Agent usually initiates after customer picks up
            // Look for the speaker who introduces themselves or states purpose
            const introSpeaker = firstUtterances.find((u: any) => 
              u.text.toLowerCase().includes('from') || 
              u.text.toLowerCase().includes('calling')
            )?.speaker
            agentSpeaker = introSpeaker || speakerArray[1] // Second speaker often agent in outbound
          } else {
            // For inbound: Agent typically answers first
            agentSpeaker = speakerArray[0]
          }
        }
        
        // Assign names based on identified agent
        if (speakerArray.length === 2) {
          const customerSpeaker = speakerArray.find(s => s !== agentSpeaker)
          if (agentSpeaker) {
            speakerMapping[agentSpeaker] = agentName
          }
          if (customerSpeaker) {
            speakerMapping[customerSpeaker] = customerName
          }
        } else if (speakerArray.length === 1) {
          // Single speaker - likely agent for short calls
          speakerMapping[speakerArray[0]] = agentName
        }
        
        // Fallback if mapping incomplete
        for (const speaker of speakerArray) {
          if (!speakerMapping[speaker]) {
            speakerMapping[speaker] = speaker === speakerArray[0] ? agentName : customerName
          }
        }
      } else {
        // Fallback to generic labels
        if (speakerArray.length >= 1) {
          speakerMapping[speakerArray[0]] = 'Agent'
        }
        if (speakerArray.length >= 2) {
          speakerMapping[speakerArray[1]] = 'Customer'
        }
      }
      
      // Format the transcript
      utterances.forEach((utterance: any, index: number) => {
        const speaker = speakerMapping[utterance.speaker] || utterance.speaker
        if (index > 0) {
          formattedTranscript += '\n\n'
        }
        formattedTranscript += `${speaker}: ${utterance.text}`
      })
      
      // Log additional insights from AssemblyAI
      if (transcriptionData.sentiment_analysis_results) {
        console.log('Sentiment analysis available:', transcriptionData.sentiment_analysis_results.length, 'segments')
      }
      if (transcriptionData.entities) {
        console.log('Entities detected:', transcriptionData.entities.length)
      }
      if (transcriptionData.summary) {
        console.log('Summary generated:', transcriptionData.summary.substring(0, 100) + '...')
      }
      
      // Store additional insights for later use
      if (transcriptionData.summary || transcriptionData.sentiment_analysis_results) {
        // We could pass these to the AI analysis service
        formattedTranscript += `\n\n[CallHelm AI Summary]`
        if (transcriptionData.summary) {
          formattedTranscript += `\nSummary: ${transcriptionData.summary}`
        }
        if (transcriptionData.content_safety_labels) {
          const sensitiveTopics = transcriptionData.content_safety_labels.results
            .filter((label: any) => label.confidence > 0.5)
            .map((label: any) => label.text)
          if (sensitiveTopics.length > 0) {
            formattedTranscript += `\nSensitive Topics Detected: ${sensitiveTopics.join(', ')}`
          }
        }
      }
    } else {
      // Fallback to plain text if no utterances
      formattedTranscript = transcriptionData.text || ''
    }
    
    return formattedTranscript.trim()
    
  } catch (error) {
    console.error('AssemblyAI transcription error:', error)
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
      // Get call details for speaker mapping
      const { data: callData } = await supabase
        .from('calls')
        .select(`
          direction,
          member_id,
          contact_id,
          organization_members!calls_member_id_fkey (
            full_name
          ),
          contacts (
            full_name
          )
        `)
        .eq('id', callId)
        .single()
      
      // Prepare speaker names
      const speakerData = callData ? {
        direction: callData.direction as 'inbound' | 'outbound',
        memberName: callData.organization_members?.full_name,
        contactName: callData.contacts?.full_name
      } : undefined
      
      // Transcribe the audio
      console.log('Starting transcription with AssemblyAI...')
      const transcription = await transcribeWithAssemblyAI(recordingUrl, recordingSid, speakerData)
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