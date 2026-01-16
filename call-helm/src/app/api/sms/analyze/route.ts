import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { smsLogger } from '@/lib/logger'

// Initialize Supabase client with service role
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface SMSAnalysis {
  // Message-level analysis
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  intent_detected: string
  urgency_level: 'high' | 'medium' | 'low'
  response_required: boolean
  keywords: string[]
  entities: {
    people: string[]
    organizations: string[]
    locations: string[]
    dates: string[]
    money: string[]
    products: string[]
  }
  
  // Conversation-level analysis
  conversation_summary?: string
  conversation_sentiment_trend?: 'improving' | 'declining' | 'stable'
  customer_satisfaction_predicted?: 'very_satisfied' | 'satisfied' | 'neutral' | 'dissatisfied' | 'very_dissatisfied'
  churn_risk?: 'low' | 'medium' | 'high'
  opportunities_identified?: string[]
  action_items?: string[]
  
  // Compliance and safety
  compliance_flags: {
    pii_detected: boolean
    pci_detected: boolean
    opt_out_request: boolean
    sensitive_topics: string[]
    spam_probability: number
  }
  
  // Business intelligence
  purchase_intent?: boolean
  competitor_mentions?: string[]
  pricing_discussed?: boolean
  appointment_requested?: boolean
  support_issue?: boolean
  complaint?: boolean
}

async function analyzeMessage(message: string, conversationContext?: any): Promise<SMSAnalysis> {
  const openaiApiKey = process.env.OPENAI_API_KEY
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured')
  }
  
  const systemPrompt = `You are an expert SMS conversation analyst.
  Analyze the SMS message and provide structured insights.
  Consider the conversation context if provided.
  
  Focus on:
  1. Sentiment and intent detection
  2. Entity extraction and keyword identification
  3. Business opportunities and risks
  4. Compliance and safety issues
  5. Customer experience indicators
  6. Action items and follow-ups needed`
  
  const userPrompt = `Analyze this SMS message${conversationContext ? ' in the context of the conversation' : ''}:
  
  MESSAGE: "${message}"
  
  ${conversationContext ? `CONVERSATION CONTEXT:
  Total messages: ${conversationContext.totalMessages}
  Customer messages: ${conversationContext.customerMessages}
  Agent messages: ${conversationContext.agentMessages}
  Last interaction: ${conversationContext.lastInteraction}
  Previous messages: ${conversationContext.recentMessages?.join('\n')}` : ''}
  
  Provide analysis in this exact JSON structure:
  {
    "sentiment": "positive|negative|neutral|mixed",
    "intent_detected": "<main intent of the message>",
    "urgency_level": "high|medium|low",
    "response_required": true/false,
    "keywords": ["keyword1", "keyword2"],
    "entities": {
      "people": ["names"],
      "organizations": ["companies"],
      "locations": ["places"],
      "dates": ["dates/times"],
      "money": ["amounts"],
      "products": ["products/services"]
    },
    "conversation_summary": "brief summary if conversation context provided",
    "conversation_sentiment_trend": "improving|declining|stable",
    "customer_satisfaction_predicted": "very_satisfied|satisfied|neutral|dissatisfied|very_dissatisfied",
    "churn_risk": "low|medium|high",
    "opportunities_identified": ["opportunity1", "opportunity2"],
    "action_items": ["action1", "action2"],
    "compliance_flags": {
      "pii_detected": true/false,
      "pci_detected": true/false,
      "opt_out_request": true/false,
      "sensitive_topics": ["topic1"],
      "spam_probability": 0.0-1.0
    },
    "purchase_intent": true/false,
    "competitor_mentions": ["competitor1"],
    "pricing_discussed": true/false,
    "appointment_requested": true/false,
    "support_issue": true/false,
    "complaint": true/false
  }`
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' }
      }),
    })
    
    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`)
    }
    
    const data = await response.json()
    return JSON.parse(data.choices[0].message.content)
  } catch (error) {
    smsLogger.error('SMS analysis error', { error })

    // Return basic analysis if AI fails
    return {
      sentiment: 'neutral',
      intent_detected: 'unknown',
      urgency_level: 'medium',
      response_required: true,
      keywords: [],
      entities: {
        people: [],
        organizations: [],
        locations: [],
        dates: [],
        money: [],
        products: []
      },
      compliance_flags: {
        pii_detected: false,
        pci_detected: false,
        opt_out_request: message.toLowerCase().includes('stop') || message.toLowerCase().includes('unsubscribe'),
        sensitive_topics: [],
        spam_probability: 0
      }
    }
  }
}

// Calculate conversation metrics
async function getConversationContext(conversationId: string) {
  try {
    // Get recent messages
    const { data: messages } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(10)
    
    if (!messages || messages.length === 0) {
      return null
    }
    
    // Calculate metrics
    const totalMessages = messages.length
    const customerMessages = messages.filter(m => m.direction === 'inbound').length
    const agentMessages = messages.filter(m => m.direction === 'outbound').length
    const lastInteraction = messages[0].created_at
    
    // Get recent message texts for context (exclude current)
    const recentMessages = messages.slice(1, 6).map(m => 
      `${m.direction === 'inbound' ? 'Customer' : 'Agent'}: ${m.message_body.substring(0, 100)}`
    )
    
    return {
      totalMessages,
      customerMessages,
      agentMessages,
      lastInteraction,
      recentMessages
    }
  } catch (error) {
    smsLogger.error('Error getting conversation context', { error })
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { messageId, conversationId } = body
    
    if (!messageId) {
      return NextResponse.json({ 
        error: 'Missing messageId' 
      }, { status: 400 })
    }
    
    smsLogger.info('Analyzing SMS message', { data: { messageId } })
    
    // Get message details
    const { data: message, error: messageError } = await supabase
      .from('sms_messages')
      .select('*')
      .eq('id', messageId)
      .single()
    
    if (messageError || !message) {
      return NextResponse.json({ 
        error: 'Message not found' 
      }, { status: 404 })
    }
    
    // Get conversation context
    const conversationContext = conversationId ? 
      await getConversationContext(conversationId) : null
    
    // Analyze the message
    const analysis = await analyzeMessage(message.message_body, conversationContext)
    
    // Update message with analysis
    const { error: updateError } = await supabase
      .from('sms_messages')
      .update({
        sentiment: analysis.sentiment,
        intent_detected: analysis.intent_detected,
        keywords: analysis.keywords,
        compliance_flags: analysis.compliance_flags,
        ai_analysis: analysis,
        updated_at: new Date().toISOString()
      })
      .eq('id', messageId)
    
    if (updateError) {
      smsLogger.error('Error updating message with analysis', { error: updateError })
    }
    
    // Update conversation with aggregated insights
    if (conversationId && conversationContext) {
      // Get all messages for comprehensive conversation analysis
      const { data: allMessages } = await supabase
        .from('sms_messages')
        .select('sentiment, ai_analysis')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(20)
      
      // Calculate conversation-level metrics
      if (allMessages && allMessages.length > 0) {
        const sentiments = allMessages.map(m => m.sentiment).filter(Boolean)
        const positiveSentiments = sentiments.filter(s => s === 'positive').length
        const negativeSentiments = sentiments.filter(s => s === 'negative').length
        
        let conversationSentiment: string
        if (positiveSentiments > negativeSentiments * 2) {
          conversationSentiment = 'positive'
        } else if (negativeSentiments > positiveSentiments * 2) {
          conversationSentiment = 'negative'
        } else {
          conversationSentiment = 'neutral'
        }
        
        // Check for high-priority flags across all messages
        const hasUrgentMessage = allMessages.some(m => 
          m.ai_analysis?.urgency_level === 'high'
        )
        const hasComplaint = allMessages.some(m => 
          m.ai_analysis?.complaint === true
        )
        const hasPurchaseIntent = allMessages.some(m => 
          m.ai_analysis?.purchase_intent === true
        )
        
        // Update conversation metadata
        await supabase
          .from('sms_conversations')
          .update({
            metadata: {
              last_analysis: new Date().toISOString(),
              conversation_sentiment: conversationSentiment,
              has_urgent_message: hasUrgentMessage,
              has_complaint: hasComplaint,
              has_purchase_intent: hasPurchaseIntent,
              total_messages_analyzed: allMessages.length,
              churn_risk: analysis.churn_risk,
              satisfaction_predicted: analysis.customer_satisfaction_predicted
            },
            updated_at: new Date().toISOString()
          })
          .eq('id', conversationId)
      }
    }
    
    // Check if immediate action is needed
    if (analysis.urgency_level === 'high' || 
        analysis.compliance_flags.opt_out_request ||
        analysis.complaint) {
      
      // Create notification for supervisor or assigned agent
      if (conversationId) {
        const { data: conversation } = await supabase
          .from('sms_conversations')
          .select('assigned_agent_id, organization_id')
          .eq('id', conversationId)
          .single()
        
        if (conversation) {
          await supabase
            .from('notifications')
            .insert({
              organization_id: conversation.organization_id,
              user_id: conversation.assigned_agent_id,
              type: 'urgent_sms',
              title: analysis.compliance_flags.opt_out_request ? 'Opt-out request received' :
                     analysis.complaint ? 'Customer complaint detected' :
                     'Urgent message requires attention',
              message: message.message_body.substring(0, 100),
              priority: 'high',
              data: {
                conversationId,
                messageId,
                analysis
              }
            })
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      messageId,
      analysis,
      conversationUpdated: !!conversationId
    })
    
  } catch (error) {
    smsLogger.error('SMS analysis endpoint error', { error })
    return NextResponse.json({
      error: 'Analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// GET endpoint for testing
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'SMS analysis endpoint',
    features: [
      'Sentiment analysis',
      'Intent detection',
      'Entity extraction',
      'Compliance monitoring',
      'Conversation metrics',
      'Business intelligence'
    ]
  })
}