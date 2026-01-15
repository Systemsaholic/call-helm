import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export interface Broadcast {
  id: string
  organization_id: string
  name: string
  message_template: string
  from_phone_number_id: string
  campaign_id?: string
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'cancelled' | 'failed'
  scheduled_at?: string
  started_at?: string
  completed_at?: string
  total_recipients: number
  sent_count: number
  delivered_count: number
  failed_count: number
  opted_out_skipped: number
  created_by: string
  created_at: string
  updated_at: string
  // Relations
  phone_numbers?: {
    id: string
    number: string
    friendly_name?: string
  }
  campaign_registry_campaigns?: {
    id: string
    campaign_name: string
    status: string
  }
}

export interface BroadcastRecipient {
  id: string
  broadcast_id: string
  phone_number: string
  contact_name?: string
  variables?: Record<string, string>
  status: 'pending' | 'sending' | 'sent' | 'delivered' | 'failed' | 'skipped'
  skip_reason?: string
  message_id?: string
  sent_at?: string
  delivered_at?: string
  error_message?: string
  created_at: string
}

export interface CreateBroadcastInput {
  name: string
  messageTemplate: string
  fromPhoneNumberId: string
  recipients: Array<{
    phoneNumber: string
    contactName?: string
    variables?: Record<string, string>
  }>
  scheduledAt?: string
}

export interface UpdateBroadcastInput {
  name?: string
  messageTemplate?: string
  scheduledAt?: string | null
}

// Query keys
export const broadcastKeys = {
  all: ['broadcasts'] as const,
  lists: () => [...broadcastKeys.all, 'list'] as const,
  list: (filters?: { status?: string }) => [...broadcastKeys.lists(), filters] as const,
  details: () => [...broadcastKeys.all, 'detail'] as const,
  detail: (id: string) => [...broadcastKeys.details(), id] as const,
  recipients: (broadcastId: string, filters?: { status?: string }) =>
    [...broadcastKeys.detail(broadcastId), 'recipients', filters] as const,
}

// Fetch broadcasts
async function fetchBroadcasts(filters?: { status?: string; limit?: number; offset?: number }) {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.limit) params.set('limit', filters.limit.toString())
  if (filters?.offset) params.set('offset', filters.offset.toString())

  const response = await fetch(`/api/sms/broadcasts?${params.toString()}`)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch broadcasts')
  }
  return response.json()
}

// Fetch single broadcast
async function fetchBroadcast(
  id: string,
  options?: { includeRecipients?: boolean; recipientStatus?: string }
) {
  const params = new URLSearchParams()
  if (options?.includeRecipients) params.set('includeRecipients', 'true')
  if (options?.recipientStatus) params.set('recipientStatus', options.recipientStatus)

  const response = await fetch(`/api/sms/broadcasts/${id}?${params.toString()}`)
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to fetch broadcast')
  }
  return response.json()
}

// Create broadcast
async function createBroadcast(input: CreateBroadcastInput) {
  const response = await fetch('/api/sms/broadcasts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to create broadcast')
  }
  return response.json()
}

// Update broadcast
async function updateBroadcast(id: string, input: UpdateBroadcastInput) {
  const response = await fetch(`/api/sms/broadcasts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to update broadcast')
  }
  return response.json()
}

// Delete broadcast
async function deleteBroadcast(id: string) {
  const response = await fetch(`/api/sms/broadcasts/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to delete broadcast')
  }
  return response.json()
}

// Broadcast control actions
async function sendBroadcast(id: string) {
  const response = await fetch(`/api/sms/broadcasts/${id}/send`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to start broadcast')
  }
  return response.json()
}

async function pauseBroadcast(id: string) {
  const response = await fetch(`/api/sms/broadcasts/${id}/pause`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to pause broadcast')
  }
  return response.json()
}

async function resumeBroadcast(id: string) {
  const response = await fetch(`/api/sms/broadcasts/${id}/resume`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to resume broadcast')
  }
  return response.json()
}

async function cancelBroadcast(id: string) {
  const response = await fetch(`/api/sms/broadcasts/${id}/cancel`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.error || 'Failed to cancel broadcast')
  }
  return response.json()
}

// Hooks
export function useBroadcasts(filters?: { status?: string; limit?: number; offset?: number }) {
  return useQuery({
    queryKey: broadcastKeys.list(filters),
    queryFn: () => fetchBroadcasts(filters),
  })
}

export function useBroadcast(
  id: string,
  options?: { includeRecipients?: boolean; recipientStatus?: string }
) {
  return useQuery({
    queryKey: broadcastKeys.detail(id),
    queryFn: () => fetchBroadcast(id, options),
    enabled: !!id,
    refetchInterval: (data) => {
      // Refetch more frequently when broadcast is sending
      if (data?.state?.data?.broadcast?.status === 'sending') {
        return 5000 // Every 5 seconds
      }
      return false
    },
  })
}

export function useCreateBroadcast() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createBroadcast,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: broadcastKeys.lists() })
      toast.success('Broadcast created successfully')
      return data
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useUpdateBroadcast() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ...input }: UpdateBroadcastInput & { id: string }) =>
      updateBroadcast(id, input),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: broadcastKeys.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: broadcastKeys.lists() })
      toast.success('Broadcast updated')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useDeleteBroadcast() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteBroadcast,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: broadcastKeys.lists() })
      toast.success('Broadcast deleted')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useSendBroadcast() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: sendBroadcast,
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: broadcastKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: broadcastKeys.lists() })
      toast.success('Broadcast started')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function usePauseBroadcast() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: pauseBroadcast,
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: broadcastKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: broadcastKeys.lists() })
      toast.success('Broadcast paused')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useResumeBroadcast() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: resumeBroadcast,
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: broadcastKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: broadcastKeys.lists() })
      toast.success('Broadcast resumed')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useCancelBroadcast() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: cancelBroadcast,
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: broadcastKeys.detail(id) })
      queryClient.invalidateQueries({ queryKey: broadcastKeys.lists() })
      toast.success('Broadcast cancelled')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// Utility hook for polling broadcast status
export function useBroadcastProgress(broadcastId: string) {
  return useQuery({
    queryKey: [...broadcastKeys.detail(broadcastId), 'progress'],
    queryFn: async () => {
      const data = await fetchBroadcast(broadcastId, { includeRecipients: false })
      const broadcast = data.broadcast as Broadcast
      const total = broadcast.total_recipients
      const completed = broadcast.sent_count + broadcast.failed_count + broadcast.opted_out_skipped

      return {
        broadcast,
        statusBreakdown: data.statusBreakdown as Record<string, number>,
        progress: total > 0 ? Math.round((completed / total) * 100) : 0,
        isComplete: broadcast.status === 'completed' || broadcast.status === 'cancelled',
        isSending: broadcast.status === 'sending',
      }
    },
    enabled: !!broadcastId,
    refetchInterval: (data) => {
      // Poll while sending
      if (data?.state?.data?.isSending) {
        return 3000
      }
      return false
    },
  })
}
