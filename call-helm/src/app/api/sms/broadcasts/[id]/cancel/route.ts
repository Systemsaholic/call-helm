import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST - Cancel a broadcast
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
      .select('id, status')
      .eq('id', id)
      .eq('organization_id', member.organization_id)
      .single()

    if (fetchError || !broadcast) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
    }

    // Check if broadcast can be cancelled
    if (!['draft', 'scheduled', 'sending', 'paused'].includes(broadcast.status)) {
      return NextResponse.json({
        error: `Cannot cancel a broadcast with status "${broadcast.status}"`,
        code: 'BROADCAST_NOT_CANCELLABLE'
      }, { status: 400 })
    }

    // Update broadcast status to cancelled
    const { error: updateError } = await supabase
      .from('sms_broadcasts')
      .update({
        status: 'cancelled',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateError) {
      console.error('Error cancelling broadcast:', updateError)
      return NextResponse.json({ error: 'Failed to cancel broadcast' }, { status: 500 })
    }

    // Mark all pending recipients as skipped
    const { error: recipientError } = await supabase
      .from('sms_broadcast_recipients')
      .update({
        status: 'skipped',
        skip_reason: 'broadcast_cancelled'
      })
      .eq('broadcast_id', id)
      .eq('status', 'pending')

    if (recipientError) {
      console.error('Error updating recipients:', recipientError)
      // Don't fail the request, the broadcast is already cancelled
    }

    // Get final stats
    const { data: stats } = await supabase
      .from('sms_broadcast_recipients')
      .select('status')
      .eq('broadcast_id', id)

    const statusCounts = stats?.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1
      return acc
    }, {} as Record<string, number>) || {}

    return NextResponse.json({
      success: true,
      message: 'Broadcast cancelled',
      broadcastId: id,
      stats: statusCounts
    })
  } catch (error) {
    console.error('Error in broadcast cancel:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
