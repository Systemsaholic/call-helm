import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { telnyxService } from '@/lib/services/telnyx'
import { provisionPhoneNumberSchema } from '@/lib/validations/api.schema'
import { asyncHandler, ValidationError, AuthenticationError, AuthorizationError } from '@/lib/errors/handler'

export const POST = asyncHandler(async (request: NextRequest) => {
  const supabase = await createServerSupabaseClient()

  // Check authentication
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) {
    throw new AuthenticationError()
  }

  // Get and validate request body
  const body = await request.json()
  const { phoneNumber, forwardingNumber, organizationId } = provisionPhoneNumberSchema.parse(body)

  // Verify user belongs to organization
  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .single()

  if (!member) {
    throw new AuthorizationError("Unauthorized for this organization")
  }

  // Check if number already exists in ANY organization (global uniqueness)
  const { data: existingNumber } = await supabase
    .from('phone_numbers')
    .select('id, organization_id')
    .eq('number', phoneNumber)
    .maybeSingle()

  if (existingNumber) {
    const isSameOrg = existingNumber.organization_id === organizationId
    throw new ValidationError(
      isSameOrg
        ? 'This phone number is already registered to your organization'
        : 'This phone number is already assigned to another organization'
    )
  }

  // Get base URL for webhooks
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    throw new ValidationError('Application URL not configured. Please set APP_URL or NEXT_PUBLIC_APP_URL environment variable.')
  }

  // Purchase the phone number from Telnyx
  let purchasedNumber
  try {
    purchasedNumber = await telnyxService.purchaseNumber(phoneNumber, {
      connectionId: process.env.TELNYX_CONNECTION_ID,
      messagingProfileId: process.env.TELNYX_MESSAGING_PROFILE_ID
    })
  } catch (error) {
    console.error('Failed to purchase number:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to purchase phone number',
      code: 'PURCHASE_FAILED'
    }, { status: 400 })
  }

  // Create phone number record first to avoid leaving voice_integrations updated on failure
  const { data: createdPhone, error: phoneError } = await supabase
    .from("phone_numbers")
    .insert({
      organization_id: organizationId,
      number: phoneNumber,
      friendly_name: "Platform Business Number",
      capabilities: {
        voice: purchasedNumber.features?.voice ?? true,
        sms: purchasedNumber.features?.sms ?? true,
        mms: purchasedNumber.features?.mms ?? false
      },
      status: "active",
      is_primary: true,
      number_source: "platform",
      forwarding_enabled: true,
      forwarding_destination: forwardingNumber,
      provider: "telnyx",
      provider_id: purchasedNumber.id,
      telnyx_phone_number_id: purchasedNumber.id,
      webhook_url: `${appUrl}/api/voice/telnyx/webhook?org=${organizationId}`,
      metadata: {
        purchased_at: new Date().toISOString(),
        monthly_price: 1.00
      }
    })
    .select()
    .single()

  if (phoneError) {
    // Release purchased number if DB insert fails
    try {
      await telnyxService.releaseNumber(purchasedNumber.id)
    } catch (releaseError) {
      console.error("Failed to release number after create failure:", releaseError)
    }
    console.error("Error creating phone number record:", phoneError)
    throw phoneError
  }

  // Update voice integration
  const { error: updateError } = await supabase
    .from("voice_integrations")
    .update({
      verified_number: phoneNumber,
      forwarding_number: forwardingNumber,
      verification_status: "verified",
      number_type: "platform",
      platform_number_id: purchasedNumber.id,
      updated_at: new Date().toISOString()
    })
    .eq("organization_id", organizationId)

  if (updateError) {
    // Try to release the number and remove created phone record if update fails
    try {
      await telnyxService.releaseNumber(purchasedNumber.id)
      await supabase.from("phone_numbers").delete().eq("id", createdPhone.id)
    } catch (releaseError) {
      console.error("Failed to release number after error:", releaseError)
    }
    console.error("Error updating voice integration:", updateError)
    throw updateError
  }

  // Note: Telnyx call forwarding is handled via the connection's webhook URL
  // No additional configuration needed for forwarding

  return NextResponse.json({
    success: true,
    message: "Phone number provisioned successfully",
    number: {
      phoneNumber: purchasedNumber.phoneNumber,
      id: purchasedNumber.id,
      forwardingNumber
    }
  })
})