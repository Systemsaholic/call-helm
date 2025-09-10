import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { signalwireService } from '@/lib/services/signalwire'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get request body
    const { phoneNumber } = await request.json()
    
    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get verification code from database
    const { data: integration } = await supabase
      .from('voice_integrations')
      .select('verification_code')
      .eq('organization_id', member.organization_id)
      .eq('verification_status', 'pending')
      .single()

    if (!integration || !integration.verification_code) {
      return NextResponse.json({ error: 'No pending verification found' }, { status: 400 })
    }

    // Send verification code via SignalWire
    await signalwireService.sendVerificationCode(phoneNumber, integration.verification_code)

    return NextResponse.json({ 
      success: true,
      message: 'Verification code sent successfully'
    })
  } catch (error) {
    console.error('Error sending verification code:', error)
    return NextResponse.json(
      { error: 'Failed to send verification code' },
      { status: 500 }
    )
  }
}