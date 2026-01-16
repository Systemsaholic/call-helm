import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { trackLLMUsage, withUsageCheck } from '@/lib/utils/usageTracking'
import OpenAI from 'openai'
import { apiLogger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get request body
    const body = await request.json()
    const { 
      prompt,
      contactInfo,
      campaignType,
      callListId,
      agentId,
      tone = 'professional',
      maxLength = 200
    } = body

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Estimated token usage (rough calculation: 1 token ≈ 0.75 words)
    const estimatedInputTokens = Math.ceil(prompt.split(' ').length / 0.75)
    const estimatedOutputTokens = Math.ceil(maxLength / 0.75)
    const totalEstimatedTokens = estimatedInputTokens + estimatedOutputTokens

    // Use usage checking middleware
    const result = await withUsageCheck(
      member.organization_id,
      'llm_tokens',
      totalEstimatedTokens,
      async () => {
        // Simulate AI call (replace with actual AI service)
        const aiResponse = await generateScriptWithAI({
          prompt,
          contactInfo,
          campaignType,
          tone,
          maxLength
        })

        return aiResponse
      }
    )

    // Track actual usage
    await trackLLMUsage({
      organizationId: member.organization_id,
      tokens: result.tokensUsed,
      model: 'gpt-4o-mini',
      feature: 'script_generation',
      campaignId: callListId,
      agentId: agentId || member.id,
      metadata: {
        prompt_length: prompt.length,
        tone,
        campaign_type: campaignType,
        input_tokens: result.inputTokens,
        output_tokens: result.outputTokens
      }
    })

    return NextResponse.json({
      success: true,
      script: result.script,
      tokensUsed: result.tokensUsed,
      metadata: {
        model: 'gpt-4o-mini',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        tone,
        campaignType
      }
    })

  } catch (error) {
    apiLogger.error('AI script generation error', { error })

    if (error instanceof Error && error.message.includes('Usage limit exceeded')) {
      return NextResponse.json({ 
        error: 'AI usage limit exceeded for your subscription plan',
        details: error.message
      }, { status: 402 })
    }
    
    return NextResponse.json({ 
      error: 'Failed to generate script' 
    }, { status: 500 })
  }
}

interface ContactInfo {
  name?: string
  phone?: string
  email?: string
  company?: string
  [key: string]: unknown
}

// AI function using OpenAI API
async function generateScriptWithAI(params: {
  prompt: string
  contactInfo?: ContactInfo
  campaignType?: string
  tone: string
  maxLength: number
}): Promise<{
  script: string
  tokensUsed: number
  inputTokens: number
  outputTokens: number
}> {
  // Check if OpenAI API key is configured
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.')
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Create a system prompt that defines the tone
    const toneDescriptions: Record<string, string> = {
      professional: 'professional, business-oriented, and respectful',
      friendly: 'warm, approachable, and conversational',
      casual: 'relaxed, informal, and easy-going',
      formal: 'formal, polite, and highly respectful',
      enthusiastic: 'energetic, excited, and positive',
      empathetic: 'understanding, caring, and considerate'
    }

    // Parse the user's prompt to extract key points, context, and scenario preference
    const keyPointsMatch = params.prompt.match(/Key Points to Include:\n([\s\S]*?)\n\nTone:/)
    const contextMatch = params.prompt.match(/Additional Context: ([\s\S]*?)$/)
    const includeScenarios = params.prompt.includes('Include Scenario Branches: Yes')
    
    let keyPointsList = ''
    if (keyPointsMatch) {
      const keyPoints = keyPointsMatch[1].split('\n').filter(line => line.trim())
      keyPointsList = keyPoints.map(point => point.replace(/^\d+\.\s*/, '')).join(', ')
    }
    
    const additionalContext = contextMatch ? contextMatch[1].trim() : ''

    const systemPrompt = includeScenarios ? 
      `You are an expert call script generator creating AGENT-FOCUSED scripts with scenario branches. 

CRITICAL RULES:
1. ONLY write what the AGENT says - never write callee dialogue
2. Use [Wait for Callee Response] as placeholder for customer responses
3. Create 2-3 scenario branches at key decision points
4. Format scenarios as: [Scenario 1: brief description]: Agent's response
5. Keep a ${toneDescriptions[params.tone] || 'professional'} tone throughout
6. Use placeholders: [Agent Name], [Company Name], [Contact Name]
7. Make scenarios realistic and handle common objections/questions

STRUCTURE EXAMPLE:
Agent: [Opening statement]
[Wait for Callee Response]

[Scenario 1: Customer is interested]: [Agent continues with value proposition]
[Scenario 2: Customer is busy]: [Agent offers to schedule a better time]
[Scenario 3: Customer objects]: [Agent addresses the objection]

Continue this pattern throughout the script.` :
      `You are an expert call script generator creating AGENT-FOCUSED scripts.

CRITICAL RULES:
1. ONLY write what the AGENT says - never write callee dialogue
2. Use [Wait for Callee Response] as placeholder for customer responses
3. Keep a linear flow without branching scenarios
4. Maintain a ${toneDescriptions[params.tone] || 'professional'} tone
5. Use placeholders: [Agent Name], [Company Name], [Contact Name]
6. Be concise and direct - approximately ${params.maxLength} words

Focus on creating a smooth, natural conversation flow.`

    const userPrompt = `Generate a call script for the following scenario:

${additionalContext ? `CONTEXT/PURPOSE: ${additionalContext}` : ''}
${keyPointsList ? `\nKEY POINTS THAT MUST BE COVERED:
${keyPointsList}` : ''}

${includeScenarios ? 
  'Create multiple scenario branches for different customer responses (objections, questions, interest levels).' :
  'Create a straightforward linear script without scenario branches.'}

The script should naturally incorporate all key points while maintaining a ${params.tone} tone. Be specific to the context provided.`

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ],
      max_tokens: Math.ceil(params.maxLength * 1.5), // Allow some buffer
      temperature: 0.7,
    })

    const script = completion.choices[0]?.message?.content || ''
    
    return {
      script,
      tokensUsed: completion.usage?.total_tokens || 0,
      inputTokens: completion.usage?.prompt_tokens || 0,
      outputTokens: completion.usage?.completion_tokens || 0,
    }
  } catch (error) {
    apiLogger.error('OpenAI API error', { error })
    throw error
  }
}