import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/sms/conversations/bulk - Perform bulk actions on conversations
 * Actions: archive, assign, update_status, add_tags, remove_tags
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const body = await request.json()
    const { conversation_ids, action, payload } = body

    if (!conversation_ids || !Array.isArray(conversation_ids) || conversation_ids.length === 0) {
      return NextResponse.json({ error: 'conversation_ids array required' }, { status: 400 })
    }

    if (!action) {
      return NextResponse.json({ error: 'action required' }, { status: 400 })
    }

    let updates: Record<string, any> = {}
    let affected = 0

    switch (action) {
      case 'archive':
        updates = { status: 'archived' }
        break

      case 'unarchive':
        updates = { status: 'active' }
        break

      case 'assign':
        if (!payload?.agent_id) {
          return NextResponse.json({ error: 'agent_id required for assign action' }, { status: 400 })
        }
        updates = { assigned_agent_id: payload.agent_id }
        break

      case 'unassign':
        updates = { assigned_agent_id: null }
        break

      case 'update_status':
        if (!payload?.workflow_status) {
          return NextResponse.json({ error: 'workflow_status required' }, { status: 400 })
        }
        updates = { workflow_status: payload.workflow_status }
        break

      case 'update_priority':
        if (!payload?.priority) {
          return NextResponse.json({ error: 'priority required' }, { status: 400 })
        }
        updates = { priority: payload.priority }
        break

      case 'add_tags':
        if (!payload?.tags || !Array.isArray(payload.tags)) {
          return NextResponse.json({ error: 'tags array required' }, { status: 400 })
        }
        // Need to update each conversation individually to append tags
        for (const convId of conversation_ids) {
          const { data: conv } = await supabase
            .from('sms_conversations')
            .select('tags')
            .eq('id', convId)
            .eq('organization_id', member.organization_id)
            .single()

          if (conv) {
            const existingTags = conv.tags || []
            const newTags = [...new Set([...existingTags, ...payload.tags])]
            await supabase
              .from('sms_conversations')
              .update({ tags: newTags })
              .eq('id', convId)
            affected++
          }
        }
        return NextResponse.json({ success: true, affected })

      case 'remove_tags':
        if (!payload?.tags || !Array.isArray(payload.tags)) {
          return NextResponse.json({ error: 'tags array required' }, { status: 400 })
        }
        // Need to update each conversation individually to remove tags
        for (const convId of conversation_ids) {
          const { data: conv } = await supabase
            .from('sms_conversations')
            .select('tags')
            .eq('id', convId)
            .eq('organization_id', member.organization_id)
            .single()

          if (conv) {
            const existingTags = conv.tags || []
            const newTags = existingTags.filter((t: string) => !payload.tags.includes(t))
            await supabase
              .from('sms_conversations')
              .update({ tags: newTags })
              .eq('id', convId)
            affected++
          }
        }
        return NextResponse.json({ success: true, affected })

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // Perform bulk update
    const { data, error } = await supabase
      .from('sms_conversations')
      .update(updates)
      .in('id', conversation_ids)
      .eq('organization_id', member.organization_id)
      .select('id')

    if (error) throw error

    return NextResponse.json({
      success: true,
      affected: data?.length || 0
    })
  } catch (error) {
    console.error('Error performing bulk action:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
