import { createClient } from '@/lib/supabase/server'

export interface UsageTrackingParams {
  organizationId: string
  resourceType: 'llm_tokens' | 'analytics_tokens' | 'call_minutes' | 'sms_messages' | 'transcription_minutes' | 'ai_analysis_requests'
  amount: number
  unitCost?: number
  campaignId?: string
  agentId?: string
  contactId?: string
  callAttemptId?: string
  description: string
  metadata?: Record<string, any>
}

// Default unit costs with proper markup (3x cost for healthy margins)
const defaultUnitCosts = {
  llm_tokens: 0.00015,           // $0.15 per 1K tokens (3x markup from ~$0.045/1K OpenAI cost)
  analytics_tokens: 0.00015,     // $0.15 per 1K tokens (same as LLM for consistency)
  call_minutes: 0.025,           // $0.025 per minute (existing pricing)
  sms_messages: 0.02,            // $0.02 per message (reduced from $0.03, proper markup from ~$0.0075 cost)
  transcription_minutes: 0.003,  // $0.003 per minute (3x markup from ~$0.001 AssemblyAI cost)
  ai_analysis_requests: 0.05     // $0.05 per analysis request (3x markup from ~$0.015 cost)
}

export async function trackUsage(params: UsageTrackingParams): Promise<void> {
  try {
    const supabase = await createClient()
    
    const unitCost = params.unitCost || defaultUnitCosts[params.resourceType]
    const totalCost = params.amount * unitCost
    
    await supabase
      .from('usage_events')
      .insert({
        organization_id: params.organizationId,
        resource_type: params.resourceType,
        amount: params.amount,
        unit_cost: unitCost,
        total_cost: totalCost,
        campaign_id: params.campaignId,
        agent_id: params.agentId,
        contact_id: params.contactId,
        call_attempt_id: params.callAttemptId,
        description: params.description,
        metadata: params.metadata || {}
      })
  } catch (error) {
    console.error('Error tracking usage:', error)
    // Don't throw - usage tracking failures shouldn't break the main functionality
  }
}

export async function checkUsageQuota(
  organizationId: string, 
  resourceType: UsageTrackingParams['resourceType'],
  requestedAmount: number
): Promise<{ allowed: boolean; currentUsage: number; limit: number; overage: number }> {
  try {
    const supabase = await createClient()
    
    // Get current usage and limits
    const now = new Date()
    const periodStart = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padStart(2, '0') + '-01'
    
    const { data: usage } = await supabase
      .from('usage_tracking')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('resource_type', resourceType)
      .eq('billing_period_start', periodStart)
      .single()
    
    // Define tier limits for all plans
    // Note: 'starter' is our free tier with basic allowances, 'free' is same as starter
    const tierLimits: Record<string, Record<string, number>> = {
      free: { llm_tokens: 5000, analytics_tokens: 0, call_minutes: 0, sms_messages: 0, transcription_minutes: 0, ai_analysis_requests: 0 },
      starter: { llm_tokens: 10000, analytics_tokens: 10000, call_minutes: 500, sms_messages: 500, transcription_minutes: 50, ai_analysis_requests: 25 },
      professional: { llm_tokens: 100000, analytics_tokens: 100000, call_minutes: 5000, sms_messages: 5000, transcription_minutes: 500, ai_analysis_requests: 250 },
      enterprise: { llm_tokens: 1000000, analytics_tokens: 1000000, call_minutes: 999999, sms_messages: 999999, transcription_minutes: 999999, ai_analysis_requests: 999999 }
    }
    
    if (!usage) {
      // No usage record exists, check subscription tier limits
      const { data: org } = await supabase
        .from('organizations')
        .select('subscription_tier')
        .eq('id', organizationId)
        .single()
      
      if (!org) {
        return { allowed: false, currentUsage: 0, limit: 0, overage: requestedAmount }
      }
      
      const tier = org.subscription_tier || 'starter'
      const limit = tierLimits[tier]?.[resourceType] || 0
      
      return {
        allowed: requestedAmount <= limit,
        currentUsage: 0,
        limit: limit,
        overage: Math.max(0, requestedAmount - limit)
      }
    }
    
    // If usage record exists, we need to check the actual limits from tier
    const { data: org } = await supabase
      .from('organizations')
      .select('subscription_tier')
      .eq('id', organizationId)
      .single()
    
    const tier = org?.subscription_tier || 'starter'
    // Use the tier limit from our code, not the database tier_included value
    const actualLimit = tierLimits[tier]?.[resourceType] || 0
    
    const currentUsage = usage.used_amount || 0
    const newTotal = currentUsage + requestedAmount
    
    return {
      allowed: newTotal <= actualLimit,
      currentUsage,
      limit: actualLimit,
      overage: Math.max(0, newTotal - actualLimit)
    }
  } catch (error) {
    console.error('Error checking usage quota:', error)
    return { allowed: false, currentUsage: 0, limit: 0, overage: requestedAmount }
  }
}

// Middleware to check usage before expensive operations
export async function withUsageCheck<T>(
  organizationId: string,
  resourceType: UsageTrackingParams['resourceType'],
  requestedAmount: number,
  operation: () => Promise<T>
): Promise<T> {
  const quotaCheck = await checkUsageQuota(organizationId, resourceType, requestedAmount)
  
  if (!quotaCheck.allowed) {
    throw new Error(`Usage limit exceeded. Current: ${quotaCheck.currentUsage}, Limit: ${quotaCheck.limit}, Requested: ${requestedAmount}`)
  }
  
  return await operation()
}

// Track LLM token usage for AI features
export async function trackLLMUsage(params: {
  organizationId: string
  tokens: number
  model?: string
  feature: string
  campaignId?: string
  agentId?: string
  contactId?: string
  metadata?: Record<string, any>
}) {
  await trackUsage({
    organizationId: params.organizationId,
    resourceType: 'llm_tokens',
    amount: params.tokens,
    description: `AI ${params.feature} - ${params.tokens} tokens${params.model ? ` (${params.model})` : ''}`,
    campaignId: params.campaignId,
    agentId: params.agentId,
    contactId: params.contactId,
    metadata: {
      model: params.model,
      feature: params.feature,
      ...params.metadata
    }
  })
}

// Track analytics token usage
export async function trackAnalyticsUsage(params: {
  organizationId: string
  tokens: number
  analysisType: string
  campaignId?: string
  metadata?: Record<string, any>
}) {
  await trackUsage({
    organizationId: params.organizationId,
    resourceType: 'analytics_tokens',
    amount: params.tokens,
    description: `Analytics ${params.analysisType} - ${params.tokens} tokens`,
    campaignId: params.campaignId,
    metadata: {
      analysis_type: params.analysisType,
      ...params.metadata
    }
  })
}

// Track SMS usage
export async function trackSMSUsage(params: {
  organizationId: string
  messageCount: number
  phoneNumber: string
  campaignId?: string
  agentId?: string
  contactId?: string
  direction: 'inbound' | 'outbound'
}) {
  await trackUsage({
    organizationId: params.organizationId,
    resourceType: 'sms_messages',
    amount: params.messageCount,
    description: `${params.direction === 'outbound' ? 'Outbound' : 'Inbound'} SMS to ${params.phoneNumber}`,
    campaignId: params.campaignId,
    agentId: params.agentId,
    contactId: params.contactId,
    metadata: {
      phone_number: params.phoneNumber,
      direction: params.direction
    }
  })
}

// Track AssemblyAI transcription usage
export async function trackAssemblyAIUsage(params: {
  organizationId: string
  audioMinutes: number
  recordingSid?: string
  features?: string[]
  campaignId?: string
  agentId?: string
  contactId?: string
  callAttemptId?: string
}) {
  await trackUsage({
    organizationId: params.organizationId,
    resourceType: 'transcription_minutes',
    amount: params.audioMinutes,
    description: `AssemblyAI transcription - ${params.audioMinutes.toFixed(2)} minutes${params.features ? ` (${params.features.join(', ')})` : ''}`,
    campaignId: params.campaignId,
    agentId: params.agentId,
    contactId: params.contactId,
    callAttemptId: params.callAttemptId,
    metadata: {
      recording_sid: params.recordingSid,
      features_used: params.features || [],
      service: 'assemblyai'
    }
  })
}

// Track AI analysis requests
export async function trackAIAnalysisUsage(params: {
  organizationId: string
  analysisCount: number
  analysisType: 'call_analysis' | 'enhanced_analysis' | 'sms_analysis' | 'sentiment_analysis'
  model?: string
  campaignId?: string
  agentId?: string
  contactId?: string
  callAttemptId?: string
  metadata?: Record<string, any>
}) {
  await trackUsage({
    organizationId: params.organizationId,
    resourceType: 'ai_analysis_requests',
    amount: params.analysisCount,
    description: `AI ${params.analysisType} analysis${params.model ? ` (${params.model})` : ''}`,
    campaignId: params.campaignId,
    agentId: params.agentId,
    contactId: params.contactId,
    callAttemptId: params.callAttemptId,
    metadata: {
      analysis_type: params.analysisType,
      model: params.model,
      service: 'openai',
      ...params.metadata
    }
  })
}