import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export interface CallAttempt {
  id: string
  call_list_contact_id: string
  agent_id: string
  attempt_number: number
  started_at: string
  ended_at?: string
  duration_seconds?: number
  disposition: 
    | 'answered' | 'voicemail' | 'no_answer' | 'busy' | 'failed'
    | 'wrong_number' | 'disconnected' | 'do_not_call' | 'callback_requested'
    | 'sale_made' | 'appointment_set' | 'not_interested' | 'already_customer'
  disposition_notes?: string
  script_used_id?: string
  callback_requested: boolean
  callback_date?: string
  callback_notes?: string
  recording_url?: string
  recording_duration?: number
  recording_transcript?: string
  provider?: string
  provider_call_id?: string
  provider_metadata?: any
  quality_score?: number
  quality_notes?: string
  reviewed_by?: string
  reviewed_at?: string
  created_at: string
}

export interface CallSession {
  id?: string
  contact_id: string
  call_list_id: string
  call_list_contact_id: string
  agent_id: string
  contact_name: string
  contact_phone: string
  contact_company?: string
  script?: string
  previous_attempts: CallAttempt[]
  notes?: string
}

export interface CallDisposition {
  disposition: CallAttempt['disposition']
  notes?: string
  callback_requested?: boolean
  callback_date?: string
  callback_notes?: string
  duration_seconds?: number
  script_used_id?: string
}

// Query keys
export const callTrackingKeys = {
  all: ['callTracking'] as const,
  sessions: () => [...callTrackingKeys.all, 'sessions'] as const,
  session: (id: string) => [...callTrackingKeys.sessions(), id] as const,
  attempts: (contactId: string) => [...callTrackingKeys.all, 'attempts', contactId] as const,
  agentCalls: (agentId: string) => [...callTrackingKeys.all, 'agent', agentId] as const,
  stats: (agentId?: string) => [...callTrackingKeys.all, 'stats', agentId] as const,
}

// Start a call session
export function useStartCallSession() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      callListContactId,
      callListId,
    }: {
      callListContactId: string
      callListId: string
    }) => {
      // Get agent's member ID
      const { data: member } = await supabase
        .from('organization_members')
        .select('id, organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('Agent member not found')

      // Get contact details
      const { data: callListContact, error: contactError } = await supabase
        .from('call_list_contacts')
        .select(`
          *,
          contact:contacts!call_list_contacts_contact_id_fkey(
            id,
            full_name,
            phone_number,
            email,
            company,
            notes
          )
        `)
        .eq('id', callListContactId)
        .single()

      if (contactError || !callListContact) {
        throw new Error('Contact not found')
      }

      // Check if contact is assigned to this agent
      if (callListContact.assigned_to !== member.id) {
        throw new Error('Contact is not assigned to you')
      }

      // Update contact status to in_progress
      await supabase
        .from('call_list_contacts')
        .update({
          status: 'in_progress',
          last_attempt_at: new Date().toISOString(),
        })
        .eq('id', callListContactId)

      // Get previous attempts
      const { data: previousAttempts } = await supabase
        .from('call_attempts')
        .select('*')
        .eq('call_list_contact_id', callListContactId)
        .order('attempt_number', { ascending: false })

      // Get active script if available
      const { data: script } = await supabase
        .from('agent_scripts')
        .select(`
          id,
          content,
          call_list_script:call_list_scripts!agent_scripts_call_list_script_id_fkey(
            id,
            name,
            content
          )
        `)
        .eq('agent_id', member.id)
        .maybeSingle()

      // Also try to get call list script directly if no agent script
      let scriptContent = script?.content
      if (!scriptContent && callListId) {
        const { data: callListScript } = await supabase
          .from('call_list_scripts')
          .select('content')
          .eq('call_list_id', callListId)
          .maybeSingle()
        
        scriptContent = callListScript?.content
      }

      const session: CallSession = {
        contact_id: callListContact.contact.id,
        call_list_id: callListId,
        call_list_contact_id: callListContactId,
        agent_id: member.id,
        contact_name: callListContact.contact.full_name,
        contact_phone: callListContact.contact.phone_number,
        contact_company: callListContact.contact.company,
        script: scriptContent,
        previous_attempts: previousAttempts || [],
        notes: callListContact.contact.notes,
      }

      // Store session in local storage for persistence
      localStorage.setItem('active_call_session', JSON.stringify(session))

      return session
    },
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: callTrackingKeys.sessions() })
      toast.success(`Call session started with ${session.contact_name}`)
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to start call session')
    },
  })
}

// End call and record disposition
export function useEndCallSession() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      session,
      disposition,
    }: {
      session: CallSession
      disposition: CallDisposition
    }) => {
      // Get agent's member ID
      const { data: member } = await supabase
        .from('organization_members')
        .select('id, organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('Agent member not found')

      // Calculate attempt number
      const attemptNumber = (session.previous_attempts?.length || 0) + 1

      // Create call attempt record
      const { data: attempt, error: attemptError } = await supabase
        .from('call_attempts')
        .insert({
          call_list_contact_id: session.call_list_contact_id,
          agent_id: member.id,
          attempt_number: attemptNumber,
          started_at: new Date(Date.now() - (disposition.duration_seconds || 0) * 1000).toISOString(),
          ended_at: new Date().toISOString(),
          duration_seconds: disposition.duration_seconds || 0,
          disposition: disposition.disposition,
          disposition_notes: disposition.notes,
          script_used_id: disposition.script_used_id,
          callback_requested: disposition.callback_requested || false,
          callback_date: disposition.callback_date,
          callback_notes: disposition.callback_notes,
        })
        .select()
        .single()

      if (attemptError) throw attemptError

      // Update call list contact status based on disposition
      let newStatus = 'in_progress'
      if (['sale_made', 'appointment_set', 'not_interested', 'already_customer', 'do_not_call'].includes(disposition.disposition)) {
        newStatus = 'completed'
      } else if (disposition.disposition === 'wrong_number' || disposition.disposition === 'disconnected') {
        newStatus = 'failed'
      }

      await supabase
        .from('call_list_contacts')
        .update({
          status: newStatus,
          last_attempt_at: new Date().toISOString(),
          total_attempts: attemptNumber,
          final_disposition: disposition.disposition,
          outcome_notes: disposition.notes,
          completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', session.call_list_contact_id)

      // Update contact status if needed
      if (disposition.disposition === 'do_not_call') {
        await supabase
          .from('contacts')
          .update({
            status: 'do_not_call',
            do_not_call_reason: disposition.notes || 'Requested during call',
          })
          .eq('id', session.contact_id)
      }

      // Log to contact history
      await supabase
        .from('contact_history')
        .insert({
          contact_id: session.contact_id,
          organization_id: member.organization_id,
          event_type: 'call',
          event_data: {
            disposition: disposition.disposition,
            duration: disposition.duration_seconds,
            notes: disposition.notes,
            attempt_number: attemptNumber,
          },
          call_list_id: session.call_list_id,
          agent_id: member.id,
          call_attempt_id: attempt.id,
        })

      // Clear session from local storage
      localStorage.removeItem('active_call_session')

      // Update usage counter for minutes
      if (disposition.duration_seconds) {
        await supabase.rpc('update_usage_counter', {
          p_organization_id: member.organization_id,
          p_resource: 'minutes',
          p_delta: Math.ceil(disposition.duration_seconds / 60),
        })
      }

      return attempt
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: callTrackingKeys.sessions() })
      queryClient.invalidateQueries({ queryKey: callTrackingKeys.agentCalls(user?.id || '') })
      toast.success('Call recorded successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to record call')
    },
  })
}

// Get active call session
export function useActiveCallSession() {
  return useQuery({
    queryKey: callTrackingKeys.session('active'),
    queryFn: () => {
      const sessionData = localStorage.getItem('active_call_session')
      if (!sessionData) return null
      return JSON.parse(sessionData) as CallSession
    },
    refetchInterval: false,
  })
}

// Get call attempts for a contact
export function useCallAttempts(callListContactId: string) {
  const { supabase } = useAuth()

  return useQuery({
    queryKey: callTrackingKeys.attempts(callListContactId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_attempts')
        .select(`
          *,
          agent:organization_members!call_attempts_agent_id_fkey(
            id,
            full_name,
            email
          )
        `)
        .eq('call_list_contact_id', callListContactId)
        .order('attempt_number', { ascending: false })

      if (error) throw error
      return data as CallAttempt[]
    },
    enabled: !!callListContactId,
  })
}

// Get agent's call statistics
export function useAgentCallStats(agentId?: string, dateRange?: { start: Date; end: Date }) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: callTrackingKeys.stats(agentId),
    queryFn: async () => {
      // Get agent's member ID if not provided
      let memberId = agentId
      if (!memberId) {
        const { data: member } = await supabase
          .from('organization_members')
          .select('id')
          .eq('user_id', user?.id)
          .single()
        
        if (member) memberId = member.id
      }

      if (!memberId) throw new Error('Agent not found')

      let query = supabase
        .from('call_attempts')
        .select('*')
        .eq('agent_id', memberId)

      if (dateRange) {
        query = query
          .gte('started_at', dateRange.start.toISOString())
          .lte('started_at', dateRange.end.toISOString())
      }

      const { data: attempts, error } = await query

      if (error) throw error

      // Calculate statistics
      const stats = {
        totalCalls: attempts?.length || 0,
        totalDuration: attempts?.reduce((sum, a) => sum + (a.duration_seconds || 0), 0) || 0,
        averageDuration: 0,
        dispositions: {} as Record<string, number>,
        callsByHour: {} as Record<number, number>,
        callsByDay: {} as Record<string, number>,
        conversionRate: 0,
        callbacksScheduled: 0,
      }

      if (attempts && attempts.length > 0) {
        stats.averageDuration = Math.round(stats.totalDuration / attempts.length)

        // Count dispositions
        attempts.forEach(attempt => {
          stats.dispositions[attempt.disposition] = (stats.dispositions[attempt.disposition] || 0) + 1
          
          // Calls by hour
          const hour = new Date(attempt.started_at).getHours()
          stats.callsByHour[hour] = (stats.callsByHour[hour] || 0) + 1

          // Calls by day
          const day = new Date(attempt.started_at).toLocaleDateString()
          stats.callsByDay[day] = (stats.callsByDay[day] || 0) + 1

          // Callbacks
          if (attempt.callback_requested) {
            stats.callbacksScheduled++
          }
        })

        // Calculate conversion rate
        const conversions = (stats.dispositions['sale_made'] || 0) + (stats.dispositions['appointment_set'] || 0)
        stats.conversionRate = Math.round((conversions / attempts.length) * 100)
      }

      return stats
    },
    enabled: !!user,
  })
}

// Schedule a callback
export function useScheduleCallback() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      callListContactId,
      callbackDate,
      notes,
    }: {
      callListContactId: string
      callbackDate: string
      notes?: string
    }) => {
      // Get agent's member ID
      const { data: member } = await supabase
        .from('organization_members')
        .select('id, organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('Agent member not found')

      // Create a pending call attempt for the callback
      const { data, error } = await supabase
        .from('call_attempts')
        .insert({
          call_list_contact_id: callListContactId,
          agent_id: member.id,
          attempt_number: 0, // Will be updated when the call is made
          started_at: callbackDate,
          disposition: 'callback_requested',
          callback_requested: true,
          callback_date: callbackDate,
          callback_notes: notes,
        })
        .select()
        .single()

      if (error) throw error

      // Update call list contact
      await supabase
        .from('call_list_contacts')
        .update({
          status: 'assigned',
          notes: notes ? `Callback scheduled: ${notes}` : 'Callback scheduled',
        })
        .eq('id', callListContactId)

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: callTrackingKeys.agentCalls(user?.id || '') })
      toast.success('Callback scheduled successfully')
    },
    onError: (error: any) => {
      toast.error(error.message || 'Failed to schedule callback')
    },
  })
}

// Get upcoming callbacks
export function useUpcomingCallbacks() {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: ['upcomingCallbacks'],
    queryFn: async () => {
      // Get agent's member ID
      const { data: member } = await supabase
        .from('organization_members')
        .select('id, organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) return []

      const { data, error } = await supabase
        .from('call_attempts')
        .select(`
          *,
          call_list_contact:call_list_contacts!call_attempts_call_list_contact_id_fkey(
            id,
            contact:contacts!call_list_contacts_contact_id_fkey(
              id,
              full_name,
              phone_number,
              company
            )
          )
        `)
        .eq('agent_id', member.id)
        .eq('callback_requested', true)
        .gte('callback_date', new Date().toISOString())
        .order('callback_date', { ascending: true })

      if (error) throw error
      return data || []
    },
    enabled: !!user,
  })
}