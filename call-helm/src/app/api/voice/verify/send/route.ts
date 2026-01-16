import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { telnyxService } from '@/lib/services/telnyx'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get request body
    const { phoneNumber, channel = 'sms' } = await request.json()

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    // Validate channel (only SMS supported for now with Telnyx)
    if (!['sms'].includes(channel)) {
      return NextResponse.json({ error: 'Only SMS verification is currently supported' }, { status: 400 })
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

    // Get verification code from database (check phone_numbers table for pending verification)
    const { data: pendingNumber } = await supabase
      .from('phone_numbers')
      .select('verification_code')
      .eq('organization_id', member.organization_id)
      .eq('verification_status', 'pending')
      .eq('number', phoneNumber)
      .single()

    // Also check voice_integrations as fallback
    let verificationCode = pendingNumber?.verification_code

    if (!verificationCode) {
      const { data: integration } = await supabase
        .from('voice_integrations')
        .select('verification_code')
        .eq('organization_id', member.organization_id)
        .eq('verification_status', 'pending')
        .single()

      verificationCode = integration?.verification_code
    }

    if (!verificationCode) {
      return NextResponse.json({ error: 'No pending verification found' }, { status: 400 })
    }

    // Send verification code via SMS using Telnyx
    await telnyxService.sendVerificationSMS(phoneNumber, verificationCode)

    return NextResponse.json({
      success: true,
      channel: 'sms',
      message: 'Verification code sent via SMS'
    })
  } catch (error) {
    console.error('Error sending verification code:', error)
    return NextResponse.json(
      { error: 'Failed to send verification code' },
      { status: 500 }
    )
  }
}

// Endpoint to lookup phone number type before verification
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const phoneNumber = request.nextUrl.searchParams.get('phoneNumber')

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    // For now, default to SMS for all number types
    // Telnyx phone number lookup can be added later if needed
    return NextResponse.json({
      success: true,
      phoneNumber,
      type: 'unknown',
      carrier: null,
      // Default to SMS for Telnyx
      recommendedChannel: 'sms'
    })
  } catch (error) {
    console.error('Error looking up phone number:', error)
    return NextResponse.json(
      { error: 'Failed to lookup phone number' },
      { status: 500 }
    )
  }
}