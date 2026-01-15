import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Mark messages as read
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { messageIds, conversationId } = await request.json()

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

    // If conversationId is provided, mark all messages in the conversation as read
    if (conversationId) {
      const { data, error } = await supabase
        .rpc('mark_conversation_as_read', {
          p_conversation_id: conversationId,
          p_user_id: user.id
        })

      if (error) {
        console.error('Error marking conversation as read:', error)
        return NextResponse.json(
          { error: 'Failed to mark conversation as read' },
          { status: 500 }
        )
      }

      // Emit real-time event for read status update
      await supabase.channel('sms-read-status')
        .send({
          type: 'broadcast',
          event: 'conversation-read',
          payload: {
            conversationId,
            userId: user.id,
            timestamp: new Date().toISOString()
          }
        })

      return NextResponse.json({
        success: true,
        markedCount: data
      })
    }

    // Mark specific messages as read
    if (messageIds && messageIds.length > 0) {
      const readStatuses = messageIds.map((messageId: string) => ({
        message_id: messageId,
        user_id: user.id,
        organization_id: member.organization_id
      }))

      const { error } = await supabase
        .from('message_read_status')
        .upsert(readStatuses, {
          onConflict: 'message_id,user_id'
        })

      if (error) {
        console.error('Error marking messages as read:', error)
        return NextResponse.json(
          { error: 'Failed to mark messages as read' },
          { status: 500 }
        )
      }

      // Emit real-time event for read status update
      await supabase.channel('sms-read-status')
        .send({
          type: 'broadcast',
          event: 'messages-read',
          payload: {
            messageIds,
            userId: user.id,
            timestamp: new Date().toISOString()
          }
        })

      return NextResponse.json({
        success: true,
        markedCount: messageIds.length
      })
    }

    return NextResponse.json(
      { error: 'Either messageIds or conversationId is required' },
      { status: 400 }
    )
  } catch (error) {
    console.error('Error in read status POST:', error)
    return NextResponse.json(
      { error: 'Failed to update read status' },
      { status: 500 }
    )
  }
}

// Get unread counts
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type') || 'total' // 'total' or 'by-conversation'

    if (type === 'total') {
      // Get total unread count across all conversations
      const { data, error } = await supabase
        .rpc('get_total_unread_count', {
          p_user_id: user.id
        })
        .single()

      if (error) {
        console.error('Error fetching unread count:', error)
        return NextResponse.json(
          { error: 'Failed to fetch unread count' },
          { status: 500 }
        )
      }

      return NextResponse.json({
        success: true,
        totalUnread: (data as any)?.total_unread || 0,
        conversationsWithUnread: (data as any)?.conversations_with_unread || 0
      })
    }

    // Get unread counts by conversation
    const { data: conversations, error } = await supabase
      .from('conversations_with_unread')
      .select('conversation_id, phone_number, display_name, unread_count, last_message_at')
      .gt('unread_count', 0)
      .order('last_message_at', { ascending: false })

    if (error) {
      console.error('Error fetching unread by conversation:', error)
      return NextResponse.json(
        { error: 'Failed to fetch unread counts' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      conversations: conversations || []
    })
  } catch (error) {
    console.error('Error in read status GET:', error)
    return NextResponse.json(
      { error: 'Failed to fetch read status' },
      { status: 500 }
    )
  }
}