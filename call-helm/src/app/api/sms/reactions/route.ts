import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Add a reaction to a message
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { messageId, reaction } = await request.json()

    if (!messageId || !reaction) {
      return NextResponse.json(
        { error: 'Message ID and reaction are required' },
        { status: 400 }
      )
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

    // Verify the message belongs to the organization
    const { data: message } = await supabase
      .from('sms_messages')
      .select('id')
      .eq('id', messageId)
      .eq('organization_id', member.organization_id)
      .single()

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    // Add or update the reaction (upsert)
    const { data: reactionData, error } = await supabase
      .from('message_reactions')
      .upsert({
        message_id: messageId,
        user_id: user.id,
        organization_id: member.organization_id,
        reaction
      }, {
        onConflict: 'message_id,user_id,reaction'
      })
      .select()
      .single()

    if (error) {
      console.error('Error adding reaction:', error)
      return NextResponse.json(
        { error: 'Failed to add reaction' },
        { status: 500 }
      )
    }

    // Emit real-time event for reaction update
    await supabase.channel('sms-reactions')
      .send({
        type: 'broadcast',
        event: 'reaction-added',
        payload: {
          messageId,
          userId: user.id,
          reaction,
          timestamp: new Date().toISOString()
        }
      })

    return NextResponse.json({
      success: true,
      reaction: reactionData
    })
  } catch (error) {
    console.error('Error in reaction POST:', error)
    return NextResponse.json(
      { error: 'Failed to add reaction' },
      { status: 500 }
    )
  }
}

// Remove a reaction from a message
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const messageId = searchParams.get('messageId')
    const reaction = searchParams.get('reaction')

    if (!messageId || !reaction) {
      return NextResponse.json(
        { error: 'Message ID and reaction are required' },
        { status: 400 }
      )
    }

    // Delete the reaction
    const { error } = await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', user.id)
      .eq('reaction', reaction)

    if (error) {
      console.error('Error removing reaction:', error)
      return NextResponse.json(
        { error: 'Failed to remove reaction' },
        { status: 500 }
      )
    }

    // Emit real-time event for reaction removal
    await supabase.channel('sms-reactions')
      .send({
        type: 'broadcast',
        event: 'reaction-removed',
        payload: {
          messageId,
          userId: user.id,
          reaction,
          timestamp: new Date().toISOString()
        }
      })

    return NextResponse.json({
      success: true
    })
  } catch (error) {
    console.error('Error in reaction DELETE:', error)
    return NextResponse.json(
      { error: 'Failed to remove reaction' },
      { status: 500 }
    )
  }
}

// Get reactions for messages
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const conversationId = searchParams.get('conversationId')

    if (!conversationId) {
      return NextResponse.json(
        { error: 'Conversation ID is required' },
        { status: 400 }
      )
    }

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id, full_name')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Get messages with reactions for the conversation
    const { data: messages, error } = await supabase
      .from('sms_messages')
      .select(`
        id,
        reaction_counts,
        message_reactions (
          id,
          user_id,
          reaction,
          created_at
        )
      `)
      .eq('conversation_id', conversationId)
      .eq('organization_id', member.organization_id)

    if (error) {
      console.error('Error fetching reactions:', error)
      return NextResponse.json(
        { error: 'Failed to fetch reactions' },
        { status: 500 }
      )
    }

    // Get user names for reactions if there are any reactions
    const userIds = new Set<string>()
    messages?.forEach(message => {
      message.message_reactions?.forEach((r: { user_id: string }) => {
        userIds.add(r.user_id)
      })
    })

    let userNameMap: Record<string, string> = {}
    if (userIds.size > 0) {
      const { data: members } = await supabase
        .from('organization_members')
        .select('user_id, full_name')
        .eq('organization_id', member.organization_id)
        .in('user_id', Array.from(userIds))

      if (members) {
        userNameMap = Object.fromEntries(
          members.map(m => [m.user_id, m.full_name || 'Unknown'])
        )
      }
    }

    // Format the response
    const formattedMessages = messages?.map(message => ({
      messageId: message.id,
      reactions: message.reaction_counts || {},
      userReactions: message.message_reactions
        ?.filter((r: { user_id: string }) => r.user_id === user.id)
        ?.map((r: { reaction: string }) => r.reaction) || [],
      reactionDetails: message.message_reactions?.map((r: { id: string; user_id: string; reaction: string; created_at: string }) => ({
        id: r.id,
        userId: r.user_id,
        reaction: r.reaction,
        userName: userNameMap[r.user_id] || 'Unknown',
        createdAt: r.created_at
      })) || []
    }))

    return NextResponse.json({
      success: true,
      reactions: formattedMessages
    })
  } catch (error) {
    console.error('Error in reaction GET:', error)
    return NextResponse.json(
      { error: 'Failed to fetch reactions' },
      { status: 500 }
    )
  }
}