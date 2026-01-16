import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { smsLogger } from '@/lib/logger'

// POST - Pause a sending broadcast
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

    // Check if broadcast can be paused
    if (broadcast.status !== 'sending') {
      return NextResponse.json({
        error: `Cannot pause a broadcast with status "${broadcast.status}"`,
        code: 'BROADCAST_NOT_PAUSABLE'
      }, { status: 400 })
    }

    // Update broadcast status to paused
    const { error: updateError } = await supabase
      .from('sms_broadcasts')
      .update({
        status: 'paused',
        updated_at: new Date().toISOString()
      })
      .eq('id', id)

    if (updateError) {
      smsLogger.error('Error pausing broadcast', { error: updateError })
      return NextResponse.json({ error: 'Failed to pause broadcast' }, { status: 500 })
    }

    // Get current stats
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
      message: 'Broadcast paused',
      broadcastId: id,
      stats: statusCounts
    })
  } catch (error) {
    smsLogger.error('Error in broadcast pause', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
