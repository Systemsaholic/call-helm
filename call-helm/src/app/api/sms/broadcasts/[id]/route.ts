import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface UpdateBroadcastRequest {
  name?: string
  messageTemplate?: string
  scheduledAt?: string | null
}

// GET - Get a specific broadcast with recipient details
export async function GET(
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

    // Get broadcast with related data
    const { data: broadcast, error } = await supabase
      .from('sms_broadcasts')
      .select(`
        *,
        phone_numbers (
          id,
          number,
          friendly_name
        ),
        campaign_registry_campaigns (
          id,
          campaign_name,
          status,
          use_case
        )
      `)
      .eq('id', id)
      .eq('organization_id', member.organization_id)
      .single()

    if (error || !broadcast) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
    }

    // Get recipient stats
    const { searchParams } = new URL(request.url)
    const includeRecipients = searchParams.get('includeRecipients') === 'true'
    const recipientStatus = searchParams.get('recipientStatus')
    const recipientLimit = parseInt(searchParams.get('recipientLimit') || '100')
    const recipientOffset = parseInt(searchParams.get('recipientOffset') || '0')

    let recipients = null
    let recipientCount = null

    if (includeRecipients) {
      let query = supabase
        .from('sms_broadcast_recipients')
        .select('*', { count: 'exact' })
        .eq('broadcast_id', id)
        .order('created_at', { ascending: true })
        .range(recipientOffset, recipientOffset + recipientLimit - 1)

      if (recipientStatus) {
        query = query.eq('status', recipientStatus)
      }

      const { data, count, error: recipientError } = await query

      if (!recipientError) {
        recipients = data
        recipientCount = count
      }
    }

    // Get status breakdown
    const { data: statusBreakdown } = await supabase
      .from('sms_broadcast_recipients')
      .select('status')
      .eq('broadcast_id', id)

    const statusCounts = statusBreakdown?.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1
      return acc
    }, {} as Record<string, number>) || {}

    return NextResponse.json({
      success: true,
      broadcast,
      recipients,
      recipientCount,
      statusBreakdown: statusCounts
    })
  } catch (error) {
    console.error('Error in broadcast GET:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Update a draft broadcast
export async function PATCH(
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

    // Get existing broadcast
    const { data: existing, error: fetchError } = await supabase
      .from('sms_broadcasts')
      .select('id, status')
      .eq('id', id)
      .eq('organization_id', member.organization_id)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
    }

    // Only allow updating draft or scheduled broadcasts
    if (!['draft', 'scheduled'].includes(existing.status)) {
      return NextResponse.json({
        error: `Cannot update a broadcast with status "${existing.status}"`,
        code: 'BROADCAST_NOT_EDITABLE'
      }, { status: 400 })
    }

    const body: UpdateBroadcastRequest = await request.json()
    const updates: Record<string, any> = { updated_at: new Date().toISOString() }

    if (body.name !== undefined) updates.name = body.name
    if (body.messageTemplate !== undefined) updates.message_template = body.messageTemplate
    if (body.scheduledAt !== undefined) {
      updates.scheduled_at = body.scheduledAt
      updates.status = body.scheduledAt ? 'scheduled' : 'draft'
    }

    const { data: broadcast, error: updateError } = await supabase
      .from('sms_broadcasts')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating broadcast:', updateError)
      return NextResponse.json({ error: 'Failed to update broadcast' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      broadcast
    })
  } catch (error) {
    console.error('Error in broadcast PATCH:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE - Delete a draft or cancelled broadcast
export async function DELETE(
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

    // Get existing broadcast
    const { data: existing } = await supabase
      .from('sms_broadcasts')
      .select('id, status')
      .eq('id', id)
      .eq('organization_id', member.organization_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Broadcast not found' }, { status: 404 })
    }

    // Only allow deleting draft, scheduled, cancelled, or failed broadcasts
    if (!['draft', 'scheduled', 'cancelled', 'failed'].includes(existing.status)) {
      return NextResponse.json({
        error: `Cannot delete a broadcast with status "${existing.status}". Cancel it first.`,
        code: 'BROADCAST_NOT_DELETABLE'
      }, { status: 400 })
    }

    // Delete broadcast (recipients will cascade delete)
    const { error: deleteError } = await supabase
      .from('sms_broadcasts')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Error deleting broadcast:', deleteError)
      return NextResponse.json({ error: 'Failed to delete broadcast' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Broadcast deleted successfully'
    })
  } catch (error) {
    console.error('Error in broadcast DELETE:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
