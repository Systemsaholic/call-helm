import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sms/scheduled/[id] - Get a specific scheduled message
 * PATCH /api/sms/scheduled/[id] - Update a scheduled message
 * DELETE /api/sms/scheduled/[id] - Cancel a scheduled message
 */
export async function GET(
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

    const { data, error } = await supabase
      .from('scheduled_sms_messages')
      .select('*')
      .eq('id', id)
      .single()

    if (error) throw error
    if (!data) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, scheduled: data })
  } catch (error) {
    console.error('Error fetching scheduled message:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
    const { message_body, scheduled_at, timezone, status } = body

    // Only allow updating pending messages
    const { data: existing } = await supabase
      .from('scheduled_sms_messages')
      .select('status')
      .eq('id', id)
      .single()

    if (existing?.status !== 'pending') {
      return NextResponse.json({ error: 'Can only update pending messages' }, { status: 400 })
    }

    const updates: Record<string, any> = { updated_at: new Date().toISOString() }
    if (message_body) updates.message_body = message_body
    if (scheduled_at) updates.scheduled_at = scheduled_at
    if (timezone) updates.timezone = timezone
    if (status === 'cancelled') updates.status = 'cancelled'

    const { data, error } = await supabase
      .from('scheduled_sms_messages')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, scheduled: data })
  } catch (error) {
    console.error('Error updating scheduled message:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
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

    // Cancel instead of delete for audit trail
    const { error } = await supabase
      .from('scheduled_sms_messages')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error cancelling scheduled message:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
