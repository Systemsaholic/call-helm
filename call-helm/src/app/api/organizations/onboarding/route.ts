import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { apiLogger } from '@/lib/logger'

// Helper for required environment variables
function getRequiredEnv(key: string): string {
  const v = process.env[key]
  if (!v) throw new Error(`Missing required environment variable: ${key}`)
  return v
}

// Create admin client with service role key for admin operations
const supabaseAdmin = createClient(
  getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

// GET - Fetch onboarding progress with auto-detection
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
            } catch {
              // Ignore cookie errors in route handlers
            }
          }
        }
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const organizationId = user.user_metadata?.organization_id
    if (!organizationId) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 })
    }

    // Fetch organization's onboarding progress
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('onboarding_progress')
      .eq('id', organizationId)
      .single()

    if (orgError) {
      apiLogger.error('Error fetching organization', { error: orgError })
      return NextResponse.json({ error: 'Failed to fetch organization' }, { status: 500 })
    }

    // Get existing progress from database (preserve completed steps)
    const existingProgress = org.onboarding_progress || {}

    // Initialize progress with defaults, preserving any existing completions
    const progress = {
      invite_team: existingProgress.invite_team || false,
      add_contacts: existingProgress.add_contacts || false,
      create_campaign: existingProgress.create_campaign || false,
      make_first_call: existingProgress.make_first_call || false,
      dismissed: existingProgress.dismissed || false,
      dismissed_at: existingProgress.dismissed_at || null
    }

    // Auto-detect completed steps (only ADD completions, never remove them)
    // Once a step is marked complete, it stays complete even if the user deletes data

    // Check for agents (invite_team) - only check if not already complete
    if (!progress.invite_team) {
      const { count: agentCount } = await supabaseAdmin
        .from('organization_members')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)

      if (agentCount && agentCount > 1) {
        progress.invite_team = true
      }
    }

    // Check for contacts (add_contacts) - only check if not already complete
    if (!progress.add_contacts) {
      const { count: contactCount } = await supabaseAdmin
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)

      if (contactCount && contactCount > 0) {
        progress.add_contacts = true
      }
    }

    // Check for campaigns (create_campaign) - only check if not already complete
    if (!progress.create_campaign) {
      const { count: campaignCount } = await supabaseAdmin
        .from('call_lists')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)

      if (campaignCount && campaignCount > 0) {
        progress.create_campaign = true
      }
    }

    // Check for calls (make_first_call) - only check if not already complete
    if (!progress.make_first_call) {
      const { count: callCount } = await supabaseAdmin
        .from('call_attempts')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)

      if (callCount && callCount > 0) {
        progress.make_first_call = true
      }
    }

    // Update progress if any auto-detected changes
    if (JSON.stringify(progress) !== JSON.stringify(org.onboarding_progress)) {
      await supabaseAdmin
        .from('organizations')
        .update({ onboarding_progress: progress })
        .eq('id', organizationId)
    }

    return NextResponse.json({ progress })
  } catch (error) {
    apiLogger.error('Onboarding progress GET error', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Update onboarding progress
export async function PATCH(request: NextRequest) {
  try {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getRequiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
            } catch {
              // Ignore cookie errors in route handlers
            }
          }
        }
      }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const organizationId = user.user_metadata?.organization_id
    if (!organizationId) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 })
    }

    const updates = await request.json()

    // Fetch current progress
    const { data: org, error: orgError } = await supabaseAdmin
      .from('organizations')
      .select('onboarding_progress')
      .eq('id', organizationId)
      .single()

    if (orgError) {
      apiLogger.error('Error fetching organization', { error: orgError })
      return NextResponse.json({ error: 'Failed to fetch organization' }, { status: 500 })
    }

    // Merge updates with current progress
    const currentProgress = org.onboarding_progress || {}
    const newProgress = { ...currentProgress, ...updates }

    // Update organization
    const { error: updateError } = await supabaseAdmin
      .from('organizations')
      .update({ onboarding_progress: newProgress })
      .eq('id', organizationId)

    if (updateError) {
      apiLogger.error('Error updating onboarding progress', { error: updateError })
      return NextResponse.json({ error: 'Failed to update progress' }, { status: 500 })
    }

    return NextResponse.json({ progress: newProgress })
  } catch (error) {
    apiLogger.error('Onboarding progress PATCH error', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
