import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { signalwireService } from '@/lib/services/signalwire'
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

  // Get base URL for webhooks
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    throw new ValidationError('Application URL not configured. Please set APP_URL or NEXT_PUBLIC_APP_URL environment variable.')
  }

  // Purchase the phone number
  const voiceUrl = `${appUrl}/api/voice/webhook`
  const smsUrl = `${appUrl}/api/voice/sms`

  let purchasedNumber
  try {
    purchasedNumber = await signalwireService.purchaseNumber(phoneNumber, {
      friendlyName: `Business Number - ${organizationId}`,
      voiceUrl,
      smsUrl
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
        voice: true,
        sms: purchasedNumber.capabilities?.sms || false,
        mms: purchasedNumber.capabilities?.mms || false
      },
      status: "active",
      is_primary: true,
      number_source: "platform",
      forwarding_enabled: true,
      forwarding_destination: forwardingNumber,
      provider_id: purchasedNumber.sid,
      metadata: {
        purchased_at: new Date().toISOString(),
        monthly_price: 0
      }
    })
    .select()
    .single()

  if (phoneError) {
    // Release purchased number if DB insert fails
    try {
      await signalwireService.releaseNumber(purchasedNumber.sid)
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
      platform_number_sid: purchasedNumber.sid,
      updated_at: new Date().toISOString()
    })
    .eq("organization_id", organizationId)

  if (updateError) {
    // Try to release the number and remove created phone record if update fails
    try {
      await signalwireService.releaseNumber(purchasedNumber.sid)
      await supabase.from("phone_numbers").delete().eq("id", createdPhone.id)
    } catch (releaseError) {
      console.error("Failed to release number after error:", releaseError)
    }
    console.error("Error updating voice integration:", updateError)
    throw updateError
  }

  // Configure call forwarding
  await signalwireService.configureForwarding(purchasedNumber.sid, forwardingNumber)

  return NextResponse.json({
    success: true,
    message: "Phone number provisioned successfully",
    number: {
      phoneNumber: purchasedNumber.phoneNumber,
      sid: purchasedNumber.sid,
      forwardingNumber
    }
  })
})