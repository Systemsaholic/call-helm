import { createClient } from '@/lib/supabase/client'
import { Database } from '@/lib/database.types'

type SubscriptionPlan = Database['public']['Tables']['subscription_plans']['Row']
type Organization = Database['public']['Tables']['organizations']['Row']

export interface UsageLimitCheck {
  can_use: boolean
  limit: number
  used: number
  available: number
  requested: number
  percentage: number
  resource_type: string
  error?: string
}

export interface FeatureCheck {
  hasAccess: boolean
  feature: string
  reason?: string
}

export interface PlanLimits {
  organization_id: string
  organization_name: string
  subscription_status: string
  trial_ends_at: string | null
  plan_slug: string
  plan_name: string
  plan_display_name: string
  price_monthly: number
  max_agents: number
  max_contacts: number
  max_call_minutes: number
  max_sms_messages: number
  max_campaigns: number
  max_storage_gb: number
  max_phone_numbers?: number
  max_ai_tokens_per_month?: number
  max_transcription_minutes_per_month?: number
  max_ai_analysis_per_month?: number
  features: Record<string, boolean>
  badge_text: string | null
  current_agents: number
  current_contacts: number
  current_campaigns: number
  current_phone_numbers?: number
  used_call_minutes: number
  used_sms_messages: number
  used_ai_tokens?: number
  used_transcription_minutes?: number
  used_ai_analysis?: number
  call_minutes_percentage: number
  contacts_percentage: number
  agents_percentage: number
  phone_numbers_percentage?: number
  ai_tokens_percentage?: number
  transcription_percentage?: number
  ai_analysis_percentage?: number
}

export class BillingService {
  private supabase = createClient()

  /**
   * Get all available subscription plans
   */
  async getPlans(): Promise<SubscriptionPlan[]> {
    const { data, error } = await this.supabase
      .from('subscription_plans')
      .select('*')
      .eq('is_active', true)
      .order('display_order')

    if (error) throw error
    return data || []
  }

  /**
   * Get organization's current plan and usage limits
   */
  async getOrganizationLimits(organizationId: string): Promise<PlanLimits | null> {
    try {
      const { data, error } = await this.supabase
        .from('organization_limits')
        .select('*')
        .eq('organization_id', organizationId)
        .single()

      if (error) {
        // Better error logging with actual error details
        console.error('Error fetching organization limits:', {
          code: error.code,
          message: error.message,
          details: error.details,
          organizationId
        })
        
        // Return null instead of throwing to prevent app crashes
        return null
      }

      return data
    } catch (err) {
      console.error('Unexpected error fetching organization limits:', err)
      return null
    }
  }

  /**
   * Check if organization has access to a specific feature
   */
  async checkFeatureAccess(
    organizationId: string, 
    featureName: string
  ): Promise<FeatureCheck> {
    try {
      const { data, error } = await this.supabase.rpc('check_feature_access', {
        p_organization_id: organizationId,
        p_feature_name: featureName
      })

      if (error) throw error

      return {
        hasAccess: data || false,
        feature: featureName,
        reason: data ? undefined : 'Feature not available in current plan'
      }
    } catch (error) {
      console.error('Error checking feature access:', error)
      return {
        hasAccess: false,
        feature: featureName,
        reason: 'Error checking feature access'
      }
    }
  }

  /**
   * Check if organization can use more of a resource (agents, minutes, etc)
   */
  async checkUsageLimit(
    organizationId: string,
    resourceType: 'agents' | 'contacts' | 'call_minutes' | 'sms_messages' | 'campaigns' | 'phone_numbers' | 'ai_tokens' | 'transcription_minutes' | 'ai_analysis_requests',
    amount: number = 1
  ): Promise<UsageLimitCheck> {
    try {
      const { data, error } = await this.supabase.rpc('check_usage_limit', {
        p_organization_id: organizationId,
        p_resource_type: resourceType,
        p_amount: amount
      })

      if (error) throw error

      return data as UsageLimitCheck
    } catch (error) {
      console.error('Error checking usage limit:', error)
      return {
        can_use: false,
        limit: 0,
        used: 0,
        available: 0,
        requested: amount,
        percentage: 0,
        resource_type: resourceType,
        error: 'Error checking usage limits'
      }
    }
  }

  /**
   * Track usage event (for minutes, SMS, etc)
   */
  async trackUsage(
    organizationId: string,
    resourceType: string,
    amount: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    const unitCost = this.getUnitCost(resourceType)
    
    const { error } = await this.supabase
      .from('usage_events')
      .insert({
        organization_id: organizationId,
        resource_type: resourceType,
        amount,
        unit_cost: unitCost,
        total_cost: amount * unitCost,
        description: `${resourceType} usage`,
        metadata: metadata || {}
      })

    if (error) {
      console.error('Error tracking usage:', error)
      throw error
    }
  }

  /**
   * Get unit cost for different resource types
   */
  private getUnitCost(resourceType: string): number {
    const costs: Record<string, number> = {
      'call_minutes': 0.025,  // $0.025 per minute
      'sms_messages': 0.01,   // $0.01 per SMS
      'ai_analysis': 0.05,    // $0.05 per AI analysis
      'storage_gb': 0.10,     // $0.10 per GB per month
      'transcription_minutes': 0.02, // $0.02 per minute
    }
    return costs[resourceType] || 0
  }

  /**
   * Check if trial has expired
   */
  async isTrialExpired(organizationId: string): Promise<boolean> {
    const limits = await this.getOrganizationLimits(organizationId)
    
    if (!limits) return false
    
    if (limits.subscription_status !== 'trialing') {
      return false
    }

    if (!limits.trial_ends_at) {
      return false
    }

    return new Date(limits.trial_ends_at) < new Date()
  }

  /**
   * Get days remaining in trial
   */
  async getTrialDaysRemaining(organizationId: string): Promise<number> {
    const limits = await this.getOrganizationLimits(organizationId)
    
    if (!limits || limits.subscription_status !== 'trialing' || !limits.trial_ends_at) {
      return 0
    }

    const now = new Date()
    const trialEnd = new Date(limits.trial_ends_at)
    const diffTime = trialEnd.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    
    return Math.max(0, diffDays)
  }

  /**
   * Format usage for display
   */
  formatUsage(used: number, limit: number): string {
    if (limit >= 999999) {
      return `${used.toLocaleString()} / Unlimited`
    }
    return `${used.toLocaleString()} / ${limit.toLocaleString()}`
  }

  /**
   * Get usage percentage class for UI
   */
  getUsageClass(percentage: number): string {
    if (percentage >= 90) return 'text-red-600 bg-red-100'
    if (percentage >= 75) return 'text-amber-600 bg-amber-100'
    if (percentage >= 50) return 'text-yellow-600 bg-yellow-100'
    return 'text-green-600 bg-green-100'
  }

  /**
   * Check if organization can make a call
   */
  async canMakeCall(organizationId: string, estimatedMinutes: number = 5): Promise<{
    canCall: boolean
    reason?: string
    minutesAvailable?: number
  }> {
    // Check feature access
    const featureCheck = await this.checkFeatureAccess(organizationId, 'voice_calls')
    if (!featureCheck.hasAccess) {
      return {
        canCall: false,
        reason: 'Voice calls not available in your plan'
      }
    }

    // Check minutes limit
    const usageCheck = await this.checkUsageLimit(organizationId, 'call_minutes', estimatedMinutes)
    if (!usageCheck.can_use) {
      return {
        canCall: false,
        reason: `Insufficient minutes. ${usageCheck.available} minutes remaining this month`,
        minutesAvailable: usageCheck.available
      }
    }

    return {
      canCall: true,
      minutesAvailable: usageCheck.available
    }
  }

  /**
   * Check if organization can purchase a phone number
   */
  async canPurchasePhoneNumber(organizationId: string): Promise<{
    canPurchase: boolean
    reason?: string
    numbersAvailable?: number
    currentCount?: number
    limit?: number
  }> {
    try {
      const limits = await this.getOrganizationLimits(organizationId)
      if (!limits) {
        return {
          canPurchase: false,
          reason: 'Unable to determine plan limits'
        }
      }

      // Check if phone number management is available in plan
      const hasPhoneManagement = limits.features?.phone_number_management || false
      if (!hasPhoneManagement) {
        return {
          canPurchase: false,
          reason: 'Phone number management not available in your plan'
        }
      }

      // Get current phone number count
      const { data: phoneNumbers, error } = await this.supabase
        .from('phone_numbers')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('status', 'active')

      if (error) {
        console.error('Error checking phone number count:', error)
        return {
          canPurchase: false,
          reason: 'Unable to check current phone number usage'
        }
      }

      const currentCount = phoneNumbers?.length || 0
      const limit = limits.max_phone_numbers || 0

      // Enterprise plans (999+ limit) have fair use policy  
      if (limit >= 999) {
        return {
          canPurchase: true,
          currentCount,
          limit,
          numbersAvailable: limit - currentCount
        }
      }

      // Check if under limit
      if (currentCount >= limit) {
        return {
          canPurchase: false,
          reason: `Phone number limit reached (${currentCount}/${limit}). Upgrade your plan or purchase additional numbers.`,
          currentCount,
          limit,
          numbersAvailable: 0
        }
      }

      return {
        canPurchase: true,
        currentCount,
        limit,
        numbersAvailable: limit - currentCount
      }
    } catch (error) {
      console.error('Error checking phone number purchase eligibility:', error)
      return {
        canPurchase: false,
        reason: 'Error checking phone number eligibility'
      }
    }
  }

  /**
   * Check if organization can use AI services (tokens, transcription, analysis)
   */
  async canUseAIService(
    organizationId: string, 
    serviceType: 'ai_tokens' | 'transcription_minutes' | 'ai_analysis_requests',
    requestedAmount: number = 1
  ): Promise<{
    canUse: boolean
    reason?: string
    available?: number
    used?: number
    limit?: number
  }> {
    try {
      const limits = await this.getOrganizationLimits(organizationId)
      if (!limits) {
        return {
          canUse: false,
          reason: 'Unable to determine plan limits'
        }
      }

      // Check AI feature access
      const hasAIAccess = limits.features?.ai_analysis || limits.features?.call_transcription || false
      if (!hasAIAccess && serviceType !== 'ai_tokens') {
        return {
          canUse: false,
          reason: 'AI services not available in your plan'
        }
      }

      // Get current usage for this billing period
      const now = new Date()
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      
      const { data: usage } = await this.supabase
        .from('usage_events')
        .select('amount')
        .eq('organization_id', organizationId)
        .eq('resource_type', serviceType)
        .gte('created_at', periodStart.toISOString())

      const currentUsage = usage?.reduce((sum, event) => sum + (event.amount || 0), 0) || 0

      // Get limits based on service type and plan
      let limit = 0
      switch (serviceType) {
        case 'ai_tokens':
          limit = limits.max_ai_tokens_per_month || 0
          break
        case 'transcription_minutes':
          limit = limits.max_transcription_minutes_per_month || 0
          break
        case 'ai_analysis_requests':
          limit = limits.max_ai_analysis_per_month || 0
          break
      }

      // Enterprise plans have fair use (high limits)
      if (limit >= 999999) {
        return {
          canUse: true,
          available: limit - currentUsage,
          used: currentUsage,
          limit
        }
      }

      // Check if request would exceed limit
      if (currentUsage + requestedAmount > limit) {
        return {
          canUse: false,
          reason: `${serviceType.replace('_', ' ')} limit would be exceeded. Current: ${currentUsage}/${limit}`,
          available: Math.max(0, limit - currentUsage),
          used: currentUsage,
          limit
        }
      }

      return {
        canUse: true,
        available: limit - currentUsage,
        used: currentUsage,
        limit
      }
    } catch (error) {
      console.error('Error checking AI service usage:', error)
      return {
        canUse: false,
        reason: 'Error checking AI service limits'
      }
    }
  }
}

// Create a singleton instance
export const billingService = new BillingService()