import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { billingService } from '@/lib/services/billing'
import { smsLogger } from '@/lib/logger'

// POST - Resume a paused broadcast
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
        id,
        status,
        from_phone_number_id,
        phone_numbers (
          id,
          status
        )
      `)
      .eq('id', id)
      .eq('organization_id', member.organization_id)
      .single()

    if (fetchError || !broadcast) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
    }

    // Check if broadcast can be resumed
    if (broadcast.status !== 'paused') {
      return NextResponse.json({
        error: `Cannot resume a broadcast with status "${broadcast.status}"`,
        code: 'BROADCAST_NOT_RESUMABLE'
      }, { status: 400 })
    }

    // Verify phone number is still active
    if ((broadcast.phone_numbers as any)?.status !== 'active') {
      return NextResponse.json({
        error: 'The phone number for this broadcast is no longer active',
        code: 'PHONE_NUMBER_INACTIVE'
      }, { status: 400 })
    }

    // Get pending recipient count
    const { count: pendingCount } = await supabase
      .from('sms_broadcast_recipients')
      .select('*', { count: 'exact', head: true })
      .eq('broadcast_id', id)
      .eq('status', 'pending')

    if (!pendingCount || pendingCount === 0) {
      // No more recipients, mark as completed
      await supabase
        .from('sms_broadcasts')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)

      return NextResponse.json({
        success: true,
        message: 'Broadcast completed - no pending recipients',
        broadcastId: id
      })
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
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateError) {
      smsLogger.error('Error resuming broadcast', { error: updateError })
      return NextResponse.json({ error: 'Failed to resume broadcast' }, { status: 500 })
    }

    // Trigger the cron endpoint to resume processing
    const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || ''
    if (appUrl) {
      fetch(`${appUrl}/api/cron/process-broadcasts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.CRON_SECRET || ''}`
        },
        body: JSON.stringify({ broadcastId: id })
      }).catch(err => smsLogger.error('Failed to trigger broadcast processing', { error: err }))
    }

    return NextResponse.json({
      success: true,
      message: 'Broadcast resumed',
      broadcastId: id,
      pendingRecipients: pendingCount,
      smsWarning: broadcastCheck.reason
    })
  } catch (error) {
    smsLogger.error('Error in broadcast resume', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
