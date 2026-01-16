import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'
import { apiLogger } from '@/lib/logger'

// Supabase admin client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Initialize Resend
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

/**
 * Generate account suspended email HTML
 */
function generateAccountSuspendedEmailHtml(params: {
  organizationName: string
  updatePaymentUrl: string
}): string {
  const { organizationName, updatePaymentUrl } = params

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
          <h2 style="color: #dc2626; margin: 0 0 8px 0; font-size: 18px;">🔒 Account Suspended</h2>
          <p style="margin: 0; color: #991b1b;">
            Your ${organizationName} account has been suspended due to non-payment.
          </p>
        </div>

        <p>Hi there,</p>

        <p>Unfortunately, we were unable to collect payment for your Call Helm subscription and the grace period has expired.</p>

        <p>Your account has been suspended, which means:</p>
        <ul style="color: #dc2626;">
          <li>Dashboard access is restricted</li>
          <li>Voice calling is disabled</li>
          <li>SMS messaging is disabled</li>
          <li>Your data is preserved and will be available once payment is received</li>
        </ul>

        <p>To restore your account immediately, please update your payment method:</p>

        <p style="margin: 32px 0; text-align: center;">
          <a href="${updatePaymentUrl}" style="background-color: #dc2626; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Update Payment & Restore Account
          </a>
        </p>

        <p style="font-size: 14px; color: #666;">
          If you have questions or believe this is an error, please reply to this email or contact our support team.
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
 * Get admin emails for an organization
 */
async function getOrganizationAdminEmails(organizationId: string): Promise<string[]> {
  const { data: members } = await supabase
    .from('organization_members')
    .select('email')
    .eq('organization_id', organizationId)
    .in('role', ['owner', 'admin'])
    .eq('status', 'active')

  if (!members || members.length === 0) {
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
 * Send account suspended notification
 */
async function sendSuspensionEmail(organizationId: string, organizationName: string): Promise<void> {
  if (!resend) {
    apiLogger.warn('RESEND_API_KEY not configured - suspension email not sent')
    return
  }

  const adminEmails = await getOrganizationAdminEmails(organizationId)
  if (adminEmails.length === 0) {
    apiLogger.error('No admin emails found for suspended org', { data: { organizationId } })
    return
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://callhelm.com'

  try {
    await resend.emails.send({
      from: 'Call Helm <billing@callhelm.com>',
      to: adminEmails,
      subject: `🔒 Account Suspended - ${organizationName || 'Your Call Helm account'}`,
      html: generateAccountSuspendedEmailHtml({
        organizationName: organizationName || 'your organization',
        updatePaymentUrl: `${appUrl}/dashboard/settings?tab=billing`
      })
    })

    apiLogger.info('Suspension email sent', { data: { organizationId } })
  } catch (error) {
    apiLogger.error('Failed to send suspension email', { error })
  }
}

export async function GET(request: NextRequest) {
  // Verify cron secret for security
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  let suspended = 0
  let errors = 0

  try {
    // Find organizations past their grace period
    const { data: overdueOrgs, error: fetchError } = await supabase
      .from('organizations')
      .select('id, name, subscription_status, suspension_scheduled_at')
      .eq('subscription_status', 'past_due')
      .not('suspension_scheduled_at', 'is', null)
      .lte('suspension_scheduled_at', now.toISOString())

    if (fetchError) {
      apiLogger.error('Error fetching overdue organizations', { error: fetchError })
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch overdue organizations'
      }, { status: 500 })
    }

    if (!overdueOrgs || overdueOrgs.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No organizations to suspend',
        suspended: 0
      })
    }

    apiLogger.info('Found organizations to suspend', { data: { count: overdueOrgs.length } })

    // Suspend each organization
    for (const org of overdueOrgs) {
      try {
        // Update organization status to suspended
        const { error: updateError } = await supabase
          .from('organizations')
          .update({
            subscription_status: 'suspended',
            suspended_at: now.toISOString(),
            updated_at: now.toISOString()
          })
          .eq('id', org.id)

        if (updateError) {
          apiLogger.error('Failed to suspend org', { error: updateError, data: { orgId: org.id } })
          errors++
          continue
        }

        // Send suspension notification email
        await sendSuspensionEmail(org.id, org.name)

        suspended++
        apiLogger.info('Suspended organization', { data: { orgId: org.id, orgName: org.name } })
      } catch (orgError) {
        apiLogger.error('Error processing org', { error: orgError, data: { orgId: org.id } })
        errors++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Suspended ${suspended} organization(s)`,
      suspended,
      errors,
      total: overdueOrgs.length
    })
  } catch (error) {
    apiLogger.error('Suspend overdue accounts cron job error', { error })
    return NextResponse.json({
      success: false,
      error: 'Cron job failed'
    }, { status: 500 })
  }
}

// Also support POST for manual triggering
export async function POST(request: NextRequest) {
  return GET(request)
}
