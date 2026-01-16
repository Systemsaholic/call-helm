import { useQuery } from '@tanstack/react-query'
import type { StripePricesResponse, StripePriceInfo } from '@/app/api/stripe/prices/route'

export interface PlanPricing {
  monthly: number | null
  yearly: number | null
  monthlyPriceId: string | null
  yearlyPriceId: string | null
  currency: string
  // Computed values
  monthlyEquivalentYearly: number | null // yearly price / 12
  savingsPercentage: number | null // how much you save with yearly
}

export interface StripePrices {
  // Raw prices by price ID
  byPriceId: Record<string, StripePriceInfo>
  // Organized by plan slug
  byPlan: Record<string, PlanPricing>
  // Loading/error state
  isLoading: boolean
  isError: boolean
  error: Error | null
  // Helpers
  getPlanPrice: (planSlug: string, period: 'monthly' | 'yearly') => number | null
  getPlanPriceFormatted: (planSlug: string, period: 'monthly' | 'yearly') => string
  getSavingsPercentage: (planSlug: string) => number | null
  formatPrice: (amount: number | null, options?: { showCurrency?: boolean }) => string
}

async function fetchStripePrices(): Promise<StripePricesResponse> {
  const response = await fetch('/api/stripe/prices')
  if (!response.ok) {
    throw new Error('Failed to fetch Stripe prices')
  }
  return response.json()
}

export function useStripePrices(): StripePrices {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['stripe-prices'],
    queryFn: fetchStripePrices,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 60, // 1 hour (formerly cacheTime)
    retry: 2,
    refetchOnWindowFocus: false,
  })

  // Transform the data into a more usable format
  const byPlan: Record<string, PlanPricing> = {}

  if (data?.planPrices) {
    for (const [planSlug, prices] of Object.entries(data.planPrices)) {
      const monthly = prices.monthly?.amount ?? null
      const yearly = prices.annual?.amount ?? null
      const monthlyEquivalentYearly = yearly !== null ? Math.round((yearly / 12) * 100) / 100 : null

      let savingsPercentage: number | null = null
      if (monthly !== null && yearly !== null && monthly > 0) {
        const yearlyEquivalent = monthly * 12
        savingsPercentage = Math.round(((yearlyEquivalent - yearly) / yearlyEquivalent) * 100)
      }

      byPlan[planSlug] = {
        monthly,
        yearly,
        monthlyPriceId: prices.monthly?.id ?? null,
        yearlyPriceId: prices.annual?.id ?? null,
        currency: prices.monthly?.currency || prices.annual?.currency || 'usd',
        monthlyEquivalentYearly,
        savingsPercentage,
      }
    }
  }

  // Helper functions
  const getPlanPrice = (planSlug: string, period: 'monthly' | 'yearly'): number | null => {
    const planPricing = byPlan[planSlug]
    if (!planPricing) return null
    return period === 'monthly' ? planPricing.monthly : planPricing.yearly
  }

  const formatPrice = (amount: number | null, options?: { showCurrency?: boolean }): string => {
    if (amount === null) return '—'
    const formatted = amount.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })
    return options?.showCurrency !== false ? `$${formatted} USD` : `$${formatted}`
  }

  const getPlanPriceFormatted = (planSlug: string, period: 'monthly' | 'yearly'): string => {
    const price = getPlanPrice(planSlug, period)
    return formatPrice(price)
  }

  const getSavingsPercentage = (planSlug: string): number | null => {
    return byPlan[planSlug]?.savingsPercentage ?? null
  }

  return {
    byPriceId: data?.prices || {},
    byPlan,
    isLoading,
    isError,
    error: error as Error | null,
    getPlanPrice,
    getPlanPriceFormatted,
    getSavingsPercentage,
    formatPrice,
  }
}
