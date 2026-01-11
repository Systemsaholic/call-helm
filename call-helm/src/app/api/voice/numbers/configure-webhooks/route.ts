import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { signalwireService, SignalWireService } from '@/lib/services/signalwire'

// Configure webhooks for an organization's phone numbers
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

    // Check if SignalWire is configured
    if (!SignalWireService.isConfigured()) {
      return NextResponse.json(
        { error: 'Voice services not configured' },
        { status: 503 }
      )
    }

    const results = []
    const errors = []

    for (const numberId of numberIds) {
      try {
        // Get phone number from database
        const { data: phoneNumber } = await supabase
          .from('phone_numbers')
          .select('id, number, signalwire_phone_number_sid, organization_id')
          .eq('id', numberId)
          .eq('organization_id', member.organization_id)
          .single()

        if (!phoneNumber || !phoneNumber.signalwire_phone_number_sid) {
          errors.push({
            numberId,
            error: 'Phone number not found or not configured with SignalWire'
          })
          continue
        }

        // Configure webhooks for this organization
        await signalwireService.configureOrganizationWebhooks(
          phoneNumber.signalwire_phone_number_sid,
          phoneNumber.organization_id
        )

        // Update database to mark webhooks as configured
        await supabase
          .from('phone_numbers')
          .update({
            webhook_configured: true,
            webhook_url: `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/voice/webhook?org=${phoneNumber.organization_id}`,
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
      .select('id, number, friendly_name, webhook_configured, webhook_url, signalwire_phone_number_sid')
      .eq('organization_id', member.organization_id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })

    const webhookStatus = phoneNumbers?.map(number => ({
      id: number.id,
      number: number.number,
      friendlyName: number.friendly_name,
      webhookConfigured: number.webhook_configured,
      webhookUrl: number.webhook_url,
      hasSignalWireSid: !!number.signalwire_phone_number_sid,
      needsConfiguration: !number.webhook_configured && !!number.signalwire_phone_number_sid
    })) || []

    const summary = {
      total: webhookStatus.length,
      configured: webhookStatus.filter(n => n.webhookConfigured).length,
      needsConfiguration: webhookStatus.filter(n => n.needsConfiguration).length,
      missingSignalWireSid: webhookStatus.filter(n => !n.hasSignalWireSid).length
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