import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { asyncHandler, AuthenticationError, AuthorizationError } from '@/lib/errors/handler'
import { voiceLogger } from '@/lib/logger'

// Note: With Telnyx, webhooks are configured at the connection level, not per-number
// This endpoint updates the database webhook URL reference
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
  const { numberId, organizationId } = await request.json()

  if (!numberId) {
    return NextResponse.json(
      { error: 'numberId is required' },
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
    const webhookUrl = `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/voice/telnyx/webhook${organizationId ? `?org=${organizationId}` : ''}`

    // Update database with new webhook URL
    await supabase
      .from('phone_numbers')
      .update({
        webhook_url: webhookUrl,
        webhook_configured: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', numberId)

    return NextResponse.json({
      success: true,
      message: "Webhook URL updated successfully",
      numberId,
      webhookUrl
    })
  } catch (error) {
    voiceLogger.error('Failed to update webhook URL', { error })
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to update webhook URL',
      code: 'UPDATE_WEBHOOKS_FAILED'
    }, { status: 400 })
  }
})