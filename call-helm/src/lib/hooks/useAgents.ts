import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/hooks/useAuth'
import { toast } from 'sonner'
import type { Agent } from '@/lib/stores/agentStore'
import type { CreateAgentInput, UpdateAgentInput } from '@/lib/validations/agent.schema'

// Query keys
export const agentKeys = {
  all: ['agents'] as const,
  lists: () => [...agentKeys.all, 'list'] as const,
  list: (filters?: any) => [...agentKeys.lists(), filters] as const,
  details: () => [...agentKeys.all, 'detail'] as const,
  detail: (id: string) => [...agentKeys.details(), id] as const,
  departments: ['departments'] as const,
}

// Fetch all agents
export function useAgents(filters?: {
  searchTerm?: string
  status?: string
  department?: string
}) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: agentKeys.list(filters),
    queryFn: async () => {
      // Get user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('No organization found')

      // Build query
      let query = supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', member.organization_id)
        .order('created_at', { ascending: false })

      // Apply filters
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }
      if (filters?.department && filters.department !== 'all') {
        query = query.eq('department_id', filters.department)
      }
      if (filters?.searchTerm) {
        query = query.or(
          `full_name.ilike.%${filters.searchTerm}%,email.ilike.%${filters.searchTerm}%`
        )
      }

      const { data, error } = await query

      if (error) throw error
      return data as Agent[]
    },
    enabled: !!user,
  })
}

// Fetch single agent
export function useAgent(agentId: string) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: agentKeys.detail(agentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_members')
        .select('*')
        .eq('id', agentId)
        .single()

      if (error) throw error
      return data as Agent
    },
    enabled: !!user && !!agentId,
  })
}

// Create agent
export function useCreateAgent() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateAgentInput) => {
      // Get user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('No organization found')

      // Create agent record (without auth user)
      const { data, error } = await supabase
        .from('organization_members')
        .insert({
          organization_id: member.organization_id,
          email: input.email,
          full_name: input.full_name,
          phone: input.phone,
          role: input.role,
          extension: input.extension,
          department: input.department,
          department_id: input.department_id,
          bio: input.bio,
          status: 'pending_invitation',
          is_active: false,
        })
        .select()
        .single()

      if (error) throw error
      return data as Agent
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() })
      toast.success('Agent added successfully')
    },
    onError: (error) => {
      toast.error('Failed to add agent')
      console.error('Create agent error:', error)
    },
  })
}

// Update agent
export function useUpdateAgent() {
  const { supabase } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateAgentInput }) => {
      const { data, error } = await supabase
        .from('organization_members')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) throw error
      return data as Agent
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() })
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(data.id) })
      toast.success('Agent updated successfully')
    },
    onError: (error) => {
      toast.error('Failed to update agent')
      console.error('Update agent error:', error)
    },
  })
}

// Delete agents
export function useDeleteAgents() {
  const { supabase } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (agentIds: string[]) => {
      const { error } = await supabase
        .from('organization_members')
        .delete()
        .in('id', agentIds)

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() })
      toast.success('Agent(s) deleted successfully')
    },
    onError: (error) => {
      toast.error('Failed to delete agent(s)')
      console.error('Delete agents error:', error)
    },
  })
}

// Send invitations
export function useSendInvitations() {
  const { supabase } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (agentIds: string[]) => {
      // Get agents to invite
      const { data: agents, error: fetchError } = await supabase
        .from('organization_members')
        .select('*')
        .in('id', agentIds)
        .eq('status', 'pending_invitation')

      if (fetchError) throw fetchError
      if (!agents || agents.length === 0) {
        throw new Error('No pending agents found')
      }

      // Send invitations using Supabase Auth Admin
      const results = await Promise.allSettled(
        agents.map(async (agent) => {
          // Create auth user and send invitation
          const { data: authUser, error } = await supabase.auth.admin.inviteUserByEmail(
            agent.email,
            {
              data: {
                organization_member_id: agent.id,
                organization_id: agent.organization_id,
                role: agent.role,
                full_name: agent.full_name,
              },
            }
          )

          if (error) throw error

          // Update agent status
          await supabase
            .from('organization_members')
            .update({
              status: 'invited',
              invited_at: new Date().toISOString(),
              user_id: authUser.user.id,
            })
            .eq('id', agent.id)

          // Track invitation
          await supabase.from('agent_invitations').insert({
            organization_member_id: agent.id,
            invited_by: (await supabase.auth.getUser()).data.user?.id,
          })

          return agent
        })
      )

      // Check for failures
      const failures = results.filter((r) => r.status === 'rejected')
      if (failures.length > 0) {
        console.error('Some invitations failed:', failures)
        if (failures.length === results.length) {
          throw new Error('All invitations failed')
        }
      }

      return results
    },
    onSuccess: (results) => {
      const successCount = results.filter((r) => r.status === 'fulfilled').length
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() })
      toast.success(`${successCount} invitation(s) sent successfully`)
    },
    onError: (error) => {
      toast.error('Failed to send invitations')
      console.error('Send invitations error:', error)
    },
  })
}

// Bulk create agents (alias for bulk import)
export function useBulkCreateAgents() {
  return useBulkImportAgents()
}

// Bulk import agents
export function useBulkImportAgents() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (agents: CreateAgentInput[]) => {
      // Get user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('No organization found')

      // Prepare agent records
      const agentRecords = agents.map((agent) => ({
        organization_id: member.organization_id,
        email: agent.email,
        full_name: agent.full_name,
        phone: agent.phone,
        role: agent.role || 'agent',
        extension: agent.extension,
        department: agent.department,
        status: 'pending_invitation' as const,
        is_active: false,
      }))

      // Bulk insert
      const { data, error } = await supabase
        .from('organization_members')
        .insert(agentRecords)
        .select()

      if (error) throw error
      return data as Agent[]
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() })
      toast.success(`${data.length} agents imported successfully`)
    },
    onError: (error) => {
      toast.error('Failed to import agents')
      console.error('Import agents error:', error)
    },
  })
}

// Fetch departments
export function useDepartments() {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: agentKeys.departments,
    queryFn: async () => {
      // Get user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('No organization found')

      const { data, error } = await supabase
        .from('departments')
        .select('*')
        .eq('organization_id', member.organization_id)
        .order('name')

      if (error) throw error
      return data
    },
    enabled: !!user,
  })
}