import { NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { createClient } from '@supabase/supabase-js'
import { billingLogger } from '@/lib/logger'

export interface StripePriceInfo {
  id: string
  amount: number // in dollars
  currency: string
  interval: 'month' | 'year' | null
  intervalCount: number | null
  productId: string
  productName: string
  planSlug: string | null
  billingPeriod: 'monthly' | 'annual' | null
}

export interface StripePricesResponse {
  prices: Record<string, StripePriceInfo>
  planPrices: Record<string, { monthly: StripePriceInfo | null; annual: StripePriceInfo | null }>
  fetchedAt: string
}

// Fetch plan price IDs from database (single source of truth)
async function getPlanPriceIdsFromDatabase(): Promise<Record<string, { monthly: string; annual: string }>> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: plans, error } = await supabase
    .from('subscription_plans')
    .select('slug, stripe_price_id_monthly, stripe_price_id_yearly')
    .eq('is_active', true)

  if (error) {
    billingLogger.error('Failed to fetch plan price IDs from database', { error })
    return {}
  }

  const priceIds: Record<string, { monthly: string; annual: string }> = {}
  for (const plan of plans || []) {
    priceIds[plan.slug] = {
      monthly: plan.stripe_price_id_monthly || '',
      annual: plan.stripe_price_id_yearly || '',
    }
  }

  return priceIds
}

// Build reverse map from price ID to plan slug and billing period
function buildPriceIdMap(planPriceIds: Record<string, { monthly: string; annual: string }>): Record<string, { planSlug: string; billingPeriod: 'monthly' | 'annual' }> {
  const map: Record<string, { planSlug: string; billingPeriod: 'monthly' | 'annual' }> = {}

  for (const [planSlug, prices] of Object.entries(planPriceIds)) {
    if (prices.monthly) {
      map[prices.monthly] = { planSlug, billingPeriod: 'monthly' }
    }
    if (prices.annual) {
      map[prices.annual] = { planSlug, billingPeriod: 'annual' }
    }
  }

  return map
}

export async function GET() {
  try {
    // Fetch plan price IDs from database (single source of truth)
    const planPriceIds = await getPlanPriceIdsFromDatabase()

    // Collect all price IDs we need to fetch from Stripe
    const priceIds: string[] = []
    for (const prices of Object.values(planPriceIds)) {
      if (prices.monthly) priceIds.push(prices.monthly)
      if (prices.annual) priceIds.push(prices.annual)
    }

    // Filter out empty strings
    const validPriceIds = priceIds.filter(id => id)

    if (validPriceIds.length === 0) {
      return NextResponse.json({
        prices: {},
        planPrices: {},
        fetchedAt: new Date().toISOString(),
      })
    }

    // Fetch all prices from Stripe in one call
    const pricePromises = validPriceIds.map(id =>
      stripe.prices.retrieve(id, { expand: ['product'] }).catch(err => {
        billingLogger.error('Failed to fetch price', { data: { priceId: id }, error: err })
        return null
      })
    )

    const stripeResults = await Promise.all(pricePromises)

    // Build the price ID to plan info map
    const priceIdMap = buildPriceIdMap(planPriceIds)

    // Build response
    const prices: Record<string, StripePriceInfo> = {}
    const planPrices: Record<string, { monthly: StripePriceInfo | null; annual: StripePriceInfo | null }> = {}

    // Initialize planPrices with all known plans from database
    for (const planSlug of Object.keys(planPriceIds)) {
      planPrices[planSlug] = { monthly: null, annual: null }
    }

    for (const price of stripeResults) {
      if (!price) continue

      const product = price.product as { id: string; name: string }
      const planInfo = priceIdMap[price.id]

      const priceInfo: StripePriceInfo = {
        id: price.id,
        amount: (price.unit_amount || 0) / 100, // Convert cents to dollars
        currency: price.currency,
        interval: (price.recurring?.interval === 'month' || price.recurring?.interval === 'year') ? price.recurring.interval : null,
        intervalCount: price.recurring?.interval_count || null,
        productId: typeof product === 'string' ? product : product.id,
        productName: typeof product === 'string' ? '' : product.name,
        planSlug: planInfo?.planSlug || null,
        billingPeriod: planInfo?.billingPeriod || null,
      }

      prices[price.id] = priceInfo

      // Also organize by plan slug
      if (planInfo) {
        planPrices[planInfo.planSlug][planInfo.billingPeriod] = priceInfo
      }
    }

    const response: StripePricesResponse = {
      prices,
      planPrices,
      fetchedAt: new Date().toISOString(),
    }

    return NextResponse.json(response, {
      headers: {
        // Cache for 5 minutes on CDN, allow stale for 1 hour while revalidating
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    })
  } catch (error) {
    billingLogger.error('Failed to fetch Stripe prices', { error })
    return NextResponse.json(
      { error: 'Failed to fetch prices' },
      { status: 500 }
    )
  }
}
