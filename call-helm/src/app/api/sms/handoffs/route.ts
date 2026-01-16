import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { smsLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sms/handoffs - List pending handoffs for current user
 * POST /api/sms/handoffs - Create a new handoff
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const type = searchParams.get('type') || 'incoming' // incoming, outgoing, all

    let query = supabase
      .from('conversation_handoffs')
      .select(`
        *,
        conversation:sms_conversations(
          id,
          phone_number,
          contact:contacts(first_name, last_name)
        ),
        from_agent:user_profiles!conversation_handoffs_from_agent_id_fkey(
          id,
          full_name,
          avatar_url
        ),
        to_agent:user_profiles!conversation_handoffs_to_agent_id_fkey(
          id,
          full_name,
          avatar_url
        )
      `)
      .order('created_at', { ascending: false })

    if (type === 'incoming') {
      query = query.eq('to_agent_id', user.id).eq('status', 'pending')
    } else if (type === 'outgoing') {
      query = query.eq('from_agent_id', user.id)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ success: true, handoffs: data || [] })
  } catch (error) {
    smsLogger.error('Error fetching handoffs', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { conversation_id, to_agent_id, reason, notes } = body

    if (!conversation_id || !to_agent_id) {
      return NextResponse.json({ error: 'conversation_id and to_agent_id are required' }, { status: 400 })
    }

    // Create handoff
    const { data, error } = await supabase
      .from('conversation_handoffs')
      .insert({
        conversation_id,
        from_agent_id: user.id,
        to_agent_id,
        reason,
        notes,
        status: 'pending'
      })
      .select()
      .single()

    if (error) throw error

    // Create notification for target agent
    await supabase
      .from('notifications')
      .insert({
        user_id: to_agent_id,
        type: 'handoff_request',
        title: 'Conversation Handoff Request',
        message: reason || 'You have received a conversation handoff request',
        metadata: {
          handoff_id: data.id,
          conversation_id,
          from_agent_id: user.id
        }
      })

    return NextResponse.json({ success: true, handoff: data })
  } catch (error) {
    smsLogger.error('Error creating handoff', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
