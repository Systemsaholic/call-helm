import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { billingService } from '@/lib/services/billing'

// POST - Start sending a broadcast
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get broadcast
    const { data: broadcast, error: fetchError } = await supabase
      .from('sms_broadcasts')
      .select(`
        *,
        phone_numbers (
          id,
          number,
          status
        )
      `)
      .eq('id', id)
      .eq('organization_id', member.organization_id)
      .single()

    if (fetchError || !broadcast) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
    }

    // Check if broadcast can be started
    if (!['draft', 'scheduled'].includes(broadcast.status)) {
      return NextResponse.json({
        error: `Cannot start a broadcast with status "${broadcast.status}"`,
        code: 'BROADCAST_NOT_STARTABLE'
      }, { status: 400 })
    }

    // Verify phone number is still active
    if (broadcast.phone_numbers?.status !== 'active') {
      return NextResponse.json({
        error: 'The phone number for this broadcast is no longer active',
        code: 'PHONE_NUMBER_INACTIVE'
      }, { status: 400 })
    }

    // TODO: Re-enable 10DLC validation after fixing RLS issue
    // Validate 10DLC compliance again
    // const compliance = await billingService.validate10DLCCompliance(broadcast.from_phone_number_id)
    // if (!compliance.valid) {
    //   return NextResponse.json({
    //     error: compliance.error,
    //     code: '10DLC_NOT_COMPLIANT'
    //   }, { status: 400 })
    // }

    // Get pending recipient count for usage check
    const { count: pendingCount } = await supabase
      .from('sms_broadcast_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('broadcast_id', id)
      .eq('status', 'pending')

    if (!pendingCount || pendingCount === 0) {
      return NextResponse.json({
        error: 'No pending recipients to send to',
        code: 'NO_RECIPIENTS'
      }, { status: 400 })
    }

    // Check SMS limits
    const broadcastCheck = await billingService.canSendBroadcast(
      member.organization_id,
      pendingCount
    )

    if (!broadcastCheck.canSend) {
      return NextResponse.json({
        error: broadcastCheck.reason,
        code: broadcastCheck.requiresUpgrade ? 'PLAN_UPGRADE_REQUIRED' : 'BROADCAST_NOT_ALLOWED'
      }, { status: 403 })
    }

    // Update broadcast status to sending
    const { error: updateError } = await supabase
      .from('sms_broadcasts')
      .update({
        status: 'sending',
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateError) {
      console.error('Error updating broadcast status:', updateError)
      return NextResponse.json({ error: 'Failed to start broadcast' }, { status: 500 })
    }

    // Trigger the cron endpoint to start processing immediately
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''
    if (appUrl) {
      fetch(`${appUrl}/api/cron/process-broadcasts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET || ''}`
        },
        body: JSON.stringify({ broadcastId: id })
      }).catch(err => console.error('Failed to trigger broadcast processing:', err))
    }

    return NextResponse.json({
      success: true,
      message: 'Broadcast started',
      broadcastId: id,
      pendingRecipients: pendingCount,
      smsWarning: broadcastCheck.reason
    })
  } catch (error) {
    console.error('Error in broadcast send:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
