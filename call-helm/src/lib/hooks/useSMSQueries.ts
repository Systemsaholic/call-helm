import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query'
import { useAuth } from '@/lib/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { useSMSStore, type Message, type Conversation } from '@/lib/stores/smsStore'

// Query keys
export const smsKeys = {
  all: ['sms'] as const,
  conversations: () => [...smsKeys.all, 'conversations'] as const,
  conversationsList: (filters?: ConversationFilters) => [...smsKeys.conversations(), 'list', filters] as const,
  conversationDetail: (id: string) => [...smsKeys.conversations(), 'detail', id] as const,
  messages: () => [...smsKeys.all, 'messages'] as const,
  messagesList: (conversationId: string) => [...smsKeys.messages(), 'list', conversationId] as const,
  unreadCounts: () => [...smsKeys.all, 'unread'] as const,
  reactions: (messageId: string) => [...smsKeys.all, 'reactions', messageId] as const,
  conversationReactions: (conversationId: string) => [...smsKeys.all, 'conversationReactions', conversationId] as const,
  search: (query: string) => [...smsKeys.all, 'search', query] as const,
}

export interface ConversationFilters {
  tab?: 'all' | 'assigned' | 'unassigned' | 'archived'
  searchQuery?: string
  userId?: string
  // For agents: filter to only show conversations with contacts they're assigned to
  agentContactIds?: string[]
}

// Generate temporary ID for optimistic updates
const generateTempId = () => `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

// Fetch conversations with filters
export function useConversations(filters?: ConversationFilters) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: smsKeys.conversationsList(filters),
    queryFn: async () => {
      let query = supabase
        .from('sms_conversations')
        .select(`
          *,
          contact:contacts(
            first_name,
            last_name,
            company,
            email
          )
        `)
        .order('last_message_at', { ascending: false })

      // Apply filters based on active tab
      if (filters?.tab === 'assigned') {
        query = query.eq('assigned_agent_id', user?.id)
      } else if (filters?.tab === 'unassigned') {
        query = query.is('assigned_agent_id', null)
      } else if (filters?.tab === 'archived') {
        query = query.eq('status', 'archived')
      } else {
        query = query.neq('status', 'archived')
      }

      // Filter by agent's assigned contacts (for agent role)
      if (filters?.agentContactIds && filters.agentContactIds.length > 0) {
        query = query.in('contact_id', filters.agentContactIds)
      }

      const { data: convData, error: convError } = await query

      if (convError) throw convError

      // Fetch last message and sentiment for each conversation
      const conversationsWithData = await Promise.all(
        (convData || []).map(async (conv) => {
          // Fetch last message (maybeSingle handles empty conversations)
          const msgResult = await supabase
            .from('sms_messages')
            .select(`
              id,
              message_body,
              direction,
              created_at
            `)
            .eq('conversation_id', conv.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          return {
            ...conv,
            last_message: msgResult.data ? {
              content: msgResult.data.message_body,
              direction: msgResult.data.direction,
              created_at: msgResult.data.created_at
            } : null,
            // Sentiment analysis disabled until sms_message_analysis table is created
            sentiment: null
          } as Conversation
        })
      )

      // Now get actual unread counts for all conversations in a single query
      const conversationIds = conversationsWithData.map(c => c.id)
      if (conversationIds.length > 0) {
        // Query unread messages grouped by conversation
        const { data: unreadData } = await supabase
          .from('sms_messages')
          .select(`
            conversation_id,
            id,
            message_read_status!left(
              id,
              user_id
            )
          `)
          .in('conversation_id', conversationIds)
          .eq('direction', 'inbound')

        // Calculate unread counts per conversation for the current user
        const unreadCounts: Record<string, number> = {}
        
        if (unreadData) {
          unreadData.forEach(msg => {
            // Check if this message has been read by the current user
            const hasBeenRead = msg.message_read_status?.some((rs: { user_id: string }) => rs.user_id === user?.id)
            
            if (!hasBeenRead) {
              unreadCounts[msg.conversation_id] = (unreadCounts[msg.conversation_id] || 0) + 1
            }
          })
        }

        // Update conversations with calculated unread counts
        conversationsWithData.forEach(conv => {
          conv.unread_count = unreadCounts[conv.id] || 0
        })
      }

      // Apply search filter
      if (filters?.searchQuery) {
        const searchLower = filters.searchQuery.toLowerCase()
        return conversationsWithData.filter(conv => {
          const fullName = `${conv.contact?.first_name || ''} ${conv.contact?.last_name || ''}`.toLowerCase()
          const phoneNumber = conv.phone_number.toLowerCase()
          const company = conv.contact?.company?.toLowerCase() || ''
          const lastMessage = conv.last_message?.content?.toLowerCase() || ''
          
          return fullName.includes(searchLower) ||
                 phoneNumber.includes(searchLower) ||
                 company.includes(searchLower) ||
                 lastMessage.includes(searchLower)
        })
      }

      return conversationsWithData
    },
    enabled: !!user,
    staleTime: Infinity, // Never auto-refetch - rely on realtime subscriptions
    // NO refetchInterval - realtime subscriptions handle all updates
  })
}

// Fetch single conversation
export function useConversation(conversationId: string) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: smsKeys.conversationDetail(conversationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sms_conversations')
        .select('*, contact:contacts(*)')
        .eq('id', conversationId)
        .single()

      if (error) throw error
      return data as Conversation
    },
    enabled: !!user && !!conversationId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })
}

// Fetch messages for a conversation with optimistic updates
export function useMessages(conversationId: string) {
  const { supabase, user } = useAuth()
  const { getOptimisticMessagesForConversation } = useSMSStore()

  const query = useQuery({
    queryKey: smsKeys.messagesList(conversationId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sms_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (error) throw error
      return data as Message[]
    },
    enabled: !!user && !!conversationId,
    staleTime: 1000 * 30, // 30 seconds
    gcTime: 1000 * 60 * 10, // Keep in cache for 10 minutes
  })

  // Merge optimistic messages with real messages
  const optimisticMessages = getOptimisticMessagesForConversation(conversationId)
  const realMessages = query.data || []

  // Combine and sort by created_at
  const allMessages = [...realMessages, ...optimisticMessages]
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  return {
    ...query,
    data: allMessages,
  }
}

// Prefetch messages for a conversation (for hover prefetching)
export function usePrefetchMessages() {
  const { supabase } = useAuth()
  const queryClient = useQueryClient()

  return (conversationId: string) => {
    // Check if already cached
    const cached = queryClient.getQueryData(smsKeys.messagesList(conversationId))
    if (cached) return

    // Prefetch if not cached
    queryClient.prefetchQuery({
      queryKey: smsKeys.messagesList(conversationId),
      queryFn: async () => {
        const { data, error } = await supabase
          .from('sms_messages')
          .select('*')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true })

        if (error) throw error
        return data as Message[]
      },
      staleTime: 1000 * 30,
    })
  }
}

// Send message with optimistic updates
export function useSendMessage() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()
  const { 
    addOptimisticMessage, 
    removeOptimisticMessage, 
    confirmOptimisticMessage,
    setSending,
    clearDraft 
  } = useSMSStore()

  return useMutation({
    mutationFn: async ({ 
      conversationId, 
      phoneNumber, 
      message, 
      mediaUrls = [],
      contactId 
    }: {
      conversationId: string
      phoneNumber: string
      message: string
      mediaUrls?: string[]
      contactId?: string
    }) => {
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: phoneNumber,
          message: message || (mediaUrls.length > 0 ? 'Sent attachment(s)' : ''),
          mediaUrls,
          conversationId,
          contactId
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to send message')
      }

      return response.json()
    },
    onMutate: async ({ conversationId, message, mediaUrls = [] }) => {
      // Generate temporary ID
      const tempId = generateTempId()
      
      // Set sending state
      setSending(true, tempId)

      // Create optimistic message
      const optimisticMessage: Message = {
        id: tempId,
        conversation_id: conversationId,
        direction: 'outbound',
        from_number: '',
        to_number: '',
        message_body: message || (mediaUrls.length > 0 ? 'Sent attachment(s)' : ''),
        media_urls: mediaUrls.length > 0 ? mediaUrls : undefined,
        status: 'pending',
        created_at: new Date().toISOString(),
      }

      // Add to optimistic store
      addOptimisticMessage(tempId, optimisticMessage)

      // Clear draft
      clearDraft(conversationId)

      return { tempId, conversationId }
    },
    onSuccess: (result, variables, context) => {
      if (context && result.success && result.messageId) {
        // Confirm optimistic message with real ID
        confirmOptimisticMessage(context.tempId, result.messageId)
        
        // Update conversation's last_message_at in cache
        queryClient.setQueryData(
          smsKeys.conversationsList(),
          (old: Conversation[] | undefined) => {
            if (!old) return old
            return old.map(conv => 
              conv.id === context.conversationId 
                ? { ...conv, last_message_at: new Date().toISOString() }
                : conv
            )
          }
        )

        // Invalidate and refetch messages to get the real message
        queryClient.invalidateQueries({ 
          queryKey: smsKeys.messagesList(context.conversationId) 
        })
      }

      setSending(false)
    },
    onError: (error, variables, context) => {
      // Remove optimistic message on error
      if (context) {
        removeOptimisticMessage(context.tempId)
      }
      
      setSending(false)
      toast.error(error.message || 'Failed to send message')
    },
  })
}

// Mark messages as read
export function useMarkAsRead() {
  const { supabase } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageIds, conversationId }: { messageIds?: string[], conversationId?: string }) => {
      const response = await fetch('/api/sms/read-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds, conversationId })
      })

      if (!response.ok) {
        throw new Error('Failed to mark as read')
      }

      return response.json()
    },
    onSuccess: (_, { conversationId }) => {
      // Invalidate unread counts - real-time subscriptions will handle the updates
      queryClient.invalidateQueries({ queryKey: smsKeys.unreadCounts() })
      
      // If marking conversation as read, update conversation list
      if (conversationId) {
        queryClient.setQueryData(
          smsKeys.conversationsList(),
          (old: Conversation[] | undefined) => {
            if (!old) return old
            return old.map(conv => 
              conv.id === conversationId 
                ? { ...conv, unread_count: 0 }
                : conv
            )
          }
        )
      }
    },
  })
}

// Fetch unread counts
// NOTE: Consider using the new useUnreadCounts hook from '@/lib/hooks/useUnreadCounts'
// which uses realtime subscriptions instead of polling
export function useUnreadCounts() {
  const { user } = useAuth()

  return useQuery({
    queryKey: smsKeys.unreadCounts(),
    queryFn: async () => {
      const response = await fetch('/api/sms/read-status?type=total')
      if (!response.ok) {
        throw new Error('Failed to fetch unread counts')
      }
      return response.json()
    },
    enabled: !!user,
    staleTime: Infinity, // Never auto-refetch - rely on realtime subscriptions
    // NO refetchInterval - realtime subscriptions handle all updates
  })
}

// Search result type
export interface MessageSearchResult {
  messageId: string
  conversationId: string
  messageBody: string
  direction: string
  fromNumber: string
  toNumber: string
  createdAt: string
  contactName: string | null
  contactPhone: string
  rank: number
}

// Full-text search across SMS messages
export function useMessageSearch(query: string, options?: { enabled?: boolean }) {
  const { user } = useAuth()

  return useQuery({
    queryKey: smsKeys.search(query),
    queryFn: async (): Promise<{
      results: MessageSearchResult[]
      total: number
      hasMore: boolean
    }> => {
      if (!query || query.length < 2) {
        return { results: [], total: 0, hasMore: false }
      }

      const response = await fetch(`/api/sms/search?q=${encodeURIComponent(query)}`)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Search failed')
      }

      const data = await response.json()
      return {
        results: data.results,
        total: data.total,
        hasMore: data.hasMore
      }
    },
    enabled: !!user && (options?.enabled !== false) && query.length >= 2,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
    placeholderData: (previousData) => previousData, // Keep showing previous results while fetching
  })
}

// Archive conversation
export function useArchiveConversation() {
  const { supabase } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('sms_conversations')
        .update({ status: 'archived' })
        .eq('id', conversationId)

      if (error) throw error
    },
    onSuccess: () => {
      // Invalidate conversation lists
      queryClient.invalidateQueries({ queryKey: smsKeys.conversations() })
      toast.success('Conversation archived')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to archive conversation')
    },
  })
}

// Delete conversation
export function useDeleteConversation() {
  const { supabase } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (conversationId: string) => {
      // First delete all messages
      await supabase
        .from('sms_messages')
        .delete()
        .eq('conversation_id', conversationId)

      // Then delete the conversation
      const { error } = await supabase
        .from('sms_conversations')
        .delete()
        .eq('id', conversationId)

      if (error) throw error
    },
    onSuccess: () => {
      // Invalidate conversation lists
      queryClient.invalidateQueries({ queryKey: smsKeys.conversations() })
      toast.success('Conversation deleted')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete conversation')
    },
  })
}

// Claim conversation
export function useClaimConversation() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from('sms_conversations')
        .update({ assigned_agent_id: user?.id })
        .eq('id', conversationId)

      if (error) throw error
    },
    onSuccess: () => {
      // Invalidate conversation lists
      queryClient.invalidateQueries({ queryKey: smsKeys.conversations() })
      toast.success('Conversation claimed')
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to claim conversation')
    },
  })
}

// Fetch reactions for a conversation
export interface ReactionData {
  messageId: string
  reactions: Record<string, number>
  userReactions: string[]
  reactionDetails: {
    id: string
    userId: string
    reaction: string
    userName: string
    createdAt: string
  }[]
}

export function useConversationReactions(conversationId: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: smsKeys.conversationReactions(conversationId),
    queryFn: async (): Promise<Record<string, ReactionData>> => {
      const response = await fetch(`/api/sms/reactions?conversationId=${conversationId}`)
      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to fetch reactions')
      }

      const data = await response.json()

      // Transform array into a map keyed by messageId
      const reactionsMap: Record<string, ReactionData> = {}
      if (data.reactions) {
        for (const r of data.reactions) {
          reactionsMap[r.messageId] = r
        }
      }
      return reactionsMap
    },
    enabled: !!user && !!conversationId,
    staleTime: 1000 * 60, // Cache for 1 minute
    refetchOnWindowFocus: false,
  })
}

// Add reaction mutation
export function useAddReaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, reaction, conversationId }: {
      messageId: string
      reaction: string
      conversationId: string
    }) => {
      const response = await fetch('/api/sms/reactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, reaction })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add reaction')
      }

      return response.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: smsKeys.conversationReactions(variables.conversationId)
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to add reaction')
    },
  })
}

// Remove reaction mutation
export function useRemoveReaction() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ messageId, reaction, conversationId }: {
      messageId: string
      reaction: string
      conversationId: string
    }) => {
      const response = await fetch(
        `/api/sms/reactions?messageId=${messageId}&reaction=${encodeURIComponent(reaction)}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to remove reaction')
      }

      return response.json()
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: smsKeys.conversationReactions(variables.conversationId)
      })
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to remove reaction')
    },
  })
}