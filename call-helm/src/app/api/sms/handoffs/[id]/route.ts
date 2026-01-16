import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { smsLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/sms/handoffs/[id] - Accept or decline a handoff
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { action } = body // 'accept' or 'decline'

    if (!action || !['accept', 'decline'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Get handoff
    const { data: handoff, error: fetchError } = await supabase
      .from('conversation_handoffs')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !handoff) {
      return NextResponse.json({ error: 'Handoff not found' }, { status: 404 })
    }

    // Verify user is the target agent
    if (handoff.to_agent_id !== user.id) {
      return NextResponse.json({ error: 'Not authorized to respond to this handoff' }, { status: 403 })
    }

    if (handoff.status !== 'pending') {
      return NextResponse.json({ error: 'Handoff already processed' }, { status: 400 })
    }

    const newStatus = action === 'accept' ? 'accepted' : 'declined'

    // Update handoff status
    const { data, error } = await supabase
      .from('conversation_handoffs')
      .update({
        status: newStatus,
        acknowledged_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    // If accepted, transfer the conversation
    if (action === 'accept') {
      await supabase
        .from('sms_conversations')
        .update({ assigned_agent_id: user.id })
        .eq('id', handoff.conversation_id)

      // Notify the original agent
      if (handoff.from_agent_id) {
        await supabase
          .from('notifications')
          .insert({
            user_id: handoff.from_agent_id,
            type: 'handoff_accepted',
            title: 'Handoff Accepted',
            message: 'Your conversation handoff has been accepted',
            metadata: {
              handoff_id: id,
              conversation_id: handoff.conversation_id
            }
          })
      }
    } else {
      // Notify the original agent of decline
      if (handoff.from_agent_id) {
        await supabase
          .from('notifications')
          .insert({
            user_id: handoff.from_agent_id,
            type: 'handoff_declined',
            title: 'Handoff Declined',
            message: 'Your conversation handoff was declined',
            metadata: {
              handoff_id: id,
              conversation_id: handoff.conversation_id
            }
          })
      }
    }

    return NextResponse.json({ success: true, handoff: data })
  } catch (error) {
    smsLogger.error('Error processing handoff', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
