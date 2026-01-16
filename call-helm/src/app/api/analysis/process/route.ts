import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { billingService } from '@/lib/services/billing'
import { trackAIAnalysisUsage } from '@/lib/utils/usageTracking'
import { apiLogger } from '@/lib/logger'

// Lazy initialization to avoid build-time errors
let _openai: OpenAI | null = null
function getOpenAI() {
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    })
  }
  return _openai
}

interface CallAnalysis {
  summary: string
  action_items: string[]
  concerns: string[]
  opportunities: string[]
  talk_ratio?: { agent: number; contact: number }
  key_points: string[]
  mood_sentiment: 'happy' | 'satisfied' | 'neutral' | 'frustrated' | 'angry' | 'sad' | 'confused' | 'excited'
  topics_discussed: string[]
  follow_up_required: boolean
  call_quality_score: number // 1-10
  customer_satisfaction_level: 'very_satisfied' | 'satisfied' | 'neutral' | 'dissatisfied' | 'very_dissatisfied'
  compliance_flags?: {
    pci_detected?: boolean
    pii_detected?: boolean
    sensitive_data?: string[]
  }
}

async function analyzeTranscription(transcription: string, callMetadata?: any): Promise<CallAnalysis> {
  // Check if we have AssemblyAI insights in the transcription
  let mainTranscript = transcription
  let assemblyInsights: any = null
  
  const insightsIndex = transcription.indexOf('[AssemblyAI Insights]')
  if (insightsIndex > -1) {
    mainTranscript = transcription.substring(0, insightsIndex).trim()
    const insightsText = transcription.substring(insightsIndex)
    
    // Parse AssemblyAI insights
    assemblyInsights = {}
    const summaryMatch = insightsText.match(/Summary: (.+?)(?=\n|$)/)
    if (summaryMatch) {
      assemblyInsights.summary = summaryMatch[1]
    }
    const sensitiveMatch = insightsText.match(/Sensitive Topics Detected: (.+?)(?=\n|$)/)
    if (sensitiveMatch) {
      assemblyInsights.sensitiveTopics = sensitiveMatch[1].split(', ')
    }
  }
  
  const systemPrompt = `You are an AI assistant specialized in analyzing sales and support call transcriptions.
  Analyze the following call transcription and provide structured insights.
  
  ${assemblyInsights?.summary ? `AssemblyAI has already provided this summary: ${assemblyInsights.summary}\nUse this as context but provide your own deeper analysis.` : ''}
  ${assemblyInsights?.sensitiveTopics ? `Note: Sensitive topics detected by AssemblyAI: ${assemblyInsights.sensitiveTopics.join(', ')}` : ''}
  
  Pay special attention to the emotional tone and sentiment of the customer throughout the call.
  
  Return a JSON object with the following structure:
  {
    "summary": "2-3 sentence summary of the call",
    "action_items": ["list of specific action items mentioned or implied"],
    "concerns": ["any concerns or issues raised by the customer"],
    "opportunities": ["potential sales or service opportunities identified"],
    "key_points": ["3-5 main points from the conversation"],
    "mood_sentiment": "Choose ONE from: happy|satisfied|neutral|frustrated|angry|sad|confused|excited based on the overall customer emotion",
    "customer_satisfaction_level": "Choose ONE from: very_satisfied|satisfied|neutral|dissatisfied|very_dissatisfied",
    "topics_discussed": ["main topics covered in the call"],
    "follow_up_required": true|false,
    "call_quality_score": 1-10 (based on agent performance, resolution, professionalism),
    "talk_ratio": { "agent": percentage as number, "contact": percentage as number },
    "compliance_flags": {
      "pci_detected": true|false (credit card numbers mentioned),
      "pii_detected": true|false (SSN, personal info mentioned),
      "sensitive_data": ["list of sensitive data types mentioned"]
    }
  }
  
  For mood_sentiment, consider:
  - happy: Customer is pleased, laughing, enthusiastic
  - satisfied: Customer got what they needed, content
  - neutral: No strong emotion, business-like
  - frustrated: Customer is annoyed, struggling, impatient
  - angry: Customer is upset, raising voice, threatening
  - sad: Customer is disappointed, dejected
  - confused: Customer doesn't understand, needs clarification
  - excited: Customer is very enthusiastic, eager`

  const userPrompt = `Analyze this call transcription (formatted as Agent: and Customer: dialogue):

${mainTranscript}

${callMetadata ? `Call Context:
- Duration: ${callMetadata.duration} seconds
- Direction: ${callMetadata.direction}
- Status: ${callMetadata.status}` : ''}

Note: The transcript is already separated by speaker (Agent and Customer). Use this to better understand the conversation flow and calculate accurate talk ratios.`

  try {
    const response = await getOpenAI().chat.completions.create({
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
      customer_satisfaction_level: analysis.customer_satisfaction_level || 'neutral',
      topics_discussed: analysis.topics_discussed || [],
      follow_up_required: analysis.follow_up_required || false,
      call_quality_score: analysis.call_quality_score || 5,
      compliance_flags: analysis.compliance_flags || {}
    }
  } catch (error) {
    apiLogger.error('OpenAI analysis error', { error })
    throw error
  }
}

export async function POST(request: NextRequest) {
  try {
    apiLogger.info('AI analysis process started')
    
    const body = await request.json()
    const { callId, transcription } = body
    
    if (!callId || !transcription) {
      return NextResponse.json({ 
        error: 'Missing required fields: callId and transcription' 
      }, { status: 400 })
    }
    
    apiLogger.info('Processing AI analysis for call', { data: { callId, transcriptionLength: transcription.length } })
    
    // Use service role client to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    // Get call metadata for context and organization
    const { data: call } = await supabase
      .from('calls')
      .select(`
        duration, 
        direction, 
        status, 
        caller_number, 
        called_number,
        organization_id,
        member_id,
        contact_id
      `)
      .eq('id', callId)
      .single()

    if (!call?.organization_id) {
      return NextResponse.json({ 
        error: 'Call organization not found' 
      }, { status: 404 })
    }

    // Check AI analysis quota
    const quotaCheck = await billingService.canUseAIService(
      call.organization_id,
      'ai_analysis_requests',
      1
    )

    if (!quotaCheck.canUse) {
      apiLogger.warn('AI analysis quota exceeded', { data: { reason: quotaCheck.reason } })
      return NextResponse.json({
        error: 'AI analysis quota exceeded',
        details: quotaCheck.reason,
        available: quotaCheck.available,
        limit: quotaCheck.limit
      }, { status: 402 })
    }
    
    try {
      // Analyze the transcription
      apiLogger.debug('Starting AI analysis')
      const analysis = await analyzeTranscription(transcription, call)
      apiLogger.info('AI analysis completed', {
        data: {
          hasSummary: !!analysis.summary,
          actionItemsCount: analysis.action_items.length,
          keyPointsCount: analysis.key_points.length,
          sentiment: analysis.mood_sentiment
        }
      })
      
      // Track AI analysis usage
      await trackAIAnalysisUsage({
        organizationId: call.organization_id,
        analysisCount: 1,
        analysisType: 'call_analysis',
        model: 'gpt-4-turbo-preview',
        agentId: call.member_id,
        contactId: call.contact_id,
        callAttemptId: callId,
        metadata: {
          transcription_length: transcription.length,
          sentiment: analysis.mood_sentiment,
          action_items_count: analysis.action_items.length,
          compliance_flags: analysis.compliance_flags
        }
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
            call_quality_score: analysis.call_quality_score,
            customer_satisfaction_level: analysis.customer_satisfaction_level
          },
          mood_sentiment: analysis.mood_sentiment,
          key_points: analysis.key_points,
          compliance_flags: analysis.compliance_flags,
          updated_at: new Date().toISOString()
        })
        .eq('id', callId)
      
      if (updateError) {
        apiLogger.error('Error updating analysis', { error: updateError })
        throw updateError
      }

      apiLogger.info('AI analysis saved successfully', { data: { callId, organizationId: call.organization_id } })
      
      // If follow-up is required, create a task or notification
      if (analysis.follow_up_required && analysis.action_items.length > 0) {
        apiLogger.debug('Follow-up required with action items', { data: { actionItems: analysis.action_items } })
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
      apiLogger.error('Analysis failed', { error: analysisError })
      
      return NextResponse.json({
        error: 'Analysis failed',
        details: analysisError instanceof Error ? analysisError.message : 'Unknown error'
      }, { status: 500 })
    }
    
  } catch (error) {
    apiLogger.error('Analysis process error', { error })
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