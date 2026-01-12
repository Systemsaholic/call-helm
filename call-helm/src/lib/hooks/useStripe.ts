'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { toast } from 'sonner'

interface CheckoutOptions {
  planSlug: string
  billingPeriod: 'monthly' | 'annual'
  successUrl?: string
  cancelUrl?: string
}

interface PortalOptions {
  returnUrl?: string
}

export function useStripe() {
  const { user, supabase } = useAuth()

  // Get organization_id from organization_members (more reliable than user_profiles)
  const { data: orgMember } = useQuery({
    queryKey: ['stripe-org-member', user?.id],
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

  const organizationId = orgMember?.organization_id || user?.user_metadata?.organization_id || ''

  // Create checkout session and redirect
  const checkoutMutation = useMutation({
    mutationFn: async (options: CheckoutOptions) => {
      const response = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId,
          userId: user?.id,
          ...options,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create checkout session')
      }

      return response.json()
    },
    onSuccess: async (data) => {
      // Redirect to Stripe checkout URL
      if (data.url) {
        window.location.href = data.url
      } else {
        toast.error('Failed to get checkout URL')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  // Create portal session and redirect
  const portalMutation = useMutation({
    mutationFn: async (options?: PortalOptions) => {
      const response = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          organizationId,
          ...options,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create portal session')
      }

      return response.json()
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })

  return {
    // Actions
    createCheckout: checkoutMutation.mutate,
    createCheckoutAsync: checkoutMutation.mutateAsync,
    openBillingPortal: portalMutation.mutate,
    openBillingPortalAsync: portalMutation.mutateAsync,

    // Loading states
    isCheckoutLoading: checkoutMutation.isPending,
    isPortalLoading: portalMutation.isPending,

    // Organization ID for reference
    organizationId,
    hasStripeAccount: !!organizationId,
  }
}
