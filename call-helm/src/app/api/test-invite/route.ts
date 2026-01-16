import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { apiLogger } from '@/lib/logger'

// Test endpoint to verify invitation functionality
export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json()
    
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }
    
    // Check if service role key exists
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      return NextResponse.json({ 
        error: 'Service role key not configured',
        details: 'SUPABASE_SERVICE_ROLE_KEY environment variable is missing'
      }, { status: 500 })
    }
    
    // Create admin client
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
    
    // Test inviting a user
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          test: true,
          invited_via: 'test_endpoint'
        },
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3035'}/auth/callback?type=invite`
      }
    )
    
    if (error) {
      apiLogger.error('Invitation error', { error })
      return NextResponse.json({ 
        error: 'Failed to send invitation',
        details: error.message,
        code: error.code || error.status
      }, { status: 400 })
    }
    
    return NextResponse.json({ 
      success: true,
      message: `Invitation sent to ${email}`,
      data: {
        userId: data?.user?.id,
        email: data?.user?.email,
        emailConfirmedAt: data?.user?.email_confirmed_at
      }
    })
    
  } catch (error) {
    apiLogger.error('Test invite error', { error })
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}