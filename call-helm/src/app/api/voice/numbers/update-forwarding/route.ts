import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { validatePhone } from '@/lib/utils/phone'
import { voiceLogger } from '@/lib/logger'

export async function POST(request: NextRequest) {
  try {
    const { phoneNumberId, forwardingDestination, forwardingEnabled } = await request.json()

    // Validate input
    if (!phoneNumberId) {
      return NextResponse.json(
        { success: false, error: 'Phone number ID is required' },
        { status: 400 }
      )
    }

    if (!forwardingDestination?.trim()) {
      return NextResponse.json(
        { success: false, error: 'Forwarding destination is required' },
        { status: 400 }
      )
    }

    // Validate the forwarding destination phone number
    const validation = validatePhone(forwardingDestination.trim())
    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, error: validation.errors.join(', ') },
        { status: 400 }
      )
    }

    const supabase = await createServerSupabaseClient()

    // Get the current user and their organization
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json(
        { success: false, error: 'Organization membership required' },
        { status: 403 }
      )
    }

    // Update the phone number record
    const { data: phoneNumber, error: updateError } = await supabase
      .from('phone_numbers')
      .update({
        forwarding_destination: forwardingDestination.trim(),
        forwarding_enabled: forwardingEnabled || false,
        updated_at: new Date().toISOString()
      })
      .eq('id', phoneNumberId)
      .eq('organization_id', member.organization_id)
      .select()
      .single()

    if (updateError) {
      voiceLogger.error('Database update error', { error: updateError })
      return NextResponse.json(
        { success: false, error: 'Failed to update phone number' },
        { status: 500 }
      )
    }

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, error: 'Phone number not found or access denied' },
        { status: 404 }
      )
    }

    voiceLogger.info('Updated forwarding for phone number', { data: { number: phoneNumber.number, forwardingDestination } })

    return NextResponse.json({
      success: true,
      phoneNumber: {
        id: phoneNumber.id,
        number: phoneNumber.number,
        forwardingDestination: phoneNumber.forwarding_destination,
        forwardingEnabled: phoneNumber.forwarding_enabled
      }
    })

  } catch (error) {
    voiceLogger.error('Update forwarding error', { error })
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}