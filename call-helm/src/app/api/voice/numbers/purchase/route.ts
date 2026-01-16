import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { telnyxService, TelnyxService } from '@/lib/services/telnyx'
import { voiceLogger } from '@/lib/logger'

// Purchase a phone number for an organization
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single()

    if (!member || !['org_admin', 'super_admin'].includes(member.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { phoneNumber, friendlyName, capabilities = {} } = await request.json()
    
    if (!phoneNumber) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      )
    }

    // Check if Telnyx is configured
    if (!TelnyxService.isConfigured()) {
      return NextResponse.json(
        { error: 'Voice services not configured' },
        { status: 503 }
      )
    }

    // Check if number already exists in ANY organization (global uniqueness)
    const { data: existingNumber } = await supabase
      .from('phone_numbers')
      .select('id, organization_id')
      .eq('number', phoneNumber)
      .maybeSingle()

    if (existingNumber) {
      const isSameOrg = existingNumber.organization_id === member.organization_id
      return NextResponse.json(
        {
          error: isSameOrg
            ? 'This phone number is already registered to your organization'
            : 'This phone number is already assigned to another organization'
        },
        { status: 409 }
      )
    }

    // Purchase number from Telnyx
    voiceLogger.info('Purchasing number from Telnyx', { data: { phoneNumber, organizationId: member.organization_id } })

    const purchasedNumber = await telnyxService.purchaseNumber(phoneNumber, {
      connectionId: process.env.TELNYX_CONNECTION_ID,
      messagingProfileId: process.env.TELNYX_MESSAGING_PROFILE_ID
    })

    // Calculate costs (these would typically come from Telnyx pricing or be configurable)
    const monthlyPrice = 1.00 // Standard Telnyx pricing
    const setupCost = 0.00 // No setup fee for most numbers
    
    // Store in database
    const { data: dbNumber, error: dbError } = await supabase
      .from('phone_numbers')
      .insert({
        organization_id: member.organization_id,
        number: phoneNumber,
        friendly_name: friendlyName || `Platform Number ${phoneNumber}`,
        capabilities: {
          voice: capabilities.voice ?? true,
          sms: capabilities.sms ?? true,
          mms: capabilities.mms ?? false,
          fax: false
        },
        status: 'active',
        provider: 'telnyx',
        provider_id: purchasedNumber.id,
        telnyx_phone_number_id: purchasedNumber.id,
        acquisition_method: 'platform',
        verification_status: 'verified', // Platform numbers are automatically verified
        webhook_configured: true, // Webhooks are configured during purchase
        webhook_url: `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/voice/telnyx/webhook?org=${member.organization_id}`,
        monthly_cost: monthlyPrice,
        setup_cost: setupCost,
        billing_start_date: new Date().toISOString(),
        metadata: {
          purchased_at: new Date().toISOString(),
          purchased_by: user.id,
          telnyx_features: purchasedNumber.features
        }
      })
      .select()
      .single()

    if (dbError) {
      voiceLogger.error('Database error after successful Telnyx purchase', { error: dbError })

      // Try to release the Telnyx number since we couldn't store it
      try {
        await telnyxService.releaseNumber(purchasedNumber.id)
      } catch (releaseError) {
        voiceLogger.error('Failed to release Telnyx number after database error', { error: releaseError })
      }

      return NextResponse.json(
        { error: 'Failed to store purchased number. Please contact support.' },
        { status: 500 }
      )
    }

    voiceLogger.info('Successfully purchased and configured number', { data: { phoneNumber } })

    return NextResponse.json({
      success: true,
      phoneNumber: {
        id: dbNumber.id,
        number: dbNumber.number,
        friendlyName: dbNumber.friendly_name,
        capabilities: dbNumber.capabilities,
        status: dbNumber.status,
        acquisitionMethod: dbNumber.acquisition_method,
        verificationStatus: dbNumber.verification_status,
        webhookConfigured: dbNumber.webhook_configured,
        monthlyCost: dbNumber.monthly_cost,
        setupCost: dbNumber.setup_cost,
        telnyxPhoneNumberId: dbNumber.telnyx_phone_number_id
      }
    })
  } catch (error) {
    voiceLogger.error('Error purchasing phone number', { error })

    // Provide more specific error messages
    let errorMessage = 'Failed to purchase phone number'
    let statusCode = 500

    if (error instanceof Error) {
      if (error.message.includes('no longer available') || error.message.includes('not found')) {
        errorMessage = 'This phone number is no longer available. Please search for a different number.'
        statusCode = 410
      } else if (error.message.includes('authentication') || error.message.includes('401')) {
        errorMessage = 'Telnyx configuration issue. Please contact support.'
        statusCode = 503
      } else if (error.message.includes('permission') || error.message.includes('403')) {
        errorMessage = 'Account does not have permission to purchase numbers. Please contact support.'
        statusCode = 503
      } else if (error.message.includes('Invalid phone number')) {
        errorMessage = 'Invalid phone number format.'
        statusCode = 400
      }
    }

    return NextResponse.json({ error: errorMessage }, { status: statusCode })
  }
}