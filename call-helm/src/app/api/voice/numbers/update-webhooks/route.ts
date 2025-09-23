import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { signalwireService } from '@/lib/services/signalwire'
import { asyncHandler, AuthenticationError, AuthorizationError } from '@/lib/errors/handler'

export const POST = asyncHandler(async (request: NextRequest) => {
  const supabase = await createServerSupabaseClient()

  // Check authentication
  const {
    data: { user }
  } = await supabase.auth.getUser()
  if (!user) {
    throw new AuthenticationError()
  }

  // Get request body
  const { numberSid, organizationId } = await request.json()

  if (!numberSid) {
    return NextResponse.json(
      { error: 'numberSid is required' },
      { status: 400 }
    )
  }

  // Verify user belongs to organization if provided
  if (organizationId) {
    const { data: member } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .single()

    if (!member) {
      throw new AuthorizationError("Unauthorized for this organization")
    }
  }

  try {
    // Update webhook URLs with current environment variables
    await signalwireService.updateWebhookUrls(numberSid)

    return NextResponse.json({
      success: true,
      message: "Webhook URLs updated successfully",
      numberSid
    })
  } catch (error) {
    console.error('Failed to update webhook URLs:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to update webhook URLs',
      code: 'UPDATE_WEBHOOKS_FAILED'
    }, { status: 400 })
  }
})