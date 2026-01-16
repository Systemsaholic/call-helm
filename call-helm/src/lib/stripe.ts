import Stripe from 'stripe'

// Server-side Stripe instance
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
  typescript: true,
})

// DEPRECATED: Legacy env var-based price ID mapping
// The database subscription_plans table is now the single source of truth.
// Use subscription_plans.stripe_price_id_monthly and stripe_price_id_yearly columns instead.
// This mapping is kept only for backwards compatibility during migration.
// @deprecated Use database columns instead
export const PLAN_PRICE_IDS: Record<string, { monthly: string; annual: string }> = {
  starter: {
    monthly: process.env.STRIPE_STARTER_MONTHLY_PRICE_ID || '',
    annual: process.env.STRIPE_STARTER_ANNUAL_PRICE_ID || '',
  },
  professional: {
    monthly: process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID || '',
    annual: process.env.STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID || '',
  },
  enterprise: {
    monthly: process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID || '',
    annual: process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID || '',
  },
}

// Metered price IDs for overage billing
// These are usage-based prices that get added to subscriptions for overage charges
// Create these in Stripe Dashboard as metered prices with usage_type: 'metered'
export const METERED_PRICE_IDS = {
  // Extra phone numbers beyond plan limit - $2.50/month per number
  phone_numbers: process.env.STRIPE_METERED_PHONE_NUMBERS_PRICE_ID || '',
  // Extra agents beyond plan limit - $15/month per agent
  agents: process.env.STRIPE_METERED_AGENTS_PRICE_ID || '',
  // Call minutes beyond plan limit - $0.025 per minute
  call_minutes: process.env.STRIPE_METERED_CALL_MINUTES_PRICE_ID || '',
  // SMS messages beyond plan limit - $0.02 per message
  sms_messages: process.env.STRIPE_METERED_SMS_PRICE_ID || '',
  // AI tokens beyond plan limit - $0.15 per 1000 tokens (billed per 1000)
  ai_tokens: process.env.STRIPE_METERED_AI_TOKENS_PRICE_ID || '',
  // Transcription minutes beyond plan limit - $0.003 per minute
  transcription_minutes: process.env.STRIPE_METERED_TRANSCRIPTION_PRICE_ID || '',
  // AI analysis requests beyond plan limit - $0.05 per request
  ai_analysis: process.env.STRIPE_METERED_AI_ANALYSIS_PRICE_ID || '',
  // Extra contacts beyond plan limit - $0.01 per 100 contacts (optional)
  contacts: process.env.STRIPE_METERED_CONTACTS_PRICE_ID || '',
}

// Resource type to metered price ID mapping
export type MeteredResourceType = keyof typeof METERED_PRICE_IDS

// Unit costs for overage (in cents) - must match Stripe price configuration
// Note: These are for reference/validation - actual pricing is set in Stripe
export const OVERAGE_UNIT_COSTS: Record<MeteredResourceType, number> = {
  phone_numbers: 250, // $2.50 per number/month
  agents: 1500, // $15 per agent/month
  call_minutes: 3, // $0.025 per minute (rounded to 3 cents)
  sms_messages: 2, // $0.02 per message
  ai_tokens: 15, // $0.15 per 1000 tokens (report quantity in thousands)
  transcription_minutes: 1, // $0.003 per minute (rounded to 1 cent min)
  ai_analysis: 5, // $0.05 per request
  contacts: 1, // $0.01 per 100 contacts (report quantity in hundreds)
}

// Map internal resource types to metered billing resource types
export const USAGE_TO_METERED_MAP: Record<string, MeteredResourceType | null> = {
  'call_minutes': 'call_minutes',
  'sms_messages': 'sms_messages',
  'llm_tokens': 'ai_tokens',
  'analytics_tokens': 'ai_tokens',
  'transcription_minutes': 'transcription_minutes',
  'ai_analysis_requests': 'ai_analysis',
}

// Map Stripe subscription status to our internal status
export function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): string {
  const statusMap: Record<Stripe.Subscription.Status, string> = {
    active: 'active',
    canceled: 'canceled',
    incomplete: 'incomplete',
    incomplete_expired: 'expired',
    past_due: 'past_due',
    paused: 'paused',
    trialing: 'trialing',
    unpaid: 'unpaid',
  }
  return statusMap[stripeStatus] || 'unknown'
}

/**
 * Get price ID for a plan and billing period
 * @deprecated Use database subscription_plans.stripe_price_id_monthly/yearly columns instead
 */
export function getPriceId(planSlug: string, billingPeriod: 'monthly' | 'annual'): string | null {
  const planPrices = PLAN_PRICE_IDS[planSlug]
  if (!planPrices) return null
  return planPrices[billingPeriod] || null
}

// Get metered price ID for a resource type
export function getMeteredPriceId(resourceType: MeteredResourceType): string | null {
  return METERED_PRICE_IDS[resourceType] || null
}

// Check if metered billing is configured
export function isMeteredBillingConfigured(): boolean {
  return Object.values(METERED_PRICE_IDS).some(id => id !== '')
}

/**
 * Add metered subscription items to an existing subscription
 * This enables usage-based billing for overages
 */
export async function addMeteredItemsToSubscription(subscriptionId: string): Promise<void> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)

  // Get existing price IDs on the subscription
  const existingPriceIds = new Set(
    subscription.items.data.map(item => item.price.id)
  )

  // Add each metered price that's configured and not already on the subscription
  for (const [resourceType, priceId] of Object.entries(METERED_PRICE_IDS)) {
    if (!priceId || existingPriceIds.has(priceId)) continue

    try {
      await stripe.subscriptionItems.create({
        subscription: subscriptionId,
        price: priceId,
        metadata: {
          resource_type: resourceType,
          type: 'overage',
        },
      })
      console.log(`Added metered item for ${resourceType} to subscription ${subscriptionId}`)
    } catch (error) {
      console.error(`Failed to add metered item for ${resourceType}:`, error)
    }
  }
}

/**
 * Get the subscription item ID for a specific metered resource type
 */
export async function getSubscriptionItemId(
  subscriptionId: string,
  resourceType: MeteredResourceType
): Promise<string | null> {
  const priceId = METERED_PRICE_IDS[resourceType]
  if (!priceId) return null

  const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
    expand: ['items.data'],
  })

  const item = subscription.items.data.find(item => item.price.id === priceId)
  return item?.id || null
}

/**
 * Report usage for a metered subscription item
 * This is used to bill for overages at the end of the billing period
 * Note: In Stripe SDK v20+, usage records are reported via the Billing Meters API
 */
export async function reportUsage(
  subscriptionItemId: string,
  quantity: number,
  timestamp?: number,
  action: 'increment' | 'set' = 'set'
) {
  // Use the raw API call since the type definitions may not include this method
  // This is for legacy metered subscriptions - newer implementations should use Billing Meters
  const response = await (stripe.subscriptionItems as any).createUsageRecord(subscriptionItemId, {
    quantity,
    timestamp: timestamp || Math.floor(Date.now() / 1000),
    action,
  })
  return response
}

/**
 * Report overage usage for an organization
 * Calculates overage and reports to Stripe
 */
export async function reportOverageUsage(
  subscriptionId: string,
  resourceType: MeteredResourceType,
  overageAmount: number
) {
  if (overageAmount <= 0) return null

  const subscriptionItemId = await getSubscriptionItemId(subscriptionId, resourceType)
  if (!subscriptionItemId) {
    console.warn(`No subscription item found for ${resourceType} on subscription ${subscriptionId}`)
    return null
  }

  return reportUsage(subscriptionItemId, overageAmount)
}

/**
 * Get usage records for a subscription item
 */
export async function getUsageRecords(
  subscriptionItemId: string,
  options?: { limit?: number }
) {
  // Use type cast since UsageRecordSummary type may not be exported in newer SDK versions
  return (stripe.subscriptionItems as any).listUsageRecordSummaries(subscriptionItemId, {
    limit: options?.limit || 10,
  })
}

/**
 * Get the current billing period for a subscription
 */
export async function getSubscriptionBillingPeriod(subscriptionId: string): Promise<{
  start: Date
  end: Date
} | null> {
  try {
    const subscription = await stripe.subscriptions.retrieve(subscriptionId) as any
    return {
      start: new Date(subscription.current_period_start * 1000),
      end: new Date(subscription.current_period_end * 1000),
    }
  } catch (error) {
    console.error('Failed to get subscription billing period:', error)
    return null
  }
}
