import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'

// =============================================================================
// QUERY KEYS
// =============================================================================
export const smsFeatureKeys = {
  templates: () => ['sms', 'templates'] as const,
  templatesList: (category?: string) => [...smsFeatureKeys.templates(), 'list', category] as const,
  scheduled: () => ['sms', 'scheduled'] as const,
  scheduledList: (status?: string) => [...smsFeatureKeys.scheduled(), 'list', status] as const,
  analytics: () => ['sms', 'analytics'] as const,
  analyticsData: (period: string) => [...smsFeatureKeys.analytics(), period] as const,
  handoffs: () => ['sms', 'handoffs'] as const,
  handoffsList: (type?: string) => [...smsFeatureKeys.handoffs(), 'list', type] as const,
  optOuts: () => ['sms', 'opt-outs'] as const,
  suggestions: (conversationId: string) => ['sms', 'suggestions', conversationId] as const,
}

// =============================================================================
// TEMPLATES
// =============================================================================
interface SMSTemplate {
  id: string
  name: string
  content: string
  category: string
  variables: string[]
  is_shared: boolean
  usage_count: number
  created_at: string
}

export function useTemplates(category?: string) {
  return useQuery({
    queryKey: smsFeatureKeys.templatesList(category),
    queryFn: async () => {
      const url = category
        ? `/api/sms/templates?category=${encodeURIComponent(category)}`
        : '/api/sms/templates'
      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to fetch templates')
      const data = await response.json()
      return data.templates as SMSTemplate[]
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

export function useCreateTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (template: { name: string; content: string; category?: string }) => {
      const response = await fetch('/api/sms/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(template)
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create template')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: smsFeatureKeys.templates() })
      toast.success('Template created')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; name?: string; content?: string; category?: string }) => {
      const response = await fetch(`/api/sms/templates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      })
      if (!response.ok) throw new Error('Failed to update template')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: smsFeatureKeys.templates() })
      toast.success('Template updated')
    }
  })
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/sms/templates/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to delete template')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: smsFeatureKeys.templates() })
      toast.success('Template deleted')
    }
  })
}

export function useTemplate(id: string, variables?: Record<string, string>) {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/sms/templates/${id}/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables })
      })
      if (!response.ok) throw new Error('Failed to use template')
      return response.json()
    }
  })
}

// =============================================================================
// SCHEDULED MESSAGES
// =============================================================================
interface ScheduledMessage {
  id: string
  to_number: string
  message_body: string
  scheduled_at: string
  timezone: string
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  created_at: string
}

export function useScheduledMessages(status?: string) {
  return useQuery({
    queryKey: smsFeatureKeys.scheduledList(status),
    queryFn: async () => {
      const url = status
        ? `/api/sms/scheduled?status=${encodeURIComponent(status)}`
        : '/api/sms/scheduled'
      const response = await fetch(url)
      if (!response.ok) throw new Error('Failed to fetch scheduled messages')
      const data = await response.json()
      return data.scheduled as ScheduledMessage[]
    },
    staleTime: 1000 * 30, // 30 seconds
  })
}

export function useCreateScheduledMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (message: {
      to_number: string
      message_body: string
      scheduled_at: string
      timezone?: string
      conversation_id?: string
      contact_id?: string
    }) => {
      const response = await fetch('/api/sms/scheduled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to schedule message')
      }
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: smsFeatureKeys.scheduled() })
      toast.success('Message scheduled')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })
}

export function useCancelScheduledMessage() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/sms/scheduled/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Failed to cancel scheduled message')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: smsFeatureKeys.scheduled() })
      toast.success('Scheduled message cancelled')
    }
  })
}

// =============================================================================
// ANALYTICS
// =============================================================================
interface SMSAnalytics {
  period: { start: string; end: string }
  totals: {
    messages_sent: number
    messages_received: number
    messages_failed: number
    opt_outs: number
    segments_used: number
  }
  daily: Array<{
    date: string
    messages_sent: number
    messages_received: number
    messages_failed: number
  }>
  conversations: {
    total: number
    active: number
  }
  delivery_rate: string
  response_rate: string
}

export function useSMSAnalytics(period: '7d' | '30d' | '90d' = '30d') {
  return useQuery({
    queryKey: smsFeatureKeys.analyticsData(period),
    queryFn: async () => {
      const response = await fetch(`/api/sms/analytics?period=${period}`)
      if (!response.ok) throw new Error('Failed to fetch analytics')
      const data = await response.json()
      return data.analytics as SMSAnalytics
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

// =============================================================================
// HANDOFFS
// =============================================================================
interface ConversationHandoff {
  id: string
  conversation_id: string
  from_agent_id: string | null
  to_agent_id: string
  reason: string | null
  notes: string | null
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  created_at: string
  conversation?: any
  from_agent?: any
  to_agent?: any
}

export function useHandoffs(type: 'incoming' | 'outgoing' | 'all' = 'incoming') {
  return useQuery({
    queryKey: smsFeatureKeys.handoffsList(type),
    queryFn: async () => {
      const response = await fetch(`/api/sms/handoffs?type=${type}`)
      if (!response.ok) throw new Error('Failed to fetch handoffs')
      const data = await response.json()
      return data.handoffs as ConversationHandoff[]
    },
    staleTime: 1000 * 30, // 30 seconds
  })
}

export function useCreateHandoff() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (handoff: {
      conversation_id: string
      to_agent_id: string
      reason?: string
      notes?: string
    }) => {
      const response = await fetch('/api/sms/handoffs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(handoff)
      })
      if (!response.ok) throw new Error('Failed to create handoff')
      return response.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: smsFeatureKeys.handoffs() })
      toast.success('Handoff request sent')
    }
  })
}

export function useRespondToHandoff() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'accept' | 'decline' }) => {
      const response = await fetch(`/api/sms/handoffs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })
      if (!response.ok) throw new Error('Failed to respond to handoff')
      return response.json()
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: smsFeatureKeys.handoffs() })
      queryClient.invalidateQueries({ queryKey: ['sms', 'conversations'] })
      toast.success(action === 'accept' ? 'Handoff accepted' : 'Handoff declined')
    }
  })
}

// =============================================================================
// BULK ACTIONS
// =============================================================================
type BulkAction = 'archive' | 'unarchive' | 'assign' | 'unassign' | 'update_status' | 'update_priority' | 'add_tags' | 'remove_tags'

export function useBulkAction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      conversationIds,
      action,
      payload
    }: {
      conversationIds: string[]
      action: BulkAction
      payload?: Record<string, any>
    }) => {
      const response = await fetch('/api/sms/conversations/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_ids: conversationIds,
          action,
          payload
        })
      })
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Bulk action failed')
      }
      return response.json()
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sms', 'conversations'] })
      toast.success(`Updated ${data.affected} conversation${data.affected !== 1 ? 's' : ''}`)
    },
    onError: (error: Error) => {
      toast.error(error.message)
    }
  })
}

// =============================================================================
// OPT-OUTS
// =============================================================================
interface OptOutData {
  opted_out: Array<{
    id: string
    phone_number: string
    is_opted_out: boolean
    opted_out_at: string
    contact?: {
      first_name: string
      last_name: string
      email: string
      company: string
    }
  }>
  history: Array<{
    id: string
    phone_number: string
    action: 'opt_out' | 'opt_in'
    reason: string | null
    created_at: string
  }>
  total: number
}

export function useOptOuts() {
  return useQuery({
    queryKey: smsFeatureKeys.optOuts(),
    queryFn: async () => {
      const response = await fetch('/api/sms/opt-outs')
      if (!response.ok) throw new Error('Failed to fetch opt-outs')
      return response.json() as Promise<OptOutData>
    },
    staleTime: 1000 * 60, // 1 minute
  })
}

export function useUpdateOptOut() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      conversationId,
      phoneNumber,
      action,
      reason
    }: {
      conversationId?: string
      phoneNumber?: string
      action: 'opt_out' | 'opt_in'
      reason?: string
    }) => {
      const response = await fetch('/api/sms/opt-outs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          phone_number: phoneNumber,
          action,
          reason
        })
      })
      if (!response.ok) throw new Error('Failed to update opt-out status')
      return response.json()
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: smsFeatureKeys.optOuts() })
      queryClient.invalidateQueries({ queryKey: ['sms', 'conversations'] })
      toast.success(action === 'opt_out' ? 'Contact opted out' : 'Contact opted back in')
    }
  })
}

// =============================================================================
// REPLY SUGGESTIONS
// =============================================================================
export function useReplySuggestions(conversationId: string) {
  return useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/sms/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: conversationId })
      })
      if (!response.ok) throw new Error('Failed to get suggestions')
      const data = await response.json()
      return data.suggestions as string[]
    }
  })
}

// =============================================================================
// EXPORT
// =============================================================================
export function useExportMessages() {
  return useMutation({
    mutationFn: async ({
      format = 'csv',
      conversationId,
      dateFrom,
      dateTo
    }: {
      format?: 'csv' | 'json'
      conversationId?: string
      dateFrom?: string
      dateTo?: string
    }) => {
      const params = new URLSearchParams()
      params.set('format', format)
      if (conversationId) params.set('conversation_id', conversationId)
      if (dateFrom) params.set('date_from', dateFrom)
      if (dateTo) params.set('date_to', dateTo)

      const response = await fetch(`/api/sms/export?${params}`)
      if (!response.ok) throw new Error('Export failed')

      if (format === 'json') {
        return response.json()
      }

      // Download CSV
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sms-export-${new Date().toISOString().split('T')[0]}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      return { success: true }
    },
    onSuccess: (_, { format }) => {
      if (format === 'csv') {
        toast.success('Export downloaded')
      }
    },
    onError: () => {
      toast.error('Export failed')
    }
  })
}

// =============================================================================
// CONVERSATION STATUS
// =============================================================================
export function useUpdateConversationStatus() {
  const queryClient = useQueryClient()
  const supabase = createClient()

  return useMutation({
    mutationFn: async ({
      conversationId,
      workflowStatus,
      priority,
      tags
    }: {
      conversationId: string
      workflowStatus?: string
      priority?: string
      tags?: string[]
    }) => {
      const updates: Record<string, any> = {}
      if (workflowStatus !== undefined) updates.workflow_status = workflowStatus
      if (priority !== undefined) updates.priority = priority
      if (tags !== undefined) updates.tags = tags

      const { error } = await supabase
        .from('sms_conversations')
        .update(updates)
        .eq('id', conversationId)

      if (error) throw error
      return { success: true }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sms', 'conversations'] })
    }
  })
}

// =============================================================================
// INFINITE SCROLL FOR CONVERSATIONS
// =============================================================================
export function useConversationsInfinite(filters?: {
  tab?: string
  searchQuery?: string
  agentContactIds?: string[]
}) {
  const supabase = createClient()
  const { user } = useAuth()
  const PAGE_SIZE = 20

  return useInfiniteQuery({
    queryKey: ['sms', 'conversations', 'infinite', filters],
    queryFn: async ({ pageParam = 0 }) => {
      let query = supabase
        .from('sms_conversations')
        .select(`
          *,
          contact:contacts(first_name, last_name, company, email)
        `)
        .order('last_message_at', { ascending: false })
        .range(pageParam * PAGE_SIZE, (pageParam + 1) * PAGE_SIZE - 1)

      // Apply filters
      if (filters?.tab === 'assigned') {
        query = query.eq('assigned_agent_id', user?.id)
      } else if (filters?.tab === 'unassigned') {
        query = query.is('assigned_agent_id', null)
      } else if (filters?.tab === 'archived') {
        query = query.eq('status', 'archived')
      } else {
        query = query.neq('status', 'archived')
      }

      if (filters?.agentContactIds && filters.agentContactIds.length > 0) {
        query = query.in('contact_id', filters.agentContactIds)
      }

      const { data, error } = await query

      if (error) throw error
      return {
        conversations: data || [],
        nextPage: data && data.length === PAGE_SIZE ? pageParam + 1 : undefined
      }
    },
    getNextPageParam: (lastPage) => lastPage.nextPage,
    initialPageParam: 0,
    enabled: !!user,
    staleTime: Infinity, // Rely on realtime subscriptions
  })
}
