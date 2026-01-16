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
      if (!user) {
        console.log('No user found when fetching agents')
        return []
      }

      let query = supabase
        .from('organization_members')
        .select('*')
        .order('created_at', { ascending: false })

      // Apply filters if provided
      if (filters?.searchTerm) {
        query = query.or(`full_name.ilike.%${filters.searchTerm}%,email.ilike.%${filters.searchTerm}%`)
      }
      
      if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status)
      }
      
      if (filters?.department && filters.department !== 'all') {
        query = query.eq('department', filters.department)
      }

      const { data, error } = await query

      if (error) {
        // Better error serialization
        const errorDetails = {
          message: error?.message || 'Unknown error',
          code: error?.code || 'UNKNOWN',
          details: error?.details || null,
          hint: error?.hint || null,
          fullError: JSON.stringify(error, null, 2)
        }
        console.error('Error fetching agents:', errorDetails)
        
        // Check for specific error codes
        if (error?.code === '42501') {
          throw new Error('Permission denied. Please ensure you are logged in and have access to view agents.')
        } else if (error?.code === 'PGRST301') {
          throw new Error('Database connection error. Please try again.')
        } else {
          throw new Error(error?.message || 'Failed to fetch agents')
        }
      }

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
      if (!user) {
        console.log('No user found when fetching agent')
        return null
      }

      const { data, error } = await supabase
        .from('organization_members')
        .select('*')
        .eq('id', agentId)
        .single()

      if (error) {
        console.error('Error fetching agent:', {
          error,
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          agentId
        })
        throw new Error(error.message || 'Failed to fetch agent')
      }
      return data as Agent
    },
    enabled: !!user && !!agentId,
  })
}

// Create agent
export function useCreateAgent() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateAgentInput) => {
      // Use API route to bypass RLS and use service role key
      const response = await fetch('/api/agents/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(input),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create agent')
      }

      const result = await response.json()
      return result.agent as Agent
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
      // If changing role away from org_admin, check if this is the last one
      if (updates.role && updates.role !== 'org_admin') {
        // Get current agent to check their role
        const { data: currentAgent } = await supabase
          .from('organization_members')
          .select('role, status')
          .eq('id', id)
          .single()

        if (currentAgent?.role === 'org_admin' && currentAgent?.status === 'active') {
          const check = await checkLastOrgAdmin(supabase, [id], 'demote')
          if (!check.safe) {
            throw new Error(check.error)
          }
        }
      }

      // Note: Status changes are not part of UpdateAgentInput, but the database trigger
      // will catch any attempts to deactivate the last org_admin via direct DB access.

      // Clean up department_id - convert empty string to null
      const cleanedUpdates = {
        ...updates,
        department_id: updates.department_id && updates.department_id !== ''
          ? updates.department_id
          : null
      }

      const { data, error } = await supabase
        .from('organization_members')
        .update(cleanedUpdates)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        // Handle database trigger error gracefully
        if (error.message?.includes('last org_admin')) {
          throw new Error('Cannot modify the last org_admin. Every organization must have at least one org_admin.')
        }
        throw error
      }
      return data as Agent
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() })
      queryClient.invalidateQueries({ queryKey: agentKeys.detail(data.id) })
      toast.success('Agent updated successfully')
    },
    onError: (error: any) => {
      const message = error.message || 'Failed to update agent'
      toast.error(message)
      console.error('Update agent error:', error)
    },
  })
}

// Helper to check if operation would remove the last org_admin
async function checkLastOrgAdmin(
  supabase: any,
  agentIds: string[],
  operation: 'delete' | 'demote'
): Promise<{ safe: boolean; error?: string }> {
  // Get the agents being modified
  const { data: targetAgents, error: fetchError } = await supabase
    .from('organization_members')
    .select('id, role, status, organization_id')
    .in('id', agentIds)

  if (fetchError) {
    return { safe: false, error: 'Failed to check org_admin status' }
  }

  // Filter to only active org_admins being affected
  const affectedOrgAdmins = targetAgents?.filter(
    (a: any) => a.role === 'org_admin' && a.status === 'active'
  ) || []

  if (affectedOrgAdmins.length === 0) {
    // Not affecting any org_admins, safe to proceed
    return { safe: true }
  }

  // Get organization ID from the first affected admin
  const orgId = affectedOrgAdmins[0].organization_id

  // Count total active org_admins in the organization
  const { count, error: countError } = await supabase
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('role', 'org_admin')
    .eq('status', 'active')

  if (countError) {
    return { safe: false, error: 'Failed to count org_admins' }
  }

  // Check if this would remove all org_admins
  const remainingAdmins = (count || 0) - affectedOrgAdmins.length
  if (remainingAdmins < 1) {
    const action = operation === 'delete' ? 'delete' : 'change the role of'
    return {
      safe: false,
      error: `Cannot ${action} the last org_admin. Every organization must have at least one org_admin.`
    }
  }

  return { safe: true }
}

// Delete agents
export function useDeleteAgents() {
  const { supabase } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (agentIds: string[]) => {
      // Check if this would delete the last org_admin
      const check = await checkLastOrgAdmin(supabase, agentIds, 'delete')
      if (!check.safe) {
        throw new Error(check.error)
      }

      const { error } = await supabase
        .from('organization_members')
        .delete()
        .in('id', agentIds)

      if (error) {
        // Handle database trigger error gracefully
        if (error.message?.includes('last org_admin')) {
          throw new Error('Cannot delete the last org_admin. Every organization must have at least one org_admin.')
        }
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() })
      toast.success('Agent(s) deleted successfully')
    },
    onError: (error: any) => {
      const message = error.message || 'Failed to delete agent(s)'
      toast.error(message)
      console.error('Delete agents error:', error)
    },
  })
}

// Send invitations
export function useSendInvitations() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (agentIds: string[]) => {
      // Call the API route to send invitations via Resend (requires server-side admin access)
      const response = await fetch('/api/agents/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for authentication
        body: JSON.stringify({ agentIds }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send invitations')
      }

      const result = await response.json()
      
      if (result.failed > 0) {
        console.warn(`${result.failed} invitation(s) failed to send`)
      }

      return result
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: agentKeys.lists() })
      toast.success(result.message || `${result.invited} invitation(s) sent successfully`)
    },
    onError: (error: any) => {
      if (error.message?.includes('rate limit')) {
        toast.error('Email rate limit reached. Please wait an hour or configure custom SMTP in Supabase.')
      } else if (error.message?.includes('not authorized')) {
        toast.error('Email address not authorized. Configure custom SMTP in Supabase to send to any email address.')
      } else {
        toast.error(error.message || 'Failed to send invitations')
      }
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
      if (!user?.id) throw new Error('User not authenticated')
      
      // Try to get organization ID from user session or from database
      let organizationId: string
      
      // Get current user to check for organization data
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      
      if (currentUser?.user_metadata?.organization_id) {
        organizationId = currentUser.user_metadata.organization_id
        console.log('Using organization ID from user metadata:', organizationId)
      } else {
        // Get the user's organization from the database
        const { data: memberData } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .single()
        
        if (memberData?.organization_id) {
          organizationId = memberData.organization_id
          console.log('Using organization ID from database:', organizationId)
        } else {
          // As a last resort, try to get any organization the user belongs to
          const { data: orgData } = await supabase
            .from('organization_members')
            .select('organization_id')
            .eq('email', user.email)
            .single()
          
          if (orgData?.organization_id) {
            organizationId = orgData.organization_id
            console.log('Using organization ID from email lookup:', organizationId)
          } else {
            throw new Error('Could not determine organization ID. Please ensure you belong to an organization.')
          }
        }
      }
      
      // Prepare agent records with the organization ID
      const agentRecords = agents.map((agent) => ({
        organization_id: organizationId,
        user_id: null, // Set to null for new agents without auth accounts yet
        email: agent.email,
        full_name: agent.full_name,
        phone: agent.phone || null,
        role: agent.role || 'agent',
        department: agent.department || null,
        extension: agent.extension || null,
        bio: agent.bio || null,
        status: 'pending_invitation',
        is_active: false,
      }))

      try {
        // Try direct insert with the temporary organization ID
        const { data, error } = await supabase
          .from('organization_members')
          .insert(agentRecords)
          .select()

        if (error) {
          console.error('Insert error details:', error)
          console.error('Insert error message:', error.message)
          console.error('Insert error code:', error.code)
          console.error('Insert error details:', error.details)
          console.error('Insert error hint:', error.hint)
          throw error
        }
        
        console.log('Successfully inserted agents:', data)
        return data as Agent[]
      } catch (insertError: any) {
        console.error('Failed to insert agents:', insertError)
        console.error('Insert error type:', typeof insertError)
        console.error('Insert error message:', insertError?.message)
        console.error('Insert error code:', insertError?.code)
        console.error('Insert error details:', insertError?.details)
        console.error('Insert error hint:', insertError?.hint)
        console.error('Insert error stack:', insertError?.stack)
        throw new Error(`Import failed: ${insertError?.message || 'Unknown error'}`)
      }
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