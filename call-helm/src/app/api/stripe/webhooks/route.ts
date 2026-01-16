import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { stripe, mapStripeStatus, addMeteredItemsToSubscription, isMeteredBillingConfigured } from '@/lib/stripe'
import Stripe from 'stripe'
import { Resend } from 'resend'

// Initialize Resend for email notifications
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

// Supabase admin client for server-side operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Disable body parsing - Stripe needs the raw body
export const runtime = 'nodejs'

// Grace period in days before suspension
const PAYMENT_GRACE_PERIOD_DAYS = 7

/**
 * Generate payment failure email HTML
 */
function generatePaymentFailureEmailHtml(params: {
  organizationName: string
  invoiceAmount: number
  invoiceDate: string
  updatePaymentUrl: string
  gracePeriodDays: number
  suspensionDate: string
}): string {
  const { organizationName, invoiceAmount, invoiceDate, updatePaymentUrl, gracePeriodDays, suspensionDate } = params

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2563eb; margin-bottom: 8px;">Call Helm</h1>
        </div>

        <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <h2 style="color: #dc2626; margin: 0 0 8px 0; font-size: 18px;">⚠️ Payment Failed</h2>
          <p style="margin: 0; color: #991b1b;">
            We were unable to process your payment for ${organizationName}.
          </p>
        </div>

        <p>Hi there,</p>

        <p>We attempted to charge your payment method for your Call Helm subscription, but the payment was declined.</p>

        <div style="background-color: #f9fafb; border-radius: 8px; padding: 16px; margin: 24px 0;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Invoice Amount:</td>
              <td style="padding: 8px 0; text-align: right; font-weight: bold;">$${invoiceAmount.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Invoice Date:</td>
              <td style="padding: 8px 0; text-align: right;">${invoiceDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #6b7280;">Grace Period:</td>
              <td style="padding: 8px 0; text-align: right;">${gracePeriodDays} days</td>
            </tr>
          </table>
        </div>

        <p style="color: #dc2626; font-weight: 500;">
          ⏰ Your account will be suspended on ${suspensionDate} if payment is not received.
        </p>

        <p>Please update your payment method to avoid any interruption to your service:</p>

        <p style="margin: 32px 0; text-align: center;">
          <a href="${updatePaymentUrl}" style="background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Update Payment Method
          </a>
        </p>

        <p style="font-size: 14px; color: #666;">
          If you believe this is an error or need assistance, please reply to this email or contact our support team.
        </p>

        <hr style="margin-top: 32px; border: none; border-top: 1px solid #eee;">

        <p style="font-size: 12px; color: #999; text-align: center;">
          This is an automated message from Call Helm regarding your subscription.
        </p>
      </body>
    </html>
  `
}

/**
 * Generate account suspension warning email HTML
 */
function generateSuspensionWarningEmailHtml(params: {
  organizationName: string
  daysRemaining: number
  suspensionDate: string
  updatePaymentUrl: string
}): string {
  const { organizationName, daysRemaining, suspensionDate, updatePaymentUrl } = params

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2563eb; margin-bottom: 8px;">Call Helm</h1>
        </div>

        <div style="background-color: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <h2 style="color: #b45309; margin: 0 0 8px 0; font-size: 18px;">🚨 Account Suspension Warning</h2>
          <p style="margin: 0; color: #92400e;">
            Your ${organizationName} account will be suspended in ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}.
          </p>
        </div>

        <p>Hi there,</p>

        <p>This is a reminder that your payment is still overdue. Your Call Helm account will be suspended on <strong>${suspensionDate}</strong> if we don't receive payment.</p>

        <p>When suspended, you and your team will:</p>
        <ul style="color: #6b7280;">
          <li>Lose access to the dashboard</li>
          <li>Be unable to make or receive calls</li>
          <li>Have SMS messaging disabled</li>
        </ul>

        <p>Your data will be preserved and access will be restored once payment is received.</p>

        <p style="margin: 32px 0; text-align: center;">
          <a href="${updatePaymentUrl}" style="background-color: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Pay Now to Avoid Suspension
          </a>
        </p>

        <hr style="margin-top: 32px; border: none; border-top: 1px solid #eee;">

        <p style="font-size: 12px; color: #999; text-align: center;">
          This is an automated message from Call Helm regarding your subscription.
        </p>
      </body>
    </html>
  `
}

/**
 * Get admin email addresses for an organization
 */
async function getOrganizationAdminEmails(organizationId: string): Promise<string[]> {
  const { data: members } = await supabase
    .from('organization_members')
    .select('email')
    .eq('organization_id', organizationId)
    .in('role', ['owner', 'admin'])
    .eq('status', 'active')

  if (!members || members.length === 0) {
    // Fallback: get the organization owner's email
    const { data: org } = await supabase
      .from('organizations')
      .select('owner_id, profiles!organizations_owner_id_fkey(email)')
      .eq('id', organizationId)
      .single()

    if (org?.profiles && (org.profiles as any)?.email) {
      return [(org.profiles as any).email]
    }
    return []
  }

  return members.map(m => m.email).filter(Boolean)
}

/**
 * Generate account reactivated email HTML
 */
function generateAccountReactivatedEmailHtml(params: {
  organizationName: string
  dashboardUrl: string
}): string {
  const { organizationName, dashboardUrl } = params

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="color: #2563eb; margin-bottom: 8px;">Call Helm</h1>
        </div>

        <div style="background-color: #ecfdf5; border: 1px solid #6ee7b7; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
          <h2 style="color: #059669; margin: 0 0 8px 0; font-size: 18px;">✅ Account Reactivated</h2>
          <p style="margin: 0; color: #047857;">
            Your ${organizationName} account has been restored!
          </p>
        </div>

        <p>Hi there,</p>

        <p>Great news! We've received your payment and your Call Helm account has been fully reactivated.</p>

        <p>All features have been restored:</p>
        <ul style="color: #059669;">
          <li>Dashboard access restored</li>
          <li>Voice calling enabled</li>
          <li>SMS messaging enabled</li>
          <li>All your data is intact</li>
        </ul>

        <p style="margin: 32px 0; text-align: center;">
          <a href="${dashboardUrl}" style="background-color: #059669; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Go to Dashboard
          </a>
        </p>

        <p style="font-size: 14px; color: #666;">
          Thank you for your continued trust in Call Helm!
        </p>

        <hr style="margin-top: 32px; border: none; border-top: 1px solid #eee;">

        <p style="font-size: 12px; color: #999; text-align: center;">
          This is an automated message from Call Helm.
        </p>
      </body>
    </html>
  `
}

/**
 * Send account reactivated email
 */
async function sendAccountReactivatedEmail(organizationId: string): Promise<void> {
  if (!resend) {
    console.warn('RESEND_API_KEY not configured - reactivation email not sent')
    return
  }

  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', organizationId)
    .single()

  if (!org) return

  const adminEmails = await getOrganizationAdminEmails(organizationId)
  if (adminEmails.length === 0) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://callhelm.com'

  try {
    await resend.emails.send({
      from: 'Call Helm <billing@callhelm.com>',
      to: adminEmails,
      subject: `✅ Account Reactivated - ${org.name || 'Your Call Helm account'}`,
      html: generateAccountReactivatedEmailHtml({
        organizationName: org.name || 'your organization',
        dashboardUrl: `${appUrl}/dashboard`
      })
    })

    console.log(`Account reactivated email sent for org ${organizationId}`)
  } catch (error) {
    console.error('Failed to send reactivation email:', error)
  }
}

/**
 * Send payment failure notification email
 */
async function sendPaymentFailureEmail(
  organizationId: string,
  invoice: Stripe.Invoice
): Promise<void> {
  if (!resend) {
    console.warn('RESEND_API_KEY not configured - payment failure email not sent')
    return
  }

  // Get organization details
  const { data: org } = await supabase
    .from('organizations')
    .select('name, stripe_customer_id')
    .eq('id', organizationId)
    .single()

  if (!org) {
    console.error('Organization not found for payment failure email:', organizationId)
    return
  }

  // Get admin emails
  const adminEmails = await getOrganizationAdminEmails(organizationId)
  if (adminEmails.length === 0) {
    console.error('No admin emails found for organization:', organizationId)
    return
  }

  // Calculate suspension date
  const suspensionDate = new Date()
  suspensionDate.setDate(suspensionDate.getDate() + PAYMENT_GRACE_PERIOD_DAYS)

  // Generate billing portal URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://callhelm.com'
  const updatePaymentUrl = `${appUrl}/dashboard/settings?tab=billing`

  const emailHtml = generatePaymentFailureEmailHtml({
    organizationName: org.name || 'your organization',
    invoiceAmount: (invoice.amount_due || 0) / 100,
    invoiceDate: new Date(invoice.created * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }),
    updatePaymentUrl,
    gracePeriodDays: PAYMENT_GRACE_PERIOD_DAYS,
    suspensionDate: suspensionDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  })

  try {
    await resend.emails.send({
      from: 'Call Helm <billing@callhelm.com>',
      to: adminEmails,
      subject: `⚠️ Payment Failed - Action Required for ${org.name || 'your account'}`,
      html: emailHtml
    })

    console.log(`Payment failure email sent to ${adminEmails.length} admin(s) for org ${organizationId}`)
  } catch (error) {
    console.error('Failed to send payment failure email:', error)
  }
}

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

  // Add metered subscription items for overage billing
  if (isMeteredBillingConfigured()) {
    try {
      await addMeteredItemsToSubscription(subscriptionId)
      console.log(`Added metered items to subscription ${subscriptionId}`)
    } catch (meteredError) {
      // Log but don't fail - metered items can be added later
      console.error('Failed to add metered items:', meteredError)
    }
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
  let planSlug: string | null | undefined = subscription.metadata?.plan_slug

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

  // Calculate suspension date (grace period from now)
  const suspensionDate = new Date()
  suspensionDate.setDate(suspensionDate.getDate() + PAYMENT_GRACE_PERIOD_DAYS)

  // Check if this is the first failed payment (don't reset grace period on retries)
  const { data: org } = await supabase
    .from('organizations')
    .select('subscription_status, payment_failed_at')
    .eq('id', organizationId)
    .single()

  const isFirstFailure = org?.subscription_status !== 'past_due'

  // Update organization status to past_due and set suspension date
  const updateData: Record<string, any> = {
    subscription_status: 'past_due',
    updated_at: new Date().toISOString(),
  }

  // Only set payment_failed_at and suspension_at on first failure
  if (isFirstFailure) {
    updateData.payment_failed_at = new Date().toISOString()
    updateData.suspension_scheduled_at = suspensionDate.toISOString()
  }

  const { error } = await supabase
    .from('organizations')
    .update(updateData)
    .eq('id', organizationId)

  if (error) {
    console.error('Failed to update organization payment status:', error)
    throw error
  }

  // Send payment failure notification email
  await sendPaymentFailureEmail(organizationId, invoice)

  console.log(`Organization ${organizationId} payment failed, suspension scheduled for ${suspensionDate.toISOString()}`)
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

  if (org?.subscription_status === 'past_due' || org?.subscription_status === 'suspended') {
    await supabase
      .from('organizations')
      .update({
        subscription_status: 'active',
        payment_failed_at: null,
        suspension_scheduled_at: null,
        suspended_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', organizationId)

    console.log(`Organization ${organizationId} payment succeeded, status restored to active`)

    // Send reactivation email if account was suspended
    if (org?.subscription_status === 'suspended') {
      await sendAccountReactivatedEmail(organizationId)
    }
  }

  // Log usage charges for tracking
  const usageCharges = invoice.lines?.data?.filter(
    line => (line as any).price?.recurring?.usage_type === 'metered'
  ) || []

  if (usageCharges.length > 0) {
    console.log(`Organization ${organizationId} invoice includes ${usageCharges.length} usage-based charges:`)
    for (const charge of usageCharges) {
      console.log(`  - ${charge.description}: $${(charge.amount / 100).toFixed(2)} (${charge.quantity} units)`)
    }

    // Record usage billing event
    await supabase
      .from('usage_events')
      .insert({
        organization_id: organizationId,
        resource_type: 'billing_event',
        amount: 0,
        unit_cost: 0,
        total_cost: usageCharges.reduce((sum, c) => sum + c.amount, 0) / 100,
        description: 'Usage-based overage charges',
        metadata: {
          invoice_id: invoice.id,
          charges: usageCharges.map(c => ({
            description: c.description,
            amount: c.amount / 100,
            quantity: c.quantity,
            price_id: (c as any).price?.id
          }))
        }
      })
  }
}

async function handleInvoiceFinalized(invoice: Stripe.Invoice) {
  const customerId = invoice.customer as string
  const organizationId = await getOrganizationIdFromCustomer(customerId)

  if (!organizationId) return

  // Check for usage-based line items
  const usageLines = invoice.lines?.data?.filter(
    line => (line as any).price?.recurring?.usage_type === 'metered'
  ) || []

  const totalUsageCharges = usageLines.reduce((sum, line) => sum + line.amount, 0)

  if (usageLines.length > 0) {
    console.log(`Invoice ${invoice.id} finalized for org ${organizationId}`)
    console.log(`  Subscription charges: $${((invoice.subtotal - totalUsageCharges) / 100).toFixed(2)}`)
    console.log(`  Usage charges: $${(totalUsageCharges / 100).toFixed(2)}`)
    console.log(`  Total: $${(invoice.total / 100).toFixed(2)}`)

    // Could send email notification about upcoming usage charges here
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

      case 'invoice.finalized':
        await handleInvoiceFinalized(event.data.object as Stripe.Invoice)
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
