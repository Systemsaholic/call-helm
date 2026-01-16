import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { signalwireService } from '@/lib/services/signalwire'

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

  // If no CRON_SECRET is set, only allow in development
  if (!cronSecret) {
    return process.env.NODE_ENV === 'development'
  }

  return authHeader === `Bearer ${cronSecret}`
}

export async function POST(request: NextRequest) {
  // Verify authorization
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('=== GRACE PERIOD NUMBER RELEASE JOB ===')
  console.log('Started at:', new Date().toISOString())

  const results = {
    checked: 0,
    released: 0,
    failed: 0,
    errors: [] as string[]
  }

  try {
    // 1. First transition any trial numbers that need to go to grace period
    const { data: transitionResult, error: transitionError } = await supabaseAdmin
      .rpc('transition_trial_numbers_to_grace_period')

    if (transitionError) {
      console.error('Error transitioning numbers to grace period:', transitionError)
    } else {
      console.log('Transitioned to grace period:', transitionResult, 'numbers')
    }

    // 2. Check and send grace period notifications
    const { data: notificationResult, error: notificationError } = await supabaseAdmin
      .rpc('check_grace_period_notifications')

    if (notificationError) {
      console.error('Error checking notifications:', notificationError)
    } else {
      console.log('Notifications queued:', notificationResult)
    }

    // 3. Get numbers with expired grace period that need to be released
    const { data: expiredNumbers, error: expiredError } = await supabaseAdmin
      .rpc('release_expired_grace_period_numbers')

    if (expiredError) {
      console.error('Error getting expired numbers:', expiredError)
      return NextResponse.json({
        error: 'Failed to get expired numbers',
        details: expiredError.message
      }, { status: 500 })
    }

    results.checked = expiredNumbers?.length || 0
    console.log('Numbers to release:', results.checked)

    // 4. Release each number via SignalWire
    for (const number of expiredNumbers || []) {
      try {
        console.log(`Releasing number: ${number.phone_number} (SID: ${number.signalwire_sid})`)

        if (number.signalwire_sid) {
          await signalwireService.releaseNumber(number.signalwire_sid)
          console.log(`Successfully released ${number.phone_number} from SignalWire`)
        } else {
          console.log(`No SignalWire SID for ${number.phone_number}, skipping API call`)
        }

        // Update the phone number record to mark as fully released
        await supabaseAdmin
          .from('phone_numbers')
          .update({
            release_reason: 'grace_period_expired_released_to_provider',
            updated_at: new Date().toISOString()
          })
          .eq('id', number.phone_number_id)

        results.released++

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error(`Failed to release ${number.phone_number}:`, errorMsg)
        results.failed++
        results.errors.push(`${number.phone_number}: ${errorMsg}`)

        // Mark as failed release
        await supabaseAdmin
          .from('phone_numbers')
          .update({
            release_reason: `release_failed: ${errorMsg}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', number.phone_number_id)
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
    console.error('Grace period release job error:', error)
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
    endpoint: 'grace-period-number-release',
    description: 'Releases phone numbers after grace period expires'
  })
}
