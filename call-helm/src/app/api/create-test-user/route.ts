import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST() {
  try {
    // Create admin client with service role key
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

    // Create test user
    const email = `test-user-${Date.now()}@mailsac.com`
    const password = 'TestPassword123!'
    
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: 'Test User',
        onboarding_completed: true
      }
    })

    if (authError) {
      console.error('Auth error:', authError)
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    if (!authData.user) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 400 })
    }

    // Add user to Default Organization
    const { data: orgMember, error: orgError } = await supabaseAdmin
      .from('organization_members')
      .insert({
        organization_id: 'fde1031d-2433-443e-a1c5-9bdd5c9d625c', // Default Organization ID
        user_id: authData.user.id,
        email: email,
        full_name: 'Test User',
        role: 'agent',
        status: 'active',
        is_active: true
      })
      .select()
      .single()

    if (orgError) {
      console.error('Org member error:', orgError)
      // Still return user info even if org assignment fails
    }

    return NextResponse.json({
      success: true,
      email,
      password,
      user_id: authData.user.id,
      org_member: orgMember
    })
    
  } catch (err: any) {
    console.error('Server error:', err)
    return NextResponse.json({ 
      error: 'Server error',
      message: err?.message || 'Unknown error'
    }, { status: 500 })
  }
}