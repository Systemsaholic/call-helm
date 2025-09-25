import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

interface CallAnalysis {
  summary: string
  action_items: string[]
  concerns: string[]
  opportunities: string[]
  talk_ratio?: { agent: number; contact: number }
  key_points: string[]
  mood_sentiment: 'positive' | 'neutral' | 'negative' | 'mixed'
  topics_discussed: string[]
  follow_up_required: boolean
  call_quality_score: number // 1-10
  compliance_flags?: {
    pci_detected?: boolean
    pii_detected?: boolean
    sensitive_data?: string[]
  }
}

async function analyzeTranscription(transcription: string, callMetadata?: any): Promise<CallAnalysis> {
  const systemPrompt = `You are an AI assistant specialized in analyzing sales and support call transcriptions.
  Analyze the following call transcription and provide structured insights.
  
  Return a JSON object with the following structure:
  {
    "summary": "2-3 sentence summary of the call",
    "action_items": ["list of specific action items mentioned or implied"],
    "concerns": ["any concerns or issues raised by the customer"],
    "opportunities": ["potential sales or service opportunities identified"],
    "key_points": ["3-5 main points from the conversation"],
    "mood_sentiment": "positive|neutral|negative|mixed",
    "topics_discussed": ["main topics covered in the call"],
    "follow_up_required": true|false,
    "call_quality_score": 1-10,
    "talk_ratio": { "agent": percentage, "contact": percentage },
    "compliance_flags": {
      "pci_detected": true|false,
      "pii_detected": true|false,
      "sensitive_data": ["list of sensitive data types mentioned"]
    }
  }`

  const userPrompt = `Analyze this call transcription:

${transcription}

${callMetadata ? `Call Context:
- Duration: ${callMetadata.duration} seconds
- Direction: ${callMetadata.direction}
- Status: ${callMetadata.status}` : ''}`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 2000
    })

    const analysis = JSON.parse(response.choices[0].message.content || '{}')
    
    // Ensure all required fields are present
    return {
      summary: analysis.summary || '',
      action_items: analysis.action_items || [],
      concerns: analysis.concerns || [],
      opportunities: analysis.opportunities || [],
      talk_ratio: analysis.talk_ratio || undefined,
      key_points: analysis.key_points || [],
      mood_sentiment: analysis.mood_sentiment || 'neutral',
      topics_discussed: analysis.topics_discussed || [],
      follow_up_required: analysis.follow_up_required || false,
      call_quality_score: analysis.call_quality_score || 5,
      compliance_flags: analysis.compliance_flags || {}
    }
  } catch (error) {
    console.error('OpenAI analysis error:', error)
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('=== AI ANALYSIS PROCESS ===')
    
    const body = await request.json()
    const { callId, transcription } = body
    
    if (!callId || !transcription) {
      return NextResponse.json({ 
        error: 'Missing required fields: callId and transcription' 
      }, { status: 400 })
    }
    
    console.log('Processing AI analysis for call:', callId)
    console.log('Transcription length:', transcription.length)
    
    // Use service role client to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Get call metadata for context
    const { data: call } = await supabase
      .from('calls')
      .select('duration, direction, status, caller_number, called_number')
      .eq('id', callId)
      .single()
    
    try {
      // Analyze the transcription
      console.log('Starting AI analysis...')
      const analysis = await analyzeTranscription(transcription, call)
      console.log('AI analysis completed:', {
        hasSummary: !!analysis.summary,
        actionItemsCount: analysis.action_items.length,
        keyPointsCount: analysis.key_points.length,
        sentiment: analysis.mood_sentiment
      })
      
      // Update call record with analysis
      const { error: updateError } = await supabase
        .from('calls')
        .update({
          ai_analysis: {
            summary: analysis.summary,
            action_items: analysis.action_items,
            concerns: analysis.concerns,
            opportunities: analysis.opportunities,
            talk_ratio: analysis.talk_ratio,
            topics_discussed: analysis.topics_discussed,
            follow_up_required: analysis.follow_up_required,
            call_quality_score: analysis.call_quality_score
          },
          mood_sentiment: analysis.mood_sentiment,
          key_points: analysis.key_points,
          compliance_flags: analysis.compliance_flags,
          updated_at: new Date().toISOString()
        })
        .eq('id', callId)
      
      if (updateError) {
        console.error('Error updating analysis:', updateError)
        throw updateError
      }
      
      console.log('AI analysis saved successfully for call:', callId)
      
      // If follow-up is required, create a task or notification
      if (analysis.follow_up_required && analysis.action_items.length > 0) {
        console.log('Follow-up required with action items:', analysis.action_items)
        // Could create tasks or notifications here
      }
      
      return NextResponse.json({
        success: true,
        callId,
        analysis: {
          summary: analysis.summary,
          sentiment: analysis.mood_sentiment,
          actionItemsCount: analysis.action_items.length,
          followUpRequired: analysis.follow_up_required
        }
      })
      
    } catch (analysisError) {
      console.error('Analysis failed:', analysisError)
      
      return NextResponse.json({
        error: 'Analysis failed',
        details: analysisError instanceof Error ? analysisError.message : 'Unknown error'
      }, { status: 500 })
    }
    
  } catch (error) {
    console.error('Analysis process error:', error)
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
    message: 'AI Analysis service active' 
  })
}