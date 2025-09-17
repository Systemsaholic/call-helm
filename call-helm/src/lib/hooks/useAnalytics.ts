import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { subDays, format, startOfDay, endOfDay } from 'date-fns'

export interface AnalyticsFilters {
  dateRange: string
  campaign?: string
  agent?: string
}

export interface OrganizationAnalytics {
  // KPIs
  totalCalls: number
  callsChange: number
  conversionRate: number
  conversionChange: number
  avgCallDuration: number
  durationChange: number
  activeAgents: number
  
  // Charts data
  callVolumeTrend: Array<{ date: string; calls: number }>
  callOutcomes: Array<{ name: string; value: number }>
  hourlyDistribution: Array<{ hour: string; calls: number }>
  conversionFunnel: Array<{ name: string; value: number; percentage: number }>
  successMetrics: Array<{ date: string; conversionRate: number; answerRate: number }>
  agentPerformance: Array<{
    name: string
    email: string
    totalCalls: number
    answered: number
    avgDuration: number
    conversionRate: number
    performance: number
  }>
  campaignPerformance: Array<{
    name: string
    contacts: number
    completed: number
    successful: number
  }>
}

export function useOrganizationAnalytics(filters: AnalyticsFilters) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: ['analytics', filters],
    queryFn: async () => {
      // Get user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .single()

      if (!member?.organization_id) return null

      // Calculate date range
      let startDate: Date
      let endDate = new Date()
      
      switch (filters.dateRange) {
        case 'today':
          startDate = startOfDay(new Date())
          break
        case '7days':
          startDate = subDays(new Date(), 7)
          break
        case '30days':
          startDate = subDays(new Date(), 30)
          break
        case '90days':
          startDate = subDays(new Date(), 90)
          break
        default:
          startDate = subDays(new Date(), 7)
      }

      // Fetch calls data
      const { data: calls } = await supabase
        .from('calls')
        .select('*')
        .eq('organization_id', member.organization_id)
        .gte('start_time', startDate.toISOString())
        .lte('start_time', endDate.toISOString())

      // Fetch call list data
      const { data: callLists } = await supabase
        .from('call_lists')
        .select(`
          *,
          call_list_contacts(*)
        `)
        .eq('organization_id', member.organization_id)

      // Fetch agent data
      const { data: agents } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', member.organization_id)
        .eq('is_active', true)

      // Calculate KPIs
      const totalCalls = calls?.length || 0
      const answeredCalls = calls?.filter(c => c.status === 'answered').length || 0
      const successfulCalls = calls?.filter(c => 
        c.disposition === 'sale_made' || c.disposition === 'appointment_set'
      ).length || 0
      
      const conversionRate = totalCalls > 0 
        ? Math.round((successfulCalls / totalCalls) * 100) 
        : 0

      const avgCallDuration = calls && calls.length > 0
        ? Math.round(calls.reduce((sum, c) => sum + (c.duration || 0), 0) / calls.length)
        : 0

      // Generate trend data
      const callVolumeTrend = generateCallVolumeTrend(calls || [], startDate, endDate)
      const hourlyDistribution = generateHourlyDistribution(calls || [])
      
      // Call outcomes pie chart
      const callOutcomes = [
        { name: 'Answered', value: answeredCalls },
        { name: 'Voicemail', value: calls?.filter(c => c.status === 'voicemail').length || 0 },
        { name: 'No Answer', value: calls?.filter(c => c.status === 'no_answer').length || 0 },
        { name: 'Busy', value: calls?.filter(c => c.status === 'busy').length || 0 },
        { name: 'Failed', value: calls?.filter(c => c.status === 'failed').length || 0 }
      ].filter(outcome => outcome.value > 0)

      // Conversion funnel
      const totalContacts = callLists?.reduce((sum, list) => 
        sum + (list.call_list_contacts?.length || 0), 0
      ) || 0
      
      const assignedContacts = callLists?.reduce((sum, list) => 
        sum + (list.call_list_contacts?.filter((c: any) => c.status === 'assigned').length || 0), 0
      ) || 0
      
      const completedContacts = callLists?.reduce((sum, list) => 
        sum + (list.call_list_contacts?.filter((c: any) => c.status === 'completed').length || 0), 0
      ) || 0

      const conversionFunnel = [
        { name: 'Total Contacts', value: totalContacts, percentage: 100 },
        { name: 'Assigned', value: assignedContacts, percentage: totalContacts > 0 ? Math.round((assignedContacts / totalContacts) * 100) : 0 },
        { name: 'Called', value: totalCalls, percentage: totalContacts > 0 ? Math.round((totalCalls / totalContacts) * 100) : 0 },
        { name: 'Answered', value: answeredCalls, percentage: totalContacts > 0 ? Math.round((answeredCalls / totalContacts) * 100) : 0 },
        { name: 'Converted', value: successfulCalls, percentage: totalContacts > 0 ? Math.round((successfulCalls / totalContacts) * 100) : 0 }
      ]

      // Agent performance
      const agentPerformance = agents?.map(agent => {
        const agentCalls = calls?.filter(c => c.agent_id === agent.user_id) || []
        const agentAnswered = agentCalls.filter(c => c.status === 'answered').length
        const agentSuccessful = agentCalls.filter(c => 
          c.disposition === 'sale_made' || c.disposition === 'appointment_set'
        ).length
        
        return {
          name: agent.full_name || agent.email,
          email: agent.email,
          totalCalls: agentCalls.length,
          answered: agentAnswered,
          avgDuration: agentCalls.length > 0 
            ? Math.round(agentCalls.reduce((sum, c) => sum + (c.duration || 0), 0) / agentCalls.length)
            : 0,
          conversionRate: agentCalls.length > 0 
            ? Math.round((agentSuccessful / agentCalls.length) * 100)
            : 0,
          performance: agentCalls.length > 0 
            ? Math.min(100, Math.round((agentSuccessful / agentCalls.length) * 500))
            : 0
        }
      }).filter(a => a.totalCalls > 0) || []

      // Campaign performance
      const campaignPerformance = callLists?.map(list => ({
        name: list.name,
        contacts: list.call_list_contacts?.length || 0,
        completed: list.call_list_contacts?.filter((c: any) => c.status === 'completed').length || 0,
        successful: list.call_list_contacts?.filter((c: any) => c.final_disposition === 'sale_made' || c.final_disposition === 'appointment_set').length || 0
      })).filter(c => c.contacts > 0) || []

      // Success metrics over time
      const successMetrics = generateSuccessMetrics(calls || [], startDate, endDate)

      return {
        totalCalls,
        callsChange: 5, // Mock data - would calculate from previous period
        conversionRate,
        conversionChange: 2, // Mock data
        avgCallDuration,
        durationChange: -3, // Mock data
        activeAgents: agents?.filter(a => a.role === 'agent').length || 0,
        callVolumeTrend,
        callOutcomes,
        hourlyDistribution,
        conversionFunnel,
        successMetrics,
        agentPerformance,
        campaignPerformance
      } as OrganizationAnalytics
    },
    enabled: !!user
  })
}

// Helper functions
function generateCallVolumeTrend(calls: any[], startDate: Date, endDate: Date) {
  const trend: { date: string; calls: number }[] = []
  const current = new Date(startDate)
  
  while (current <= endDate) {
    const dayStart = startOfDay(current)
    const dayEnd = endOfDay(current)
    
    const dayCalls = calls.filter(c => {
      const callDate = new Date(c.start_time)
      return callDate >= dayStart && callDate <= dayEnd
    })
    
    trend.push({
      date: format(current, 'MMM d'),
      calls: dayCalls.length
    })
    
    current.setDate(current.getDate() + 1)
  }
  
  return trend
}

function generateHourlyDistribution(calls: any[]) {
  const hours = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i}:00`,
    calls: 0
  }))
  
  calls.forEach(call => {
    const hour = new Date(call.start_time).getHours()
    hours[hour].calls++
  })
  
  return hours.filter(h => h.calls > 0)
}

function generateSuccessMetrics(calls: any[], startDate: Date, endDate: Date) {
  const metrics: { date: string; conversionRate: number; answerRate: number }[] = []
  const current = new Date(startDate)
  
  while (current <= endDate) {
    const dayStart = startOfDay(current)
    const dayEnd = endOfDay(current)
    
    const dayCalls = calls.filter(c => {
      const callDate = new Date(c.start_time)
      return callDate >= dayStart && callDate <= dayEnd
    })
    
    const answered = dayCalls.filter(c => c.status === 'answered').length
    const successful = dayCalls.filter(c => 
      c.disposition === 'sale_made' || c.disposition === 'appointment_set'
    ).length
    
    metrics.push({
      date: format(current, 'MMM d'),
      conversionRate: dayCalls.length > 0 ? Math.round((successful / dayCalls.length) * 100) : 0,
      answerRate: dayCalls.length > 0 ? Math.round((answered / dayCalls.length) * 100) : 0
    })
    
    current.setDate(current.getDate() + 1)
  }
  
  return metrics
}