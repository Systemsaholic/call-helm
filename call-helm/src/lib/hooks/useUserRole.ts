import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/hooks/useAuth'

export type UserRole = 'org_admin' | 'team_lead' | 'agent' | 'billing_admin'

export interface OrganizationMembership {
  id: string
  user_id: string
  organization_id: string
  role: UserRole
  full_name: string | null
  email: string
  status: string
  can_broadcast: boolean
  organization: {
    id: string
    name: string
    subscription_tier: string
    subscription_status: string
  } | null
}

// Query keys
export const userRoleKeys = {
  all: ['userRole'] as const,
  membership: () => [...userRoleKeys.all, 'membership'] as const,
}

/**
 * Hook to fetch the current user's organization membership and role
 */
export function useUserRole() {
  const { supabase, user } = useAuth()

  const query = useQuery<OrganizationMembership | null>({
    queryKey: userRoleKeys.membership(),
    queryFn: async () => {
      if (!user?.id) return null

      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          id,
          user_id,
          organization_id,
          role,
          full_name,
          email,
          status,
          can_broadcast,
          organization:organizations!organization_members_organization_id_fkey(
            id,
            name,
            subscription_tier,
            subscription_status
          )
        `)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()

      if (error) {
        // User might not be a member of any organization
        if (error.code === 'PGRST116') {
          return null
        }
        throw error
      }

      // Transform data - Supabase returns organization as an array
      const transformed: OrganizationMembership = {
        id: data.id,
        user_id: data.user_id,
        organization_id: data.organization_id,
        role: data.role,
        full_name: data.full_name,
        email: data.email,
        status: data.status,
        can_broadcast: data.can_broadcast ?? false,
        organization: (data.organization as any)?.[0] || null,
      }
      return transformed
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes - role rarely changes
  })

  return {
    membership: query.data,
    role: query.data?.role || null,
    memberId: query.data?.id || null,
    organizationId: query.data?.organization_id || null,
    isLoading: query.isLoading,
    isAgent: query.data?.role === 'agent',
    isAdmin: query.data?.role === 'org_admin',
    isTeamLead: query.data?.role === 'team_lead',
    isBillingAdmin: query.data?.role === 'billing_admin',
    canManageAgents: query.data?.role === 'org_admin' || query.data?.role === 'team_lead',
    canAccessBilling: query.data?.role === 'org_admin' || query.data?.role === 'billing_admin',
    canAccessAnalytics: query.data?.role !== 'agent', // Everyone except agents
    canBroadcast: query.data?.can_broadcast ?? false, // Explicit permission for SMS broadcasts
  }
}
