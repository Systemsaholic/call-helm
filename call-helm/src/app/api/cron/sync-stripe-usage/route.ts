import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { apiLogger } from '@/lib/logger'
import {
  stripe,
  METERED_PRICE_IDS,
  MeteredResourceType,
  addMeteredItemsToSubscription,
  getSubscriptionItemId,
  reportUsage,
} from '@/lib/stripe'

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

// Verify cron secret for security
function verifyCronSecret(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    return process.env.NODE_ENV === 'development'
  }

  return authHeader === `Bearer ${cronSecret}`
}

interface OrganizationUsage {
  organization_id: string
  organization_name: string
  stripe_subscription_id: string
  subscription_tier: string
  // Limits from plan
  max_agents: number
  max_phone_numbers: number
  max_call_minutes: number
  max_sms_messages: number
  max_ai_tokens_per_month: number
  max_transcription_minutes_per_month: number
  max_ai_analysis_per_month: number
  max_contacts: number
  // Current counts/usage
  current_agents: number
  current_phone_numbers: number
  current_contacts: number
  used_call_minutes: number
  used_sms_messages: number
  used_ai_tokens: number
  used_transcription_minutes: number
  used_ai_analysis: number
}

interface UsageReport {
  organization_id: string
  organization_name: string
  overages: {
    resource_type: MeteredResourceType
    limit: number
    used: number
    overage: number
    reported: boolean
    error?: string
  }[]
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  apiLogger.info('Stripe usage sync job started', { data: { timestamp: new Date().toISOString() } })

  const results = {
    processed: 0,
    reported: 0,
    failed: 0,
    skipped: 0,
    reports: [] as UsageReport[],
    errors: [] as string[]
  }

  try {
    // Get all organizations with active Stripe subscriptions
    const { data: organizations, error: orgError } = await supabaseAdmin
      .from('organization_limits')
      .select('*')
      .not('stripe_subscription_id', 'is', null)
      .in('subscription_status', ['active', 'trialing', 'past_due'])

    if (orgError) {
      apiLogger.error('Error fetching organizations', { error: orgError })
      return NextResponse.json({
        error: 'Failed to fetch organizations',
        details: orgError.message
      }, { status: 500 })
    }

    results.processed = organizations?.length || 0
    apiLogger.info('Organizations with active subscriptions', { data: { count: results.processed } })

    for (const org of (organizations as OrganizationUsage[]) || []) {
      const report: UsageReport = {
        organization_id: org.organization_id,
        organization_name: org.organization_name,
        overages: []
      }

      try {
        // Ensure metered items are on the subscription
        await addMeteredItemsToSubscription(org.stripe_subscription_id)

        // Calculate and report overages for each resource type
        const overageCalculations: {
          type: MeteredResourceType
          limit: number
          used: number
        }[] = [
          {
            type: 'agents',
            limit: org.max_agents || 0,
            used: org.current_agents || 0
          },
          {
            type: 'phone_numbers',
            limit: org.max_phone_numbers || 0,
            used: org.current_phone_numbers || 0
          },
          {
            type: 'call_minutes',
            limit: org.max_call_minutes || 0,
            used: org.used_call_minutes || 0
          },
          {
            type: 'sms_messages',
            limit: org.max_sms_messages || 0,
            used: org.used_sms_messages || 0
          },
          {
            type: 'ai_tokens',
            limit: org.max_ai_tokens_per_month || 0,
            used: Math.ceil((org.used_ai_tokens || 0) / 1000) // Convert to thousands
          },
          {
            type: 'transcription_minutes',
            limit: org.max_transcription_minutes_per_month || 0,
            used: org.used_transcription_minutes || 0
          },
          {
            type: 'ai_analysis',
            limit: org.max_ai_analysis_per_month || 0,
            used: org.used_ai_analysis || 0
          },
          {
            type: 'contacts',
            limit: org.max_contacts || 0,
            used: Math.ceil((org.current_contacts || 0) / 100) // Convert to hundreds
          }
        ]

        for (const calc of overageCalculations) {
          // Skip if no metered price configured for this type
          if (!METERED_PRICE_IDS[calc.type]) {
            continue
          }

          // Calculate overage (only positive values)
          // For "unlimited" plans (999999+), skip overage reporting
          const isUnlimited = calc.limit >= 999999
          const overage = isUnlimited ? 0 : Math.max(0, calc.used - calc.limit)

          const overageReport = {
            resource_type: calc.type,
            limit: calc.limit,
            used: calc.used,
            overage,
            reported: false,
            error: undefined as string | undefined
          }

          if (overage > 0) {
            try {
              const subscriptionItemId = await getSubscriptionItemId(
                org.stripe_subscription_id,
                calc.type
              )

              if (subscriptionItemId) {
                await reportUsage(subscriptionItemId, overage)
                overageReport.reported = true
                results.reported++
                apiLogger.info('Reported overage to Stripe', {
                  data: { overage, type: calc.type, orgId: org.organization_id }
                })
              } else {
                overageReport.error = 'No subscription item found'
                results.skipped++
              }
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : 'Unknown error'
              overageReport.error = errorMsg
              results.failed++
              results.errors.push(
                `${org.organization_id} - ${calc.type}: ${errorMsg}`
              )
            }
          }

          report.overages.push(overageReport)
        }

        results.reports.push(report)

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        apiLogger.error('Failed to process org', { error, data: { orgId: org.organization_id } })
        results.errors.push(`Org ${org.organization_id}: ${errorMsg}`)
      }
    }

    apiLogger.info('Stripe usage sync job complete', {
      data: {
        processed: results.processed,
        reported: results.reported,
        failed: results.failed,
        skipped: results.skipped
      }
    })

    return NextResponse.json({
      success: true,
      results: {
        processed: results.processed,
        reported: results.reported,
        failed: results.failed,
        skipped: results.skipped,
        errors: results.errors
      },
      // Include detailed reports for debugging (could be removed in production)
      reports: results.reports,
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    apiLogger.error('Usage sync job error', { error })
    return NextResponse.json({
      error: 'Job failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      results
    }, { status: 500 })
  }
}

// GET for health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'sync-stripe-usage',
    description: 'Syncs usage overages to Stripe for billing',
    metered_resources: Object.keys(METERED_PRICE_IDS).filter(
      k => METERED_PRICE_IDS[k as MeteredResourceType]
    )
  })
}
