import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { billingService } from '@/lib/services/billing'
import { useAuth } from './useAuth'
import { useProfile } from './useProfile'
import { toast } from 'sonner'

export function useBilling() {
  const { user, supabase } = useAuth()
  const { profile } = useProfile()
  const queryClient = useQueryClient()

  // Get organization_id from organization_members (more reliable than user_profiles)
  const { data: orgMember } = useQuery({
    queryKey: ['billing-org-member', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single()
      return data
    },
    enabled: !!user?.id,
  })

  // Get user's organization ID from organization_members first, then fallback to profile
  const organizationId = orgMember?.organization_id || profile?.organization_id || user?.user_metadata?.organization_id || ''

  // Get all plans
  const { data: plans, isLoading: plansLoading } = useQuery({
    queryKey: ['subscription-plans'],
    queryFn: () => billingService.getPlans(),
    staleTime: 1000 * 60 * 60, // Cache for 1 hour
  })

  // Get organization limits and usage
  const { 
    data: limits, 
    isLoading: limitsLoading,
    refetch: refetchLimits,
    error: limitsError 
  } = useQuery({
    queryKey: ['organization-limits', organizationId],
    queryFn: async () => {
      if (!organizationId) {
        console.warn('No organization ID available for billing')
        return null
      }
      
      const result = await billingService.getOrganizationLimits(organizationId)
      
      // Log warning if no limits found but don't crash
      if (!result) {
        console.warn('No billing limits found for organization:', organizationId)
      }
      
      return result
    },
    enabled: !!organizationId,
    refetchInterval: 1000 * 60, // Refetch every minute
    retry: 1, // Only retry once to avoid spamming
  })

  // Check trial status
  const { data: trialDaysRemaining } = useQuery({
    queryKey: ['trial-days', organizationId],
    queryFn: () => billingService.getTrialDaysRemaining(organizationId),
    enabled: !!organizationId && limits?.subscription_status === 'trialing',
    refetchInterval: 1000 * 60 * 60, // Refetch every hour
  })

  // Check feature access
  const checkFeature = async (featureName: string) => {
    if (!organizationId) return false
    const result = await billingService.checkFeatureAccess(organizationId, featureName)
    return result.hasAccess
  }

  // Check usage limit
  const checkUsage = async (
    resourceType: 'agents' | 'contacts' | 'call_minutes' | 'sms_messages' | 'campaigns',
    amount: number = 1
  ) => {
    if (!organizationId) return { can_use: false }
    return await billingService.checkUsageLimit(organizationId, resourceType, amount)
  }

  // Track usage mutation
  const trackUsageMutation = useMutation({
    mutationFn: ({ resourceType, amount, metadata }: {
      resourceType: string
      amount: number
      metadata?: Record<string, any>
    }) => billingService.trackUsage(organizationId, resourceType, amount, metadata),
    onSuccess: () => {
      // Refetch limits to update usage display
      queryClient.invalidateQueries({ queryKey: ['organization-limits', organizationId] })
    },
    onError: (error) => {
      console.error('Failed to track usage:', error)
    },
  })

  // Check if can make call
  const canMakeCall = async (estimatedMinutes: number = 5) => {
    if (!organizationId) return { canCall: false, reason: 'No organization' }
    return await billingService.canMakeCall(organizationId, estimatedMinutes)
  }

  // Helper to check if at limit
  const isAtLimit = (resourceType: string): boolean => {
    if (!limits) return false
    
    switch (resourceType) {
      case 'agents':
        return limits.current_agents >= limits.max_agents
      case 'contacts':
        return limits.current_contacts >= limits.max_contacts
      case 'campaigns':
        return limits.current_campaigns >= limits.max_campaigns
      case 'call_minutes':
        return limits.used_call_minutes >= limits.max_call_minutes
      case 'sms_messages':
        return limits.used_sms_messages >= limits.max_sms_messages
      default:
        return false
    }
  }

  // Helper to get usage percentage
  const getUsagePercentage = (resourceType: string): number => {
    if (!limits) return 0
    
    switch (resourceType) {
      case 'agents':
        return limits.agents_percentage
      case 'contacts':
        return limits.contacts_percentage
      case 'call_minutes':
        return limits.call_minutes_percentage
      default:
        return 0
    }
  }

  // Show upgrade prompt
  const showUpgradePrompt = (reason: string) => {
    toast.error(reason, {
      action: {
        label: 'Upgrade Plan',
        onClick: () => {
          // Navigate to billing page
          window.location.href = '/dashboard/settings?tab=billing'
        }
      },
      duration: 5000,
    })
  }

  return {
    // Data
    plans,
    limits,
    trialDaysRemaining,
    
    // Loading states
    isLoading: plansLoading || limitsLoading,
    
    // Methods
    checkFeature,
    checkUsage,
    trackUsage: trackUsageMutation.mutate,
    canMakeCall,
    isAtLimit,
    getUsagePercentage,
    showUpgradePrompt,
    refetchLimits,
    
    // Helpers
    formatUsage: billingService.formatUsage,
    getUsageClass: billingService.getUsageClass,
  }
}