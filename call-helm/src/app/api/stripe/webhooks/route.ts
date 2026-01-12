import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, mapStripeStatus } from '@/lib/stripe'
import Stripe from 'stripe'

// Supabase admin client for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Disable body parsing - Stripe needs the raw body
export const runtime = 'nodejs'

async function getOrganizationIdFromCustomer(customerId: string): Promise<string | null> {
  // First try to get from Stripe customer metadata
  const customer = await stripe.customers.retrieve(customerId)
  if (customer.deleted) return null

  const orgId = (customer as Stripe.Customer).metadata?.organization_id
  if (orgId) return orgId

  // Fallback: look up in database
  const { data } = await supabase
    .from('organizations')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single()

  return data?.id || null
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  const organizationId = session.metadata?.organization_id
  const planSlug = session.metadata?.plan_slug

  if (!organizationId || !planSlug) {
    console.error('Missing metadata in checkout session:', session.id)
    return
  }

  const subscriptionId = session.subscription as string
  const customerId = session.customer as string

  // Get subscription details
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)

  // Get the plan ID from our database
  const { data: plan } = await supabase
    .from('subscription_plans')
    .select('id')
    .eq('slug', planSlug)
    .single()

  // Update organization with subscription info
  const { error } = await supabase
    .from('organizations')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      subscription_status: mapStripeStatus(subscription.status),
      subscription_plan_id: plan?.id || null,
      subscription_tier: planSlug,
      trial_ends_at: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId)

  if (error) {
    console.error('Failed to update organization after checkout:', error)
    throw error
  }

  console.log(`Organization ${organizationId} upgraded to ${planSlug}`)
}

// Map Stripe price IDs to plan slugs
function getPlanSlugFromPriceId(priceId: string): string | null {
  const priceToSlugMap: Record<string, string> = {
    // Starter plan
    [process.env.STRIPE_STARTER_MONTHLY_PRICE_ID || '']: 'starter',
    [process.env.STRIPE_STARTER_ANNUAL_PRICE_ID || '']: 'starter',
    // Professional plan
    [process.env.STRIPE_PROFESSIONAL_MONTHLY_PRICE_ID || '']: 'professional',
    [process.env.STRIPE_PROFESSIONAL_ANNUAL_PRICE_ID || '']: 'professional',
    // Enterprise plan
    [process.env.STRIPE_ENTERPRISE_MONTHLY_PRICE_ID || '']: 'enterprise',
    [process.env.STRIPE_ENTERPRISE_ANNUAL_PRICE_ID || '']: 'enterprise',
  }
  return priceToSlugMap[priceId] || null
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata?.organization_id
    || await getOrganizationIdFromCustomer(subscription.customer as string)

  if (!organizationId) {
    console.error('Could not find organization for subscription:', subscription.id)
    return
  }

  // Get plan slug from metadata or price lookup
  let planSlug = subscription.metadata?.plan_slug

  if (!planSlug) {
    // Try to determine plan from price ID
    const priceId = subscription.items.data[0]?.price.id
    if (priceId) {
      planSlug = getPlanSlugFromPriceId(priceId)
    }
  }

  // Build update object - only include plan fields if we have a valid plan
  const updateData: Record<string, any> = {
    stripe_subscription_id: subscription.id,
    subscription_status: mapStripeStatus(subscription.status),
    trial_ends_at: subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    updated_at: new Date().toISOString(),
  }

  // Only update plan-related fields if we have a valid plan slug
  if (planSlug) {
    const { data: plan } = await supabase
      .from('subscription_plans')
      .select('id')
      .eq('slug', planSlug)
      .single()

    if (plan?.id) {
      updateData.subscription_plan_id = plan.id
      updateData.subscription_tier = planSlug
    }
  }

  // Update organization subscription status
  const { error } = await supabase
    .from('organizations')
    .update(updateData)
    .eq('id', organizationId)

  if (error) {
    console.error('Failed to update organization subscription:', error)
    throw error
  }

  console.log(`Organization ${organizationId} subscription updated to ${subscription.status}`)
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const organizationId = subscription.metadata?.organization_id
    || await getOrganizationIdFromCustomer(subscription.customer as string)

  if (!organizationId) {
    console.error('Could not find organization for deleted subscription:', subscription.id)
    return
  }

  // Get the free plan ID
  const { data: freePlan } = await supabase
    .from('subscription_plans')
    .select('id')
    .eq('slug', 'free')
    .single()

  // Downgrade to free plan
  const { error } = await supabase
    .from('organizations')
    .update({
      stripe_subscription_id: null,
      subscription_status: 'canceled',
      subscription_plan_id: freePlan?.id || null,
      subscription_tier: 'free',
      trial_ends_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId)

  if (error) {
    console.error('Failed to downgrade organization:', error)
    throw error
  }

  console.log(`Organization ${organizationId} subscription canceled, downgraded to free`)
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string
  const organizationId = await getOrganizationIdFromCustomer(customerId)

  if (!organizationId) {
    console.error('Could not find organization for failed payment:', invoice.id)
    return
  }

  // Update organization status to past_due
  const { error } = await supabase
    .from('organizations')
    .update({
      subscription_status: 'past_due',
      updated_at: new Date().toISOString(),
    })
    .eq('id', organizationId)

  if (error) {
    console.error('Failed to update organization payment status:', error)
    throw error
  }

  // TODO: Send email notification about failed payment
  console.log(`Organization ${organizationId} payment failed`)
}

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string
  const organizationId = await getOrganizationIdFromCustomer(customerId)

  if (!organizationId) {
    // This is normal for first-time customers during checkout
    return
  }

  // If status was past_due, update to active
  const { data: org } = await supabase
    .from('organizations')
    .select('subscription_status')
    .eq('id', organizationId)
    .single()

  if (org?.subscription_status === 'past_due') {
    await supabase
      .from('organizations')
      .update({
        subscription_status: 'active',
        updated_at: new Date().toISOString(),
      })
      .eq('id', organizationId)

    console.log(`Organization ${organizationId} payment succeeded, status restored to active`)
  }
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Webhook signature verification failed:', message)
    return NextResponse.json(
      { error: `Webhook signature verification failed: ${message}` },
      { status: 400 }
    )
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session)
        break

      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_succeeded':
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
        break

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}
