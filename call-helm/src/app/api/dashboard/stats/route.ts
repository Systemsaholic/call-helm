import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { apiLogger } from '@/lib/logger'

// Database result types
interface CallListContact {
  id: string
  status: string
}

// Supabase returns joined relations as arrays or single objects depending on FK constraints
interface CallRecord {
  id: string
  status: string
  created_at: string
  called_number?: string
  duration?: number
  organization_members?: { full_name: string } | null
  contacts?: { first_name?: string; last_name?: string } | null
}

interface SMSMessage {
  id: string
  direction: string
  created_at: string
  message_body?: string
  organization_members?: { full_name: string } | null
  sms_conversations?: {
    phone_number?: string
    contacts?: { first_name?: string; last_name?: string } | null
  } | null
}

// Type for raw Supabase data (before type narrowing)
interface RawCallData {
  id: unknown
  status: unknown
  created_at: unknown
  called_number?: unknown
  duration?: unknown
  organization_members?: unknown
  contacts?: unknown
}

interface RawSMSData {
  id: unknown
  direction: unknown
  created_at: unknown
  message_body?: unknown
  organization_members?: unknown
  sms_conversations?: unknown
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id, full_name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Fetch all statistics in parallel
    const [
      callStats,
      agentStats,
      campaignStats,
      recentActivity,
      smsStats
    ] = await Promise.all([
      // Call statistics
      supabase
        .from('calls')
        .select('*', { count: 'exact' })
        .eq('organization_id', member.organization_id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()),

      // Agent statistics
      supabase
        .from('organization_members')
        .select('*', { count: 'exact' })
        .eq('organization_id', member.organization_id),

      // Campaign statistics with progress
      supabase
        .from('call_lists')
        .select(`
          id,
          name,
          status,
          call_list_contacts (
            id,
            status
          )
        `)
        .eq('organization_id', member.organization_id)
        .order('created_at', { ascending: false })
        .limit(5),

      // Recent activity - fetch calls and messages separately then combine
      Promise.all([
        // Recent calls
        supabase
          .from('calls')
          .select(`
            id,
            status,
            duration,
            created_at,
            called_number,
            organization_members!calls_member_id_fkey (
              full_name
            ),
            contacts (
              first_name,
              last_name
            )
          `)
          .eq('organization_id', member.organization_id)
          .order('created_at', { ascending: false })
          .limit(5),
        
        // Recent SMS messages
        supabase
          .from('sms_messages')
          .select(`
            id,
            direction,
            message_body,
            created_at,
            sms_conversations!inner (
              organization_id,
              phone_number,
              contacts (
                first_name,
                last_name
              )
            ),
            organization_members!sms_messages_sent_by_agent_id_fkey (
              full_name
            )
          `)
          .eq('sms_conversations.organization_id', member.organization_id)
          .order('created_at', { ascending: false })
          .limit(5)
      ]),

      // SMS statistics
      supabase
        .from('sms_messages')
        .select(`
          id,
          direction,
          created_at,
          conversation_id,
          sms_conversations!inner (
            organization_id
          )
        `)
        .eq('sms_conversations.organization_id', member.organization_id)
        .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    ])

    // Process call statistics
    const calls = callStats.data || []
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    
    const callsToday = calls.filter(call => 
      new Date(call.created_at) >= todayStart
    ).length

    const answeredCalls = calls.filter(call => call.status === 'answered')
    const totalDuration = answeredCalls.reduce((sum, call) => sum + (call.duration || 0), 0)
    const avgDuration = answeredCalls.length > 0 ? Math.round(totalDuration / answeredCalls.length) : 0
    const avgDurationFormatted = `${Math.floor(avgDuration / 60)}:${(avgDuration % 60).toString().padStart(2, '0')}`

    // Calculate conversion rate (calls over 60 seconds considered "quality")
    const qualityCalls = answeredCalls.filter(call => (call.duration || 0) > 60).length
    const conversionRate = answeredCalls.length > 0 
      ? Math.round((qualityCalls / answeredCalls.length) * 100 * 10) / 10
      : 0

    // Process agent statistics
    const agents = agentStats.data || []
    const activeAgents = agents.filter(agent => agent.is_active).length

    // Process campaign statistics
    const campaigns = campaignStats.data || []
    const activeCampaigns = campaigns.filter(c => c.status === 'active').length
    
    const campaignProgress = campaigns.map(campaign => {
      const contacts = campaign.call_list_contacts || []
      const totalContacts = contacts.length
      const completedContacts = contacts.filter((c: CallListContact) => c.status === 'completed').length
      const progress = totalContacts > 0 ? Math.round((completedContacts / totalContacts) * 100) : 0
      
      return {
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        totalContacts,
        completedContacts,
        pendingContacts: totalContacts - completedContacts,
        progress
      }
    })

    // Calculate total pending contacts across all campaigns
    const pendingContacts = campaignProgress.reduce((sum, c) => sum + c.pendingContacts, 0)

    // Process recent activity - combine calls and messages
    const [callsData, messagesData] = recentActivity
    const callActivities = (callsData?.data || []).map((call: RawCallData) => {
      const orgMember = call.organization_members as { full_name?: string } | null
      const contact = call.contacts as { first_name?: string; last_name?: string } | null
      return {
        id: call.id as string,
        type: 'call' as const,
        agent: orgMember?.full_name || 'Unknown',
        action: call.status === 'answered' ? 'Completed call' :
                call.status === 'failed' ? 'Failed call' :
                call.status === 'abandoned' ? 'Abandoned call' :
                'Call attempt',
        contact: contact
          ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
          : call.called_number as string | undefined,
        time: call.created_at as string,
        status: call.status === 'answered' ? 'success' :
                call.status === 'failed' ? 'error' :
                call.status === 'abandoned' ? 'warning' : 'info',
        duration: call.duration as number | undefined
      }
    })

    const smsActivities = (messagesData?.data || []).map((msg: RawSMSData) => {
      const orgMember = msg.organization_members as { full_name?: string } | null
      const conversation = msg.sms_conversations as {
        phone_number?: string
        contacts?: { first_name?: string; last_name?: string } | null
      } | null
      const messageBody = msg.message_body as string | undefined
      return {
        id: msg.id as string,
        type: 'sms' as const,
        agent: msg.direction === 'outbound'
          ? (orgMember?.full_name || 'System')
          : 'Customer',
        action: msg.direction === 'outbound' ? 'Sent message' : 'Received message',
        contact: conversation?.contacts
          ? `${conversation.contacts.first_name || ''} ${conversation.contacts.last_name || ''}`.trim()
          : conversation?.phone_number || 'Unknown',
        time: msg.created_at as string,
        status: msg.direction === 'outbound' ? 'info' : 'success',
        messagePreview: messageBody ? messageBody.substring(0, 50) + (messageBody.length > 50 ? '...' : '') : ''
      }
    })

    // Combine and sort by time
    const activities = [...callActivities, ...smsActivities]
      .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
      .slice(0, 10) // Get top 10 most recent

    // Process SMS statistics
    const smsMessages = smsStats.data || []
    const smsToday = smsMessages.filter(msg => 
      new Date(msg.created_at) >= todayStart && msg.direction === 'outbound'
    ).length
    const totalConversations = new Set(smsMessages.map(msg => msg.conversation_id)).size

    // Calculate trends (comparing to previous period)
    const previousPeriodStart = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
    const previousPeriodEnd = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const previousPeriodCalls = calls.filter(call => {
      const callDate = new Date(call.created_at)
      return callDate >= previousPeriodStart && callDate < previousPeriodEnd
    }).length

    const callsTrend = previousPeriodCalls > 0 
      ? Math.round(((calls.length - previousPeriodCalls) / previousPeriodCalls) * 100)
      : 0

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalCalls: calls.length,
          callsToday,
          activeAgents,
          totalAgents: agents.length,
          avgDuration: avgDurationFormatted,
          avgDurationSeconds: avgDuration,
          conversionRate,
          activeCampaigns,
          pendingContacts,
          smsToday,
          totalConversations,
          callsTrend
        },
        recentActivity: activities,
        campaigns: campaignProgress.slice(0, 3), // Top 3 campaigns for dashboard
        user: {
          name: member.full_name || user.user_metadata?.full_name || 'User'
        }
      }
    })
  } catch (error) {
    apiLogger.error('Dashboard stats error', { error })
    return NextResponse.json(
      { error: 'Failed to fetch dashboard statistics' },
      { status: 500 }
    )
  }
}