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
  features: Record<string, boolean>
  badge_text: string | null
  current_agents: number
  current_contacts: number
  current_campaigns: number
  used_call_minutes: number
  used_sms_messages: number
  call_minutes_percentage: number
  contacts_percentage: number
  agents_percentage: number
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
    resourceType: 'agents' | 'contacts' | 'call_minutes' | 'sms_messages' | 'campaigns',
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
}

// Create a singleton instance
export const billingService = new BillingService()