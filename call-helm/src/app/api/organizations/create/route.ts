import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

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

export async function POST(request: NextRequest) {
  console.log('Create Organization API called')

  try {
    // Get the current user's session
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
              console.error("Failed to set cookies in create organization route")
            }
          }
        }
      }
    )

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('Auth error in create organization API:', authError)
      return NextResponse.json({ error: 'User not authenticated' }, { status: 401 })
    }

    // Get the request body
    const { organizationName, fullName } = await request.json()

    if (!organizationName || typeof organizationName !== 'string') {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 })
    }

    // Check if user already belongs to an organization
    const { data: existingMembership, error: membershipError } = await supabaseAdmin
      .from('organization_members')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingMembership) {
      console.log('User already has organization membership:', existingMembership)
      return NextResponse.json({
        error: 'User already belongs to an organization',
        organizationId: existingMembership.organization_id
      }, { status: 409 })
    }

    // Calculate trial end date (14 days from now)
    const trialEndsAt = new Date()
    trialEndsAt.setDate(trialEndsAt.getDate() + 14)

    // Generate a slug from organization name
    const slug = organizationName.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      + '-' + Date.now().toString(36)

    // Get the starter plan ID for trial organizations
    const { data: starterPlan } = await supabaseAdmin
      .from('subscription_plans')
      .select('id')
      .eq('slug', 'starter')
      .single()

    // Create the organization
    // Note: trial_ends_at is set by database trigger if subscription_status is 'trialing'
    const { data: organization, error: orgError } = await supabaseAdmin
      .from('organizations')
      .insert({
        name: organizationName.trim(),
        slug: slug,
        subscription_tier: 'starter',
        subscription_plan_id: starterPlan?.id || null,
        subscription_status: 'trialing',
        trial_ends_at: trialEndsAt.toISOString(),
      })
      .select()
      .single()

    if (orgError) {
      console.error('Failed to create organization:', orgError)
      return NextResponse.json({ error: 'Failed to create organization' }, { status: 500 })
    }

    console.log('Organization created:', organization.id)

    // Create profile in 'profiles' table (required for organization_members foreign key)
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email,
        full_name: fullName || user.user_metadata?.full_name || null,
        onboarded: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'id'
      })

    if (profileError) {
      console.error('Failed to create profile:', profileError)
      // Rollback: delete the organization
      await supabaseAdmin.from('organizations').delete().eq('id', organization.id)
      return NextResponse.json({ error: 'Failed to create user profile' }, { status: 500 })
    }

    // Also create/update user_profiles table entry
    const { error: userProfileError } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        id: user.id,
        email: user.email,
        full_name: fullName || user.user_metadata?.full_name || null,
        organization_id: organization.id,
        timezone: 'America/New_York',
      }, {
        onConflict: 'id'
      })

    if (userProfileError) {
      console.error('Failed to create/update user profile:', userProfileError)
      // Don't fail the whole operation, continue
    }

    // Create the organization member record (user as org_admin)
    const { data: member, error: memberError } = await supabaseAdmin
      .from('organization_members')
      .insert({
        organization_id: organization.id,
        user_id: user.id,
        role: 'org_admin',
        status: 'active',
        full_name: fullName || user.user_metadata?.full_name || user.email?.split('@')[0],
        email: user.email,
        is_active: true,
      })
      .select()
      .single()

    if (memberError) {
      console.error('Failed to create organization member:', memberError)
      // Rollback: delete the organization
      await supabaseAdmin.from('organizations').delete().eq('id', organization.id)
      return NextResponse.json({ error: 'Failed to create organization membership' }, { status: 500 })
    }

    console.log('Organization member created:', member.id)

    // Update user metadata with organization info
    const { error: updateUserError } = await supabaseAdmin.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: {
          ...user.user_metadata,
          organization_id: organization.id,
          organization_member_id: member.id,
          role: 'org_admin',
          full_name: fullName || user.user_metadata?.full_name,
          onboarding_completed: true,
        }
      }
    )

    if (updateUserError) {
      console.error('Failed to update user metadata:', updateUserError)
      // Don't fail the operation, the organization was created successfully
    }

    console.log('Organization setup complete for user:', user.id)

    return NextResponse.json({
      success: true,
      organization: {
        id: organization.id,
        name: organization.name,
      },
      member: {
        id: member.id,
        role: member.role,
      }
    })

  } catch (error) {
    console.error('Create organization API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
