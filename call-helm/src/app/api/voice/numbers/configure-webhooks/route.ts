import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { TelnyxService } from '@/lib/services/telnyx'

// Configure webhooks for an organization's phone numbers
// Note: With Telnyx, webhooks are configured at the connection level, not per-number
// This endpoint updates the database to reflect webhook configuration status
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

    const { numberIds } = await request.json()

    if (!numberIds || !Array.isArray(numberIds)) {
      return NextResponse.json(
        { error: 'Number IDs array is required' },
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

    const results: { numberId: string; phoneNumber: string; status: string }[] = []
    const errors: { numberId: string; error: string }[] = []

    const webhookUrl = `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/voice/telnyx/webhook?org=${member.organization_id}`

    for (const numberId of numberIds) {
      try {
        // Get phone number from database
        const { data: phoneNumber } = await supabase
          .from('phone_numbers')
          .select('id, number, telnyx_phone_number_id, organization_id')
          .eq('id', numberId)
          .eq('organization_id', member.organization_id)
          .single()

        if (!phoneNumber || !phoneNumber.telnyx_phone_number_id) {
          errors.push({
            numberId,
            error: 'Phone number not found or not configured with Telnyx'
          })
          continue
        }

        // With Telnyx, webhooks are at connection level - just update DB status
        await supabase
          .from('phone_numbers')
          .update({
            webhook_configured: true,
            webhook_url: webhookUrl,
            updated_at: new Date().toISOString()
          })
          .eq('id', numberId)

        results.push({
          numberId,
          phoneNumber: phoneNumber.number,
          status: 'configured'
        })
      } catch (error) {
        console.error(`Error configuring webhooks for number ${numberId}:`, error)
        errors.push({
          numberId,
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return NextResponse.json({
      success: true,
      configured: results,
      errors,
      total: numberIds.length,
      successful: results.length,
      failed: errors.length
    })
  } catch (error) {
    console.error('Error configuring webhooks:', error)
    return NextResponse.json(
      { error: 'Failed to configure webhooks' },
      { status: 500 }
    )
  }
}

// Get webhook configuration status for organization's numbers
export async function GET(request: NextRequest) {
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
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get organization's phone numbers with webhook status
    const { data: phoneNumbers } = await supabase
      .from('phone_numbers')
      .select('id, number, friendly_name, webhook_configured, webhook_url, telnyx_phone_number_id')
      .eq('organization_id', member.organization_id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })

    const webhookStatus = phoneNumbers?.map(number => ({
      id: number.id,
      number: number.number,
      friendlyName: number.friendly_name,
      webhookConfigured: number.webhook_configured,
      webhookUrl: number.webhook_url,
      hasTelnyxId: !!number.telnyx_phone_number_id,
      needsConfiguration: !number.webhook_configured && !!number.telnyx_phone_number_id
    })) || []

    const summary = {
      total: webhookStatus.length,
      configured: webhookStatus.filter(n => n.webhookConfigured).length,
      needsConfiguration: webhookStatus.filter(n => n.needsConfiguration).length,
      missingTelnyxId: webhookStatus.filter(n => !n.hasTelnyxId).length
    }

    return NextResponse.json({
      success: true,
      phoneNumbers: webhookStatus,
      summary
    })
  } catch (error) {
    console.error('Error getting webhook status:', error)
    return NextResponse.json(
      { error: 'Failed to get webhook configuration status' },
      { status: 500 }
    )
  }
}