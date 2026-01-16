import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { smsLogger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    
    const tab = searchParams.get('tab') || 'all'
    const userId = searchParams.get('userId')
    
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 })
    }

    let query = supabase
      .from('sms_conversations')
      .select(`
        *,
        contact:contacts(
          first_name,
          last_name,
          company,
          email
        )
      `)
      .order('last_message_at', { ascending: false })

    // Apply filters based on tab
    if (tab === 'assigned') {
      query = query.eq('assigned_agent_id', userId)
    } else if (tab === 'unassigned') {
      query = query.is('assigned_agent_id', null)
    } else if (tab === 'archived') {
      query = query.eq('status', 'archived')
    } else {
      query = query.neq('status', 'archived')
    }

    const { data: conversations, error } = await query

    if (error) {
      smsLogger.error('Database error', { error })
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
    }

    return NextResponse.json({ conversations })
  } catch (error) {
    smsLogger.error('Error fetching conversations', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { conversationId, action, agentId } = await request.json()

    if (!conversationId) {
      return NextResponse.json({ error: 'Conversation ID required' }, { status: 400 })
    }

    let updateData: Record<string, string | null> = {}

    switch (action) {
      case 'claim':
        if (!agentId) {
          return NextResponse.json({ error: 'Agent ID required for claiming' }, { status: 400 })
        }
        updateData = { assigned_agent_id: agentId }
        break
      case 'unclaim':
        updateData = { assigned_agent_id: null }
        break
      case 'archive':
        updateData = { status: 'archived' }
        break
      case 'unarchive':
        updateData = { status: 'active' }
        break
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const { error } = await supabase
      .from('sms_conversations')
      .update(updateData)
      .eq('id', conversationId)

    if (error) {
      smsLogger.error('Database error updating conversation', { error })
      return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    smsLogger.error('Error updating conversation', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}