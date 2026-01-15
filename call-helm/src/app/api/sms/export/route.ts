import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sms/export - Export conversations as CSV or JSON
 * Query params: format (csv, json), conversation_id (optional), date_from, date_to
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
    const format = searchParams.get('format') || 'csv'
    const conversationId = searchParams.get('conversation_id')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')

    // Build query
    let query = supabase
      .from('sms_messages')
      .select(`
        id,
        direction,
        from_number,
        to_number,
        message_body,
        status,
        created_at,
        conversation:sms_conversations!inner(
          id,
          phone_number,
          organization_id,
          contact:contacts(
            first_name,
            last_name,
            email,
            company
          )
        )
      `)
      .eq('conversation.organization_id', member.organization_id)
      .order('created_at', { ascending: true })

    if (conversationId) {
      query = query.eq('conversation_id', conversationId)
    }

    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
    }

    if (dateTo) {
      query = query.lte('created_at', dateTo + 'T23:59:59Z')
    }

    const { data, error } = await query.limit(10000)

    if (error) throw error

    if (format === 'json') {
      return NextResponse.json({
        success: true,
        exported_at: new Date().toISOString(),
        total: data?.length || 0,
        messages: data
      })
    }

    // Generate CSV
    const headers = [
      'Message ID',
      'Date',
      'Direction',
      'From',
      'To',
      'Contact Name',
      'Company',
      'Message',
      'Status'
    ]

    const rows = (data || []).map(msg => {
      // Handle nested joins - conversation is an object (with !inner), contact may be array or object
      const conversation = msg.conversation as { contact?: { first_name?: string; last_name?: string; email?: string; company?: string } | { first_name?: string; last_name?: string; email?: string; company?: string }[] } | undefined
      const contactData = conversation?.contact
      const contact = Array.isArray(contactData) ? contactData[0] : contactData
      const contactName = contact
        ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
        : ''

      return [
        msg.id,
        new Date(msg.created_at).toISOString(),
        msg.direction,
        msg.from_number,
        msg.to_number,
        contactName,
        contact?.company || '',
        `"${(msg.message_body || '').replace(/"/g, '""')}"`,
        msg.status
      ].join(',')
    })

    const csv = [headers.join(','), ...rows].join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="sms-export-${new Date().toISOString().split('T')[0]}.csv"`
      }
    })
  } catch (error) {
    console.error('Error exporting messages:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
