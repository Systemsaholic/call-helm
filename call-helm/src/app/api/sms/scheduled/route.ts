import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

interface ScheduledMessage {
  id: string
  conversation_id: string | null
  contact_id: string | null
  to_number: string
  from_number: string | null
  message_body: string
  media_urls: string[] | null
  scheduled_at: string
  timezone: string
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  created_by: string | null
  sent_at: string | null
  error_message: string | null
  created_at: string
}

/**
 * GET /api/sms/scheduled - List scheduled messages
 * POST /api/sms/scheduled - Create a scheduled message
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

    const searchParams = request.nextUrl.searchParams
    const status = searchParams.get('status')

    let query = supabase
      .from('scheduled_sms_messages')
      .select('*')
      .eq('organization_id', member.organization_id)
      .order('scheduled_at', { ascending: true })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json({ success: true, scheduled: data })
  } catch (error) {
    console.error('Error fetching scheduled messages:', error)
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
    const { to_number, message_body, scheduled_at, timezone, conversation_id, contact_id, media_urls } = body

    if (!to_number || !message_body || !scheduled_at) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Validate scheduled_at is in the future
    const scheduledDate = new Date(scheduled_at)
    if (scheduledDate <= new Date()) {
      return NextResponse.json({ error: 'Scheduled time must be in the future' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('scheduled_sms_messages')
      .insert({
        organization_id: member.organization_id,
        to_number,
        message_body,
        scheduled_at,
        timezone: timezone || 'UTC',
        conversation_id,
        contact_id,
        media_urls,
        created_by: user.id,
        status: 'pending'
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, scheduled: data })
  } catch (error) {
    console.error('Error creating scheduled message:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
