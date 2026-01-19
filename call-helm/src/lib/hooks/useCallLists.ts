import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

export interface CallList {
  id: string
  organization_id: string
  name: string
  description?: string
  campaign_type?: string
  distribution_strategy: 'manual' | 'round_robin' | 'load_based' | 'skill_based'
  distribution_config?: Record<string, string | number | boolean | string[]>
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
  priority: number
  start_date?: string
  end_date?: string
  daily_start_time?: string
  daily_end_time?: string
  calling_hours_start?: string
  calling_hours_end?: string
  timezone: string
  active_days: number[]
  target_contacts?: number
  target_completions?: number
  target_conversion_rate?: number
  max_attempts_per_contact: number
  max_contacts_per_agent?: number
  hours_between_attempts: number
  allow_voicemail: boolean
  require_disposition: boolean
  script_template?: string
  keywords?: string[]
  call_goals?: string[]
  custom_dispositions?: Array<{ label: string; value: string; color?: string }>
  announce_recording?: boolean
  recording_announcement_url?: string
  created_at: string
  created_by?: string
  updated_at: string
  archived_at?: string
  // Relations
  total_contacts?: number
  assigned_contacts?: number
  completed_contacts?: number
  successful_contacts?: number
  active_agents?: number
  total_attempts?: number
  total_duration?: number
}

export interface CallListInput {
  name: string
  description?: string
  campaign_type?: string
  distribution_strategy: 'manual' | 'round_robin' | 'load_based' | 'skill_based'
  distribution_config?: Record<string, string | number | boolean | string[]>
  status?: 'draft' | 'active' | 'paused'
  priority?: number
  start_date?: string
  end_date?: string
  daily_start_time?: string
  daily_end_time?: string
  calling_hours_start?: string
  calling_hours_end?: string
  timezone?: string
  active_days?: number[]
  target_contacts?: number
  target_completions?: number
  target_conversion_rate?: number
  max_attempts_per_contact?: number
  hours_between_attempts?: number
  allow_voicemail?: boolean
  require_disposition?: boolean
  tags?: string[]
  script_template?: string
  contact_ids?: string[]
  custom_dispositions?: Array<{ label: string; value: string; color?: string }> | null
  announce_recording?: boolean
  recording_announcement_url?: string
}

export interface CallListContact {
  id: string
  call_list_id: string
  contact_id: string
  assigned_to?: string
  status: 'pending' | 'assigned' | 'in_progress' | 'completed' | 'skipped' | 'failed'
  priority: number
  sequence_number?: number
  assignment_method?: string
  assigned_at?: string
  first_attempt_at?: string
  last_attempt_at?: string
  completed_at?: string
  total_attempts: number
  final_disposition?: string
  outcome_notes?: string
  // Relations
  contact?: {
    id: string
    full_name: string
    phone_number: string
    email?: string
    company?: string
    status: string
  }
  assigned_agent?: {
    id: string
    full_name: string
    email: string
  }
}

export interface AssignmentStrategy {
  strategy: 'manual' | 'round_robin' | 'load_based' | 'skill_based'
  agentIds?: string[]
  maxContactsPerAgent?: number
  skillRequirements?: string[]
  loadBalanceConfig?: {
    considerExisting?: boolean
    dailyLimit?: number
    weightByPerformance?: boolean
  }
}

// Query keys
export interface CallListFilters {
  status?: string
  searchTerm?: string
  assignedToMe?: boolean
}

export const callListKeys = {
  all: ['callLists'] as const,
  lists: () => [...callListKeys.all, 'list'] as const,
  list: (filters?: CallListFilters) => [...callListKeys.lists(), filters] as const,
  detail: (id: string) => [...callListKeys.all, 'detail', id] as const,
  contacts: (id: string) => [...callListKeys.all, 'contacts', id] as const,
  assignments: (id: string) => [...callListKeys.all, 'assignments', id] as const,
  stats: (id: string) => [...callListKeys.all, 'stats', id] as const,
}

// Fetch call lists
export function useCallLists(filters?: CallListFilters) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: callListKeys.list(filters),
    queryFn: async () => {
      let query = supabase
        .from('call_lists')
        .select(`
          *,
          call_list_contacts(count)
        `)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }

      if (filters?.searchTerm) {
        query = query.or(`name.ilike.%${filters.searchTerm}%,description.ilike.%${filters.searchTerm}%`)
      }

      const { data, error } = await query

      if (error) throw error

      // Process the data to include counts
      const processedData = data?.map(list => ({
        ...list,
        total_contacts: list.call_list_contacts?.[0]?.count || 0,
      }))

      return processedData as CallList[]
    },
    enabled: !!user,
  })
}

// Fetch single call list
export function useCallList(callListId: string) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: callListKeys.detail(callListId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_lists')
        .select(`
          *,
          created_by_member:organization_members!call_lists_created_by_fkey(
            id,
            full_name,
            email
          )
        `)
        .eq('id', callListId)
        .single()

      if (error) throw error

      // Get statistics
      const { data: stats } = await supabase
        .from('call_list_contacts')
        .select('status')
        .eq('call_list_id', callListId)

      if (stats) {
        data.total_contacts = stats.length
        data.assigned_contacts = stats.filter(s => s.status === 'assigned' || s.status === 'in_progress').length
        data.completed_contacts = stats.filter(s => s.status === 'completed').length
      }

      return data as CallList
    },
    enabled: !!user && !!callListId,
  })
}

// Create call list
export function useCreateCallList() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CallListInput) => {
      // Get user's member ID
      const { data: member } = await supabase
        .from('organization_members')
        .select('id, organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('No organization found')

      // Check quota
      const canAdd = await supabase.rpc('check_quota', {
        p_organization_id: member.organization_id,
        p_resource: 'call_lists',
        p_count: 1
      })

      if (!canAdd) {
        throw new Error('Call list limit reached for your plan. Please upgrade to add more call lists.')
      }

      // Extract contact_ids and tags before creating call list
      const { contact_ids, tags, script_template, ...callListData } = input

      // Create call list
      const { data, error } = await supabase
        .from('call_lists')
        .insert({
          organization_id: member.organization_id,
          name: callListData.name,
          description: callListData.description,
          campaign_type: callListData.campaign_type,
          distribution_strategy: callListData.distribution_strategy || 'manual',
          distribution_config: callListData.distribution_config || {},
          status: callListData.status || 'draft',
          priority: callListData.priority || 0,
          start_date: callListData.start_date,
          end_date: callListData.end_date,
          daily_start_time: callListData.daily_start_time,
          daily_end_time: callListData.daily_end_time,
          timezone: callListData.timezone || 'America/New_York',
          active_days: callListData.active_days || [1, 2, 3, 4, 5],
          target_contacts: callListData.target_contacts,
          target_completions: callListData.target_completions,
          target_conversion_rate: callListData.target_conversion_rate,
          max_attempts_per_contact: callListData.max_attempts_per_contact || 3,
          hours_between_attempts: callListData.hours_between_attempts || 24,
          allow_voicemail: callListData.allow_voicemail ?? true,
          require_disposition: callListData.require_disposition ?? true,
          created_by: member.id,
          tags: tags || [],
          script_template: script_template || '',
        })
        .select()
        .single()

      if (error) throw error

      // Add contacts if provided
      if (contact_ids && contact_ids.length > 0) {
        const contactRecords = contact_ids.map((contactId, index) => ({
          call_list_id: data.id,
          contact_id: contactId,
          priority: 0,
          sequence_number: index + 1,
          status: 'pending',
          added_by: member.id,
          added_at: new Date().toISOString(),
        }))

        const { error: contactError } = await supabase
          .from('call_list_contacts')
          .insert(contactRecords)

        if (contactError && !contactError.message.includes('duplicate')) {
          console.error('Failed to add contacts:', contactError)
        }
      }

      return data as CallList
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: callListKeys.lists() })
      toast.success('Call list created successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to create call list')
    },
  })
}

// Update call list
export function useUpdateCallList() {
  const { supabase } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<CallListInput> }) => {
      const { data, error } = await supabase
        .from('call_lists')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as CallList
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: callListKeys.lists() })
      queryClient.invalidateQueries({ queryKey: callListKeys.detail(data.id) })
      toast.success('Call list updated successfully')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update call list')
    },
  })
}

// Add contacts to call list
export function useAddContactsToCallList() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ 
      callListId, 
      contactIds,
      priority = 0 
    }: { 
      callListId: string
      contactIds: string[]
      priority?: number
    }) => {
      // Get user's member ID
      const { data: member } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('No organization found')

      // Prepare contact records
      const contactRecords = contactIds.map((contactId, index) => ({
        call_list_id: callListId,
        contact_id: contactId,
        priority,
        sequence_number: index + 1,
        status: 'pending',
        added_by: member.id,
        added_at: new Date().toISOString(),
      }))

      // Insert contacts (skip duplicates)
      const { data, error } = await supabase
        .from('call_list_contacts')
        .insert(contactRecords)
        .select()

      if (error) {
        if (error.message.includes('duplicate')) {
          throw new Error('Some contacts are already in this call list')
        }
        throw error
      }

      return data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: callListKeys.contacts(variables.callListId) })
      queryClient.invalidateQueries({ queryKey: callListKeys.detail(variables.callListId) })
      toast.success('Contacts added to call list')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add contacts')
    },
  })
}

// Helper function to send assignment notification emails
async function sendAssignmentNotifications(
  callListId: string,
  agentAssignments: { agentId: string; contactCount: number }[]
): Promise<void> {
  try {
    const response = await fetch('/api/agents/notify-assignment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        callListId,
        agentAssignments,
      }),
    })

    if (!response.ok) {
      const error = await response.json()
      console.error('Failed to send assignment notifications:', error)
    } else {
      const result = await response.json()
      console.log('Assignment notifications sent:', result)
    }
  } catch (error) {
    // Log but don't throw - notifications are non-critical
    console.error('Error sending assignment notifications:', error)
  }
}

// Assign contacts to agents
export function useAssignContacts() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      callListId,
      assignments,
      strategy,
      sendNotifications = true,
    }: {
      callListId: string
      assignments?: { contactId: string; agentId: string }[]
      strategy?: AssignmentStrategy
      sendNotifications?: boolean
    }) => {
      // Track assignments for notifications
      const agentAssignmentCounts: Record<string, number> = {}

      if (assignments) {
        // Manual assignment - include call_list_id for RLS policy
        const updates = assignments.map(a => ({
          id: a.contactId,
          call_list_id: callListId,
          assigned_to: a.agentId,
          assigned_at: new Date().toISOString(),
          assignment_method: 'manual',
          status: 'assigned',
        }))

        const { error } = await supabase
          .from('call_list_contacts')
          .upsert(updates, { onConflict: 'id' })

        if (error) throw error

        // Count assignments per agent for notifications
        assignments.forEach(a => {
          agentAssignmentCounts[a.agentId] = (agentAssignmentCounts[a.agentId] || 0) + 1
        })
      } else if (strategy) {
        // Automated assignment based on strategy
        const { data: contacts, error: fetchError } = await supabase
          .from('call_list_contacts')
          .select('id, contact_id')
          .eq('call_list_id', callListId)
          .eq('status', 'pending')

        if (fetchError) throw fetchError
        if (!contacts || contacts.length === 0) {
          throw new Error('No pending contacts to assign')
        }

        // Track full contact info for upsert (need both id and contact_id)
        let assignmentMap: Record<string, { id: string; contact_id: string }[]> = {}

        if (strategy.strategy === 'round_robin' && strategy.agentIds) {
          // Round-robin assignment
          contacts.forEach((contact, index) => {
            const agentId = strategy.agentIds![index % strategy.agentIds!.length]
            if (!assignmentMap[agentId]) assignmentMap[agentId] = []
            assignmentMap[agentId].push({ id: contact.id, contact_id: contact.contact_id })
          })
        } else if (strategy.strategy === 'load_based' && strategy.agentIds) {
          // Load-based assignment
          const maxPerAgent = strategy.maxContactsPerAgent || Math.ceil(contacts.length / strategy.agentIds.length)

          let agentIndex = 0
          contacts.forEach((contact) => {
            const agentId = strategy.agentIds![agentIndex]
            if (!assignmentMap[agentId]) assignmentMap[agentId] = []

            assignmentMap[agentId].push({ id: contact.id, contact_id: contact.contact_id })

            if (assignmentMap[agentId].length >= maxPerAgent) {
              agentIndex = (agentIndex + 1) % strategy.agentIds!.length
            }
          })
        }

        // Apply assignments - include call_list_id and contact_id for RLS policy and upsert
        const updates = Object.entries(assignmentMap).flatMap(([agentId, contactInfos]) =>
          contactInfos.map(contactInfo => ({
            id: contactInfo.id,
            contact_id: contactInfo.contact_id,
            call_list_id: callListId,
            assigned_to: agentId,
            assigned_at: new Date().toISOString(),
            assignment_method: strategy.strategy,
            status: 'assigned' as const,
          }))
        )

        const { error } = await supabase
          .from('call_list_contacts')
          .upsert(updates, { onConflict: 'id' })

        if (error) throw error

        // Count assignments per agent for notifications
        Object.entries(assignmentMap).forEach(([agentId, contactInfos]) => {
          agentAssignmentCounts[agentId] = contactInfos.length
        })
      }

      // Return assignment counts for notification sending
      return {
        success: true,
        agentAssignmentCounts,
        callListId,
        sendNotifications,
      }
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: callListKeys.contacts(variables.callListId) })
      queryClient.invalidateQueries({ queryKey: callListKeys.assignments(variables.callListId) })
      toast.success('Contacts assigned successfully')

      // Send email notifications to assigned agents (non-blocking)
      if (data.sendNotifications && Object.keys(data.agentAssignmentCounts).length > 0) {
        const agentAssignments = Object.entries(data.agentAssignmentCounts).map(([agentId, contactCount]) => ({
          agentId,
          contactCount,
        }))
        sendAssignmentNotifications(data.callListId, agentAssignments)
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to assign contacts')
    },
  })
}

// Get call list contacts
export function useCallListContacts(callListId: string, filters?: {
  status?: string
  assignedTo?: string
  searchTerm?: string
}) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: callListKeys.contacts(callListId),
    queryFn: async () => {
      let query = supabase
        .from('call_list_contacts')
        .select(`
          *,
          contact:contacts!call_list_contacts_contact_id_fkey(
            id,
            full_name,
            phone_number,
            email,
            company,
            status
          ),
          assigned_agent:organization_members!call_list_contacts_assigned_to_fkey(
            id,
            full_name,
            email
          )
        `)
        .eq('call_list_id', callListId)
        .order('priority', { ascending: false })
        .order('sequence_number', { ascending: true })

      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }

      if (filters?.assignedTo) {
        query = query.eq('assigned_to', filters.assignedTo)
      }

      const { data, error } = await query

      if (error) throw error
      return data as CallListContact[]
    },
    enabled: !!user && !!callListId,
  })
}

// Archive call list
export function useArchiveCallList() {
  const { supabase } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (callListId: string) => {
      const { error } = await supabase
        .from('call_lists')
        .update({
          status: 'archived',
          archived_at: new Date().toISOString(),
        })
        .eq('id', callListId)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: callListKeys.lists() })
      toast.success('Call list archived')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to archive call list')
    },
  })
}

// Get call list statistics
export function useCallListStats(callListId: string) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: callListKeys.stats(callListId),
    queryFn: async () => {
      // Get contact statistics
      const { data: contacts, error: contactsError } = await supabase
        .from('call_list_contacts')
        .select('id, status, assigned_to, total_attempts')
        .eq('call_list_id', callListId)

      if (contactsError) throw contactsError

      // Get call attempts statistics
      const { data: attempts, error: attemptsError } = await supabase
        .from('call_attempts')
        .select('disposition, duration_seconds')
        .in('call_list_contact_id', contacts?.map(c => c.id) || [])

      if (attemptsError) throw attemptsError

      // Calculate statistics
      const stats = {
        totalContacts: contacts?.length || 0,
        pendingContacts: contacts?.filter(c => c.status === 'pending').length || 0,
        assignedContacts: contacts?.filter(c => c.status === 'assigned').length || 0,
        inProgressContacts: contacts?.filter(c => c.status === 'in_progress').length || 0,
        completedContacts: contacts?.filter(c => c.status === 'completed').length || 0,
        skippedContacts: contacts?.filter(c => c.status === 'skipped').length || 0,
        failedContacts: contacts?.filter(c => c.status === 'failed').length || 0,
        
        totalAttempts: contacts?.reduce((sum, c) => sum + (c.total_attempts || 0), 0) || 0,
        averageAttemptsPerContact: contacts?.length 
          ? (contacts.reduce((sum, c) => sum + (c.total_attempts || 0), 0) / contacts.length).toFixed(1)
          : '0',
        
        totalCalls: attempts?.length || 0,
        answeredCalls: attempts?.filter(a => a.disposition === 'answered').length || 0,
        voicemailCalls: attempts?.filter(a => a.disposition === 'voicemail').length || 0,
        noAnswerCalls: attempts?.filter(a => a.disposition === 'no_answer').length || 0,
        
        averageCallDuration: attempts?.length
          ? Math.round(attempts.reduce((sum, a) => sum + (a.duration_seconds || 0), 0) / attempts.length)
          : 0,
        
        conversionRate: contacts?.length
          ? ((attempts?.filter(a => a.disposition === 'sale_made' || a.disposition === 'appointment_set').length || 0) / contacts.length * 100).toFixed(1)
          : '0',
        
        activeAgents: new Set(contacts?.filter(c => c.assigned_to).map(c => c.assigned_to)).size,
      }

      return stats
    },
    enabled: !!user && !!callListId,
  })
}