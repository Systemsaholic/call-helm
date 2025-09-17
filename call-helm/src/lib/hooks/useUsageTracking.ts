import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/hooks/useAuth'
import { toast } from 'sonner'

export interface UsageEvent {
  id: string
  resource_type: 'llm_tokens' | 'analytics_tokens' | 'call_minutes' | 'sms_messages'
  amount: number
  unit_cost: number
  total_cost: number
  description: string
  created_at: string
}

export interface UsageSummary {
  resource_type: string
  tier_included: number
  used_amount: number
  overage_amount: number
  overage_cost: number
  period_start: string
  period_end: string
}

// Query keys
export const usageKeys = {
  all: ['usage'] as const,
  summaries: () => [...usageKeys.all, 'summaries'] as const,
  summary: (period: string) => [...usageKeys.summaries(), period] as const,
  events: () => [...usageKeys.all, 'events'] as const,
  event: (filters?: any) => [...usageKeys.events(), filters] as const,
}

// Get current period usage summary
export function useUsageSummary(period?: string) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: usageKeys.summary(period || 'current'),
    queryFn: async () => {
      if (!user) return []

      // Get user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!member) throw new Error('Organization not found')

      // Calculate current billing period
      const now = new Date()
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)

      const { data, error } = await supabase
        .from('usage_tracking')
        .select('*')
        .eq('organization_id', member.organization_id)
        .eq('billing_period_start', periodStart.toISOString().split('T')[0])

      if (error) throw error

      return data as UsageSummary[]
    },
    enabled: !!user,
  })
}

// Get usage events with filters
export function useUsageEvents(filters?: {
  resourceType?: string
  startDate?: string
  endDate?: string
  campaignId?: string
  agentId?: string
  limit?: number
}) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: usageKeys.event(filters),
    queryFn: async () => {
      if (!user) return []

      // Get user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!member) throw new Error('Organization not found')

      let query = supabase
        .from('usage_events')
        .select(`
          *,
          campaign:call_lists(name),
          agent:organization_members(full_name, email)
        `)
        .eq('organization_id', member.organization_id)
        .order('created_at', { ascending: false })

      // Apply filters
      if (filters?.resourceType) {
        query = query.eq('resource_type', filters.resourceType)
      }
      if (filters?.startDate) {
        query = query.gte('created_at', filters.startDate)
      }
      if (filters?.endDate) {
        query = query.lte('created_at', filters.endDate)
      }
      if (filters?.campaignId) {
        query = query.eq('campaign_id', filters.campaignId)
      }
      if (filters?.agentId) {
        query = query.eq('agent_id', filters.agentId)
      }
      if (filters?.limit) {
        query = query.limit(filters.limit)
      }

      const { data, error } = await query

      if (error) throw error
      return data as UsageEvent[]
    },
    enabled: !!user,
  })
}

// Track usage event
export function useTrackUsage() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: {
      resourceType: 'llm_tokens' | 'analytics_tokens' | 'call_minutes' | 'sms_messages'
      amount: number
      unitCost?: number
      campaignId?: string
      agentId?: string
      contactId?: string
      callAttemptId?: string
      description: string
      metadata?: Record<string, any>
    }) => {
      if (!user) throw new Error('User not authenticated')

      // Get user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('id, organization_id')
        .eq('user_id', user.id)
        .single()

      if (!member) throw new Error('Organization not found')

      // Get default unit costs
      const unitCosts = {
        llm_tokens: 0.000001, // $0.000001 per token
        analytics_tokens: 0.0000005, // $0.0000005 per token
        call_minutes: 0.025, // $0.025 per minute
        sms_messages: 0.03 // $0.03 per message
      }

      const unitCost = params.unitCost || unitCosts[params.resourceType]
      const totalCost = params.amount * unitCost

      // Create usage event
      const { data, error } = await supabase
        .from('usage_events')
        .insert({
          organization_id: member.organization_id,
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
        .select()
        .single()

      if (error) throw error

      // Update usage tracking summary
      const now = new Date()
      const periodStart = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padStart(2, '0') + '-01'
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        .toISOString().split('T')[0]

      await supabase
        .rpc('update_usage_tracking', {
          p_org_id: member.organization_id,
          p_resource_type: params.resourceType,
          p_period_start: periodStart,
          p_period_end: periodEnd,
          p_amount: params.amount,
          p_cost: totalCost
        })

      return data
    },
    onSuccess: () => {
      // Invalidate and refetch usage queries
      queryClient.invalidateQueries({ queryKey: usageKeys.summaries() })
      queryClient.invalidateQueries({ queryKey: usageKeys.events() })
    },
    onError: (error: any) => {
      console.error('Usage tracking error:', error)
      toast.error('Failed to track usage')
    }
  })
}

// Check if organization can perform action based on limits
export function useCanPerformAction() {
  const { supabase, user } = useAuth()

  return useMutation({
    mutationFn: async (params: {
      resourceType: 'llm_tokens' | 'analytics_tokens' | 'call_minutes' | 'sms_messages'
      requestedAmount: number
    }) => {
      if (!user) throw new Error('User not authenticated')

      // Get user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!member) throw new Error('Organization not found')

      // Check current usage and limits
      const now = new Date()
      const periodStart = now.getFullYear() + '-' + (now.getMonth() + 1).toString().padStart(2, '0') + '-01'

      const { data: usage } = await supabase
        .from('usage_tracking')
        .select('*')
        .eq('organization_id', member.organization_id)
        .eq('resource_type', params.resourceType)
        .eq('billing_period_start', periodStart)
        .single()

      if (!usage) {
        // No usage record exists, check subscription tier limits
        const { data: org } = await supabase
          .from('organizations')
          .select('subscription_tier, balance, negative_balance_limit')
          .eq('id', member.organization_id)
          .single()

        if (!org) throw new Error('Organization not found')

        // Define tier limits
        const tierLimits = {
          starter: { llm_tokens: 0, analytics_tokens: 0, call_minutes: 0, sms_messages: 0 },
          professional: { llm_tokens: 100000, analytics_tokens: 50000, call_minutes: 500, sms_messages: 1000 },
          enterprise: { llm_tokens: 1000000, analytics_tokens: 500000, call_minutes: 2000, sms_messages: 5000 }
        }

        const tier = org.subscription_tier || 'starter'
        const limit = tierLimits[tier as keyof typeof tierLimits][params.resourceType as keyof typeof tierLimits.starter] || 0

        return {
          allowed: params.requestedAmount <= limit,
          currentUsage: 0,
          limit: limit,
          wouldExceed: params.requestedAmount > limit,
          overage: Math.max(0, params.requestedAmount - limit)
        }
      }

      const currentUsage = usage.used_amount || 0
      const tierIncluded = usage.tier_included || 0
      const newTotal = currentUsage + params.requestedAmount

      return {
        allowed: newTotal <= tierIncluded, // For now, don't allow overages automatically
        currentUsage,
        limit: tierIncluded,
        wouldExceed: newTotal > tierIncluded,
        overage: Math.max(0, newTotal - tierIncluded)
      }
    }
  })
}

// Get usage analytics
export function useUsageAnalytics(period: 'day' | 'week' | 'month' | 'year' = 'month') {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: [...usageKeys.all, 'analytics', period],
    queryFn: async () => {
      if (!user) return null

      // Get user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!member) throw new Error('Organization not found')

      // Calculate date range based on period
      const now = new Date()
      let startDate: Date
      
      switch (period) {
        case 'day':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
          break
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1)
          break
        case 'year':
          startDate = new Date(now.getFullYear(), 0, 1)
          break
      }

      // Get usage events for the period
      const { data: events, error } = await supabase
        .from('usage_events')
        .select('*')
        .eq('organization_id', member.organization_id)
        .gte('created_at', startDate.toISOString())
        .order('created_at')

      if (error) throw error

      // Group by resource type and date
      const analytics = events.reduce((acc: any, event) => {
        const date = event.created_at.split('T')[0]
        const resourceType = event.resource_type

        if (!acc[resourceType]) {
          acc[resourceType] = {}
        }
        if (!acc[resourceType][date]) {
          acc[resourceType][date] = {
            amount: 0,
            cost: 0,
            count: 0
          }
        }

        acc[resourceType][date].amount += event.amount
        acc[resourceType][date].cost += event.total_cost
        acc[resourceType][date].count += 1

        return acc
      }, {})

      return analytics
    },
    enabled: !!user,
  })
}