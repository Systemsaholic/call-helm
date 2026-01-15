import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sms/opt-outs - List opted-out contacts
 * POST /api/sms/opt-outs - Opt out a contact
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
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

    // Get opted-out conversations
    const { data: optedOut, error } = await supabase
      .from('sms_conversations')
      .select(`
        id,
        phone_number,
        is_opted_out,
        opted_out_at,
        contact:contacts(
          id,
          first_name,
          last_name,
          email,
          company
        )
      `)
      .eq('organization_id', member.organization_id)
      .eq('is_opted_out', true)
      .order('opted_out_at', { ascending: false })

    if (error) throw error

    // Get opt-out history
    const { data: history } = await supabase
      .from('sms_opt_out_history')
      .select('*')
      .eq('organization_id', member.organization_id)
      .order('created_at', { ascending: false })
      .limit(100)

    return NextResponse.json({
      success: true,
      opted_out: optedOut || [],
      history: history || [],
      total: optedOut?.length || 0
    })
  } catch (error) {
    console.error('Error fetching opt-outs:', error)
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

    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const body = await request.json()
    const { conversation_id, phone_number, action, reason } = body

    if (!action || !['opt_out', 'opt_in'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const isOptOut = action === 'opt_out'

    if (conversation_id) {
      // Update conversation
      const { data: conv, error } = await supabase
        .from('sms_conversations')
        .update({
          is_opted_out: isOptOut,
          opted_out_at: isOptOut ? new Date().toISOString() : null
        })
        .eq('id', conversation_id)
        .select('phone_number, contact_id')
        .single()

      if (error) throw error

      // Log history
      await supabase
        .from('sms_opt_out_history')
        .insert({
          organization_id: member.organization_id,
          phone_number: conv.phone_number,
          contact_id: conv.contact_id,
          action,
          reason,
          performed_by: user.id
        })

      return NextResponse.json({ success: true })
    } else if (phone_number) {
      // Update all conversations with this phone number
      const { error } = await supabase
        .from('sms_conversations')
        .update({
          is_opted_out: isOptOut,
          opted_out_at: isOptOut ? new Date().toISOString() : null
        })
        .eq('organization_id', member.organization_id)
        .eq('phone_number', phone_number)

      if (error) throw error

      // Log history
      await supabase
        .from('sms_opt_out_history')
        .insert({
          organization_id: member.organization_id,
          phone_number,
          action,
          reason,
          performed_by: user.id
        })

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'conversation_id or phone_number required' }, { status: 400 })
  } catch (error) {
    console.error('Error updating opt-out status:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
