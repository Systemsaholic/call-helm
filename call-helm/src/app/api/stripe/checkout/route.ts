import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe } from '@/lib/stripe'
import { z } from 'zod'
import { billingLogger } from '@/lib/logger'

// Supabase admin client for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const checkoutSchema = z.object({
  planSlug: z.string(),
  billingPeriod: z.enum(['monthly', 'annual']),
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const validatedData = checkoutSchema.parse(body)

    const { planSlug, billingPeriod, organizationId, userId, successUrl, cancelUrl } = validatedData

    // Get organization data
    const { data: organization, error: orgError } = await supabase
      .from('organizations')
      .select('id, name, stripe_customer_id')
      .eq('id', organizationId)
      .single()

    if (orgError || !organization) {
      return NextResponse.json(
        { error: 'Organization not found' },
        { status: 404 }
      )
    }

    // Get user data for email
    const { data: userData } = await supabase.auth.admin.getUserById(userId)
    const userEmail = userData?.user?.email

    // Get the Stripe price ID from database (single source of truth)
    const { data: plan, error: planError } = await supabase
      .from('subscription_plans')
      .select('stripe_price_id_monthly, stripe_price_id_yearly')
      .eq('slug', planSlug)
      .eq('is_active', true)
      .single()

    if (planError || !plan) {
      return NextResponse.json(
        { error: 'Invalid plan' },
        { status: 400 }
      )
    }

    const priceId = billingPeriod === 'monthly'
      ? plan.stripe_price_id_monthly
      : plan.stripe_price_id_yearly

    if (!priceId) {
      return NextResponse.json(
        { error: 'Plan does not have Stripe pricing configured' },
        { status: 400 }
      )
    }

    let customerId = organization.stripe_customer_id

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: userEmail,
        name: organization.name,
        metadata: {
          organization_id: organizationId,
          user_id: userId,
        },
      })

      // Save customer ID to organization
      await supabase
        .from('organizations')
        .update({ stripe_customer_id: customer.id })
        .eq('id', organizationId)

      customerId = customer.id
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?tab=billing&success=true`,
      cancel_url: cancelUrl || `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?tab=billing&canceled=true`,
      subscription_data: {
        metadata: {
          organization_id: organizationId,
          plan_slug: planSlug,
        },
        trial_period_days: undefined, // No trial since they're upgrading
      },
      metadata: {
        organization_id: organizationId,
        plan_slug: planSlug,
        billing_period: billingPeriod,
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
      customer_update: {
        address: 'auto',
        name: 'auto',
      },
    })

    return NextResponse.json({
      sessionId: session.id,
      url: session.url,
    })
  } catch (error) {
    billingLogger.error('Stripe checkout error', { error })

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request data', details: error.issues },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}
