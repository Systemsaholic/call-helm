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
    const { phoneNumber, channel = 'call' } = await request.json()

    if (!phoneNumber) {
      return NextResponse.json({ error: 'Phone number is required' }, { status: 400 })
    }

    // Validate channel
    if (!['sms', 'call'].includes(channel)) {
      return NextResponse.json({ error: 'Invalid channel. Use "sms" or "call"' }, { status: 400 })
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

    // Send verification code via the selected channel
    if (channel === 'sms') {
      await signalwireService.sendVerificationCode(phoneNumber, verificationCode)
    } else {
      // Voice call - works for landlines and mobile
      await signalwireService.sendVerificationCall(phoneNumber, verificationCode)
    }

    return NextResponse.json({
      success: true,
      channel,
      message: channel === 'sms'
        ? 'Verification code sent via SMS'
        : 'Verification call initiated. Please answer the call to receive your code.'
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

    // Lookup the phone number type
    const lookup = await signalwireService.lookupPhoneNumber(phoneNumber)

    return NextResponse.json({
      success: true,
      ...lookup,
      // Recommend call for landlines, SMS for mobile, call as default
      recommendedChannel: lookup.type === 'mobile' ? 'sms' : 'call'
    })
  } catch (error) {
    console.error('Error looking up phone number:', error)
    return NextResponse.json(
      { error: 'Failed to lookup phone number' },
      { status: 500 }
    )
  }
}