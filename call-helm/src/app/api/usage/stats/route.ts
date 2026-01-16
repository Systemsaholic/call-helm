import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { billingLogger } from '@/lib/logger'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    const { searchParams } = new URL(request.url)
    const period = searchParams.get('period') // month, week, day
    const startDate = searchParams.get('start_date')
    const endDate = searchParams.get('end_date')

    // Calculate date range
    let periodStart: string
    let periodEnd: string

    if (startDate && endDate) {
      periodStart = startDate
      periodEnd = endDate
    } else {
      const now = new Date()
      
      switch (period) {
        case 'week':
          const weekStart = new Date(now)
          weekStart.setDate(now.getDate() - now.getDay()) // Start of week
          weekStart.setHours(0, 0, 0, 0)
          periodStart = weekStart.toISOString().split('T')[0]
          
          const weekEnd = new Date(weekStart)
          weekEnd.setDate(weekStart.getDate() + 6)
          weekEnd.setHours(23, 59, 59, 999)
          periodEnd = weekEnd.toISOString().split('T')[0]
          break
          
        case 'day':
          periodStart = now.toISOString().split('T')[0]
          periodEnd = periodStart
          break
          
        case 'month':
        default:
          periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
          periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
          break
      }
    }

    // Get usage statistics using the database function
    const { data: usageStats, error: statsError } = await supabase
      .rpc('get_usage_stats', {
        p_org_id: member.organization_id,
        p_period_start: periodStart,
        p_period_end: periodEnd
      })

    if (statsError) {
      billingLogger.error('Error fetching usage stats', { error: statsError })
      return NextResponse.json({ error: 'Failed to fetch usage statistics' }, { status: 500 })
    }

    // Get detailed usage events for the period
    const { data: usageEvents, error: eventsError } = await supabase
      .from('usage_events')
      .select(`
        id,
        resource_type,
        amount,
        unit_cost,
        total_cost,
        description,
        created_at,
        campaign:call_lists(id, name),
        agent:organization_members(id, full_name, email),
        contact:contacts(id, first_name, last_name, phone_number)
      `)
      .eq('organization_id', member.organization_id)
      .gte('created_at', periodStart)
      .lte('created_at', periodEnd + 'T23:59:59.999Z')
      .order('created_at', { ascending: false })
      .limit(100) // Limit to most recent 100 events

    if (eventsError) {
      billingLogger.error('Error fetching usage events', { error: eventsError })
    }

    // Calculate totals and trends
    const totals = {
      llm_tokens: 0,
      analytics_tokens: 0,
      call_minutes: 0,
      sms_messages: 0,
      total_cost: 0
    }

    const dailyBreakdown: Record<string, typeof totals> = {}

    usageEvents?.forEach(event => {
      const date = event.created_at.split('T')[0]
      
      // Add to totals
      if (event.resource_type in totals) {
        totals[event.resource_type as keyof typeof totals] += event.amount
      }
      totals.total_cost += event.total_cost

      // Add to daily breakdown
      if (!dailyBreakdown[date]) {
        dailyBreakdown[date] = {
          llm_tokens: 0,
          analytics_tokens: 0,
          call_minutes: 0,
          sms_messages: 0,
          total_cost: 0
        }
      }
      
      if (event.resource_type in dailyBreakdown[date]) {
        dailyBreakdown[date][event.resource_type as keyof typeof totals] += event.amount
      }
      dailyBreakdown[date].total_cost += event.total_cost
    })

    // Get organization subscription info
    const { data: organization } = await supabase
      .from('organizations')
      .select('subscription_tier, balance')
      .eq('id', member.organization_id)
      .single()

    return NextResponse.json({
      success: true,
      period: { start: periodStart, end: periodEnd },
      subscription: {
        tier: organization?.subscription_tier || 'starter',
        balance: organization?.balance || 0
      },
      usage_stats: usageStats || [],
      totals,
      daily_breakdown: dailyBreakdown,
      recent_events: usageEvents?.slice(0, 20) || [], // Most recent 20
      total_events: usageEvents?.length || 0
    })

  } catch (error) {
    billingLogger.error('Usage stats error', { error })
    return NextResponse.json({
      error: 'Failed to fetch usage statistics'
    }, { status: 500 })
  }
}

// Get usage for a specific resource type
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { resource_type, campaign_id, agent_id } = body

    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    let query = supabase
      .from('usage_events')
      .select(`
        id,
        resource_type,
        amount,
        unit_cost,
        total_cost,
        description,
        created_at,
        metadata,
        campaign:call_lists(id, name),
        agent:organization_members(id, full_name, email)
      `)
      .eq('organization_id', member.organization_id)
      .order('created_at', { ascending: false })

    if (resource_type) {
      query = query.eq('resource_type', resource_type)
    }

    if (campaign_id) {
      query = query.eq('campaign_id', campaign_id)
    }

    if (agent_id) {
      query = query.eq('agent_id', agent_id)
    }

    const { data: events, error } = await query.limit(100)

    if (error) {
      billingLogger.error('Error fetching usage events', { error })
      return NextResponse.json({ error: 'Failed to fetch usage events' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      events: events || [],
      filters: { resource_type, campaign_id, agent_id }
    })

  } catch (error) {
    billingLogger.error('Usage events error', { error })
    return NextResponse.json({
      error: 'Failed to fetch usage events'
    }, { status: 500 })
  }
}