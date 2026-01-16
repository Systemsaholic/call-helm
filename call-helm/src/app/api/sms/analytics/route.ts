import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { smsLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/sms/analytics - Get SMS analytics
 * Query params: period (7d, 30d, 90d), start_date, end_date
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
    const period = searchParams.get('period') || '30d'
    let startDate = searchParams.get('start_date')
    let endDate = searchParams.get('end_date')

    // Calculate date range based on period if not provided
    if (!startDate || !endDate) {
      const now = new Date()
      endDate = now.toISOString().split('T')[0]

      const days = period === '7d' ? 7 : period === '90d' ? 90 : 30
      const start = new Date(now)
      start.setDate(start.getDate() - days)
      startDate = start.toISOString().split('T')[0]
    }

    // Get daily analytics
    const { data: dailyStats, error: dailyError } = await supabase
      .from('sms_analytics_daily')
      .select('*')
      .eq('organization_id', member.organization_id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })

    if (dailyError) throw dailyError

    // Calculate totals
    const totals = (dailyStats || []).reduce((acc, day) => ({
      messages_sent: acc.messages_sent + (day.messages_sent || 0),
      messages_received: acc.messages_received + (day.messages_received || 0),
      messages_failed: acc.messages_failed + (day.messages_failed || 0),
      opt_outs: acc.opt_outs + (day.opt_outs || 0),
      segments_used: acc.segments_used + (day.segments_used || 0)
    }), {
      messages_sent: 0,
      messages_received: 0,
      messages_failed: 0,
      opt_outs: 0,
      segments_used: 0
    })

    // Get conversation stats
    const { count: totalConversations } = await supabase
      .from('sms_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', member.organization_id)

    const { count: activeConversations } = await supabase
      .from('sms_conversations')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', member.organization_id)
      .neq('status', 'archived')

    // Get messages by agent (top 5)
    const { data: agentStats } = await supabase
      .from('sms_messages')
      .select(`
        created_by,
        conversation:sms_conversations!inner(organization_id)
      `)
      .eq('conversation.organization_id', member.organization_id)
      .eq('direction', 'outbound')
      .gte('created_at', startDate)
      .lte('created_at', endDate + 'T23:59:59Z')

    // Aggregate by agent
    const agentCounts: Record<string, number> = {}
    agentStats?.forEach(msg => {
      if (msg.created_by) {
        agentCounts[msg.created_by] = (agentCounts[msg.created_by] || 0) + 1
      }
    })

    return NextResponse.json({
      success: true,
      analytics: {
        period: { start: startDate, end: endDate },
        totals,
        daily: dailyStats || [],
        conversations: {
          total: totalConversations || 0,
          active: activeConversations || 0
        },
        delivery_rate: totals.messages_sent > 0
          ? ((totals.messages_sent - totals.messages_failed) / totals.messages_sent * 100).toFixed(1)
          : 100,
        response_rate: totals.messages_sent > 0 && totals.messages_received > 0
          ? (totals.messages_received / totals.messages_sent * 100).toFixed(1)
          : 0
      }
    })
  } catch (error) {
    smsLogger.error('Error fetching SMS analytics', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
