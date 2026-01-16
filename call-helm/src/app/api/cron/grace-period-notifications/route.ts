import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Resend } from 'resend'

// Use service role for cron job
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

const resend = new Resend(process.env.RESEND_API_KEY)

// Verify cron secret for security
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    return process.env.NODE_ENV === 'development'
  }

  return authHeader === `Bearer ${cronSecret}`
}

interface NotificationEmail {
  to: string
  subject: string
  html: string
}

function generateEmailContent(
  notificationType: string,
  phoneNumber: string,
  orgName: string,
  daysRemaining?: number,
  gracePeriodEnds?: string
): NotificationEmail {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://callhelm.com'
  const upgradeUrl = `${appUrl}/dashboard/billing`

  const templates: Record<string, { subject: string; body: string }> = {
    trial_ended: {
      subject: `Your Call Helm trial has ended - ${phoneNumber} reserved for 30 days`,
      body: `
        <h2>Your trial has ended</h2>
        <p>Hi there,</p>
        <p>Your 14-day Call Helm trial has ended. Your phone number <strong>${phoneNumber}</strong> has been reserved for you for the next 30 days.</p>
        <p><strong>What this means:</strong></p>
        <ul>
          <li>You can still receive incoming messages and calls to this number</li>
          <li>Outbound messaging and calling is disabled</li>
          <li>After 30 days, this number will be released and no longer available</li>
        </ul>
        <p><strong>Don't lose your number!</strong> Upgrade now to keep ${phoneNumber} and restore full functionality.</p>
        <p style="margin: 24px 0;">
          <a href="${upgradeUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Upgrade Now
          </a>
        </p>
        <p>Questions? Reply to this email and we'll help you out.</p>
        <p>— The Call Helm Team</p>
      `
    },
    grace_14_days: {
      subject: `14 days left to keep ${phoneNumber}`,
      body: `
        <h2>14 days remaining</h2>
        <p>Hi there,</p>
        <p>Your reserved phone number <strong>${phoneNumber}</strong> will be released in 14 days (${gracePeriodEnds ? new Date(gracePeriodEnds).toLocaleDateString() : 'soon'}).</p>
        <p>Once released, this number will no longer be available and you won't be able to receive messages from your contacts.</p>
        <p style="margin: 24px 0;">
          <a href="${upgradeUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Keep My Number - Upgrade Now
          </a>
        </p>
        <p>— The Call Helm Team</p>
      `
    },
    grace_7_days: {
      subject: `⚠️ 7 days left - ${phoneNumber} will be released soon`,
      body: `
        <h2>Only 7 days remaining</h2>
        <p>Hi there,</p>
        <p>This is a reminder that your phone number <strong>${phoneNumber}</strong> will be released in just 7 days.</p>
        <p><strong>After release:</strong></p>
        <ul>
          <li>You will no longer receive messages or calls to this number</li>
          <li>Your contacts will not be able to reach you</li>
          <li>The number may be assigned to someone else</li>
        </ul>
        <p style="margin: 24px 0;">
          <a href="${upgradeUrl}" style="background-color: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Upgrade Now to Keep ${phoneNumber}
          </a>
        </p>
        <p>— The Call Helm Team</p>
      `
    },
    grace_3_days: {
      subject: `🚨 3 days left - Don't lose ${phoneNumber}!`,
      body: `
        <h2>Final warning: 3 days remaining</h2>
        <p>Hi there,</p>
        <p>Your phone number <strong>${phoneNumber}</strong> will be <strong>permanently released in 3 days</strong>.</p>
        <p>This is your final opportunity to keep this number. Once released, it cannot be recovered.</p>
        <p style="margin: 24px 0;">
          <a href="${upgradeUrl}" style="background-color: #dc2626; color: white; padding: 16px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 18px;">
            Save My Number Now
          </a>
        </p>
        <p>— The Call Helm Team</p>
      `
    },
    grace_1_day: {
      subject: `🔴 LAST DAY: ${phoneNumber} will be released tomorrow`,
      body: `
        <h2>Last chance!</h2>
        <p>Hi there,</p>
        <p>This is your <strong>final notice</strong>. Your phone number <strong>${phoneNumber}</strong> will be released <strong>tomorrow</strong>.</p>
        <p>After release, you will permanently lose access to this number and all incoming messages.</p>
        <p style="margin: 24px 0;">
          <a href="${upgradeUrl}" style="background-color: #dc2626; color: white; padding: 16px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 18px;">
            Upgrade Now - Last Chance
          </a>
        </p>
        <p>— The Call Helm Team</p>
      `
    },
    number_released: {
      subject: `Your phone number ${phoneNumber} has been released`,
      body: `
        <h2>Phone number released</h2>
        <p>Hi there,</p>
        <p>Your phone number <strong>${phoneNumber}</strong> has been released from your account.</p>
        <p>This number is no longer associated with your Call Helm account. If you'd like to get a new phone number, you can upgrade to a paid plan anytime.</p>
        <p style="margin: 24px 0;">
          <a href="${upgradeUrl}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Get a New Number
          </a>
        </p>
        <p>We hope to see you back soon!</p>
        <p>— The Call Helm Team</p>
      `
    }
  }

  const template = templates[notificationType] || templates.trial_ended

  return {
    to: '', // Will be filled in by caller
    subject: template.subject,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          ${template.body}
          <hr style="margin-top: 32px; border: none; border-top: 1px solid #eee;">
          <p style="font-size: 12px; color: #666;">
            You're receiving this email because you have an account with Call Helm.
            <br>
            ${orgName}
          </p>
        </body>
      </html>
    `
  }
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('=== GRACE PERIOD NOTIFICATION JOB ===')
  console.log('Started at:', new Date().toISOString())

  const results = {
    processed: 0,
    sent: 0,
    failed: 0,
    errors: [] as string[]
  }

  try {
    // Get unsent notifications (where email_sent_to is null)
    const { data: notifications, error: fetchError } = await supabaseAdmin
      .from('grace_period_notifications')
      .select(`
        id,
        phone_number_id,
        organization_id,
        notification_type,
        metadata,
        organizations!inner(name),
        phone_numbers!inner(number)
      `)
      .is('email_sent_to', null)
      .order('sent_at', { ascending: true })
      .limit(50) // Process in batches

    if (fetchError) {
      console.error('Error fetching notifications:', fetchError)
      return NextResponse.json({
        error: 'Failed to fetch notifications',
        details: fetchError.message
      }, { status: 500 })
    }

    results.processed = notifications?.length || 0
    console.log('Notifications to process:', results.processed)

    for (const notification of notifications || []) {
      try {
        // Get org admin email(s)
        const { data: admins } = await supabaseAdmin
          .from('organization_members')
          .select('email')
          .eq('organization_id', notification.organization_id)
          .eq('role', 'org_admin')
          .eq('status', 'active')

        if (!admins || admins.length === 0) {
          console.log(`No admin emails found for org ${notification.organization_id}`)
          continue
        }

        const phoneNumber = (notification as any).phone_numbers?.number || notification.metadata?.phone_number
        const orgName = (notification as any).organizations?.name || notification.metadata?.org_name || 'Your Organization'

        const emailContent = generateEmailContent(
          notification.notification_type,
          phoneNumber,
          orgName,
          notification.metadata?.days_remaining,
          notification.metadata?.grace_period_ends
        )

        // Send to all org admins
        for (const admin of admins) {
          if (!admin.email) continue

          console.log(`Sending ${notification.notification_type} email to ${admin.email}`)

          if (process.env.RESEND_API_KEY) {
            await resend.emails.send({
              from: 'Call Helm <notifications@callhelm.com>',
              to: admin.email,
              subject: emailContent.subject,
              html: emailContent.html
            })
          } else {
            console.log('RESEND_API_KEY not set, skipping email send')
          }

          // Update notification record
          await supabaseAdmin
            .from('grace_period_notifications')
            .update({
              email_sent_to: admin.email,
              metadata: {
                ...notification.metadata,
                email_sent_at: new Date().toISOString()
              }
            })
            .eq('id', notification.id)

          results.sent++
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error(`Failed to send notification ${notification.id}:`, errorMsg)
        results.failed++
        results.errors.push(`Notification ${notification.id}: ${errorMsg}`)
      }
    }

    console.log('=== JOB COMPLETE ===')
    console.log('Results:', results)

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    console.error('Notification job error:', error)
    return NextResponse.json({
      error: 'Job failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      results
    }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'grace-period-notifications',
    description: 'Sends email notifications for grace period milestones'
  })
}
