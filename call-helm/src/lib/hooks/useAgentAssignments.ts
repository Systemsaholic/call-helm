import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/hooks/useAuth'

export interface AssignedContact {
  id: string
  call_list_contact_id: string
  call_list_id: string
  call_list_name: string
  contact_id: string
  full_name: string | null
  phone_number: string
  email: string | null
  company: string | null
  status: string
  priority: number | null
  total_attempts: number
  last_attempt_at: string | null
  next_attempt_at: string | null
  notes: string | null
}

export interface AgentStats {
  totalAssigned: number
  pendingCalls: number
  completedToday: number
  callsToday: number
  avgCallDuration: number
  conversionRate: number
  callbacksScheduled: number
}

export interface AgentQueueData {
  contacts: AssignedContact[]
  stats: AgentStats
  memberId: string | null
  organizationId: string | null
}

// Query keys
export const agentAssignmentKeys = {
  all: ['agentAssignments'] as const,
  queue: () => [...agentAssignmentKeys.all, 'queue'] as const,
  stats: () => [...agentAssignmentKeys.all, 'stats'] as const,
  contacts: (status?: string) => [...agentAssignmentKeys.all, 'contacts', status] as const,
}

/**
 * Hook to fetch the current agent's assigned contacts queue and stats
 */
export function useAgentQueue() {
  const { supabase, user } = useAuth()

  return useQuery<AgentQueueData>({
    queryKey: agentAssignmentKeys.queue(),
    queryFn: async () => {
      // Get the current user's member record
      const { data: member } = await supabase
        .from('organization_members')
        .select('id, organization_id, role')
        .eq('user_id', user?.id)
        .single()

      if (!member) {
        throw new Error('User not found in organization')
      }

      const today = new Date()
      today.setHours(0, 0, 0, 0)

      // Fetch assigned contacts that are pending or need callbacks
      // Note: Using separate queries instead of embedded joins to work around RLS issues
      const { data: assignedContacts, error: contactsError } = await supabase
        .from('call_list_contacts')
        .select(`
          id,
          call_list_id,
          contact_id,
          status,
          priority,
          total_attempts,
          last_attempt_at,
          next_attempt_at,
          notes
        `)
        .eq('assigned_to', member.id)
        .in('status', ['assigned', 'in_progress', 'pending'])
        .order('priority', { ascending: false, nullsFirst: false })
        .order('next_attempt_at', { ascending: true, nullsFirst: false })
        .limit(50)

      if (contactsError) throw contactsError

      // Get unique contact and call_list IDs for separate queries
      const contactIds = [...new Set((assignedContacts || []).map(c => c.contact_id).filter(Boolean))]
      const callListIds = [...new Set((assignedContacts || []).map(c => c.call_list_id).filter(Boolean))]

      // Fetch contacts separately (RLS allows agent to see assigned contacts)
      const { data: contactsData } = contactIds.length > 0
        ? await supabase
            .from('contacts')
            .select('id, full_name, first_name, last_name, phone_number, email, company')
            .in('id', contactIds)
        : { data: [] }

      // Fetch call lists separately (RLS allows org members to see org call lists)
      const { data: callListsData } = callListIds.length > 0
        ? await supabase
            .from('call_lists')
            .select('id, name')
            .in('id', callListIds)
        : { data: [] }

      // Create lookup maps
      const contactsMap = new Map((contactsData || []).map(c => [c.id, c]))
      const callListsMap = new Map((callListsData || []).map(cl => [cl.id, cl]))

      // Format contacts using the lookup maps
      const contacts: AssignedContact[] = (assignedContacts || []).map((clc: any) => {
        const contact = contactsMap.get(clc.contact_id)
        const callList = callListsMap.get(clc.call_list_id)
        return {
          id: contact?.id || clc.contact_id,
          call_list_contact_id: clc.id,
          call_list_id: clc.call_list_id,
          call_list_name: callList?.name || 'Unknown List',
          contact_id: clc.contact_id,
          full_name: contact?.full_name ||
            `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || null,
          phone_number: contact?.phone_number || '',
          email: contact?.email || null,
          company: contact?.company || null,
          status: clc.status,
          priority: clc.priority,
          total_attempts: clc.total_attempts || 0,
          last_attempt_at: clc.last_attempt_at,
          next_attempt_at: clc.next_attempt_at,
          notes: clc.notes,
        }
      })

      // Fetch today's call attempts for stats
      const { data: todayAttempts } = await supabase
        .from('call_attempts')
        .select('id, duration_seconds, disposition')
        .eq('agent_id', member.id)
        .gte('started_at', today.toISOString())

      // Fetch all-time stats
      const { data: allTimeStats } = await supabase
        .from('call_list_contacts')
        .select('id, status')
        .eq('assigned_to', member.id)

      // Fetch upcoming callbacks
      const { count: callbackCount } = await supabase
        .from('call_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('agent_id', member.id)
        .eq('callback_requested', true)
        .gte('callback_date', new Date().toISOString())

      // Calculate stats
      const callsToday = todayAttempts?.length || 0
      const completedToday = todayAttempts?.filter(a =>
        ['sale_made', 'appointment_set', 'not_interested', 'do_not_call', 'already_customer'].includes(a.disposition)
      ).length || 0

      const totalDuration = todayAttempts?.reduce((sum, a) => sum + (a.duration_seconds || 0), 0) || 0
      const avgCallDuration = callsToday > 0 ? Math.round(totalDuration / callsToday) : 0

      const conversions = todayAttempts?.filter(a =>
        ['sale_made', 'appointment_set'].includes(a.disposition)
      ).length || 0
      const conversionRate = callsToday > 0 ? Math.round((conversions / callsToday) * 100) : 0

      const stats: AgentStats = {
        totalAssigned: allTimeStats?.length || 0,
        pendingCalls: contacts.length,
        completedToday,
        callsToday,
        avgCallDuration,
        conversionRate,
        callbacksScheduled: callbackCount || 0,
      }

      return {
        contacts,
        stats,
        memberId: member.id,
        organizationId: member.organization_id,
      }
    },
    enabled: !!user,
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // Refetch every minute
  })
}

/**
 * Hook to get contacts assigned to the current agent for a specific call list
 */
export function useAgentCallListContacts(callListId: string) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: [...agentAssignmentKeys.contacts(), callListId],
    queryFn: async () => {
      // Get the current user's member record
      const { data: member } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', user?.id)
        .single()

      if (!member) return []

      const { data, error } = await supabase
        .from('call_list_contacts')
        .select(`
          id,
          status,
          priority,
          total_attempts,
          last_attempt_at,
          contact:contacts!call_list_contacts_contact_id_fkey(
            id,
            full_name,
            phone_number,
            email,
            company
          )
        `)
        .eq('call_list_id', callListId)
        .eq('assigned_to', member.id)
        .order('priority', { ascending: false, nullsFirst: false })

      if (error) throw error
      return data || []
    },
    enabled: !!user && !!callListId,
  })
}

/**
 * Hook to get contact IDs assigned to the current agent (for filtering)
 */
export function useAgentContactIds() {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: [...agentAssignmentKeys.all, 'contactIds'],
    queryFn: async () => {
      // Get the current user's member record
      const { data: member } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', user?.id)
        .single()

      if (!member) return []

      const { data, error } = await supabase
        .from('call_list_contacts')
        .select('contact_id')
        .eq('assigned_to', member.id)

      if (error) throw error

      // Return unique contact IDs
      const contactIds = [...new Set((data || []).map(d => d.contact_id))]
      return contactIds
    },
    enabled: !!user,
  })
}
