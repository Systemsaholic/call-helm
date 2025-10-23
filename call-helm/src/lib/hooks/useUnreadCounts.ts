/**
 * Unread Message Counts Hook
 *
 * Manages unread message counts via Supabase realtime.
 * Follows Single Responsibility Principle - ONLY handles state.
 *
 * No side effects:
 * - No notifications
 * - No audio
 * - No polling
 * - No localStorage
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { useNewMessageSubscription, useReadStatusSubscription } from './useRealtimeSubscription'

interface UnreadCounts {
  totalUnread: number
  conversationsWithUnread: number
}

interface ConversationUnread {
  conversation_id: string
  phone_number: string
  display_name: string | null
  unread_count: number
  last_message_at: string
}

/**
 * Hook for tracking unread message counts
 *
 * @returns Unread counts, conversation unreads, and refresh function
 */
export function useUnreadCounts() {
  const { user } = useAuth()
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({
    totalUnread: 0,
    conversationsWithUnread: 0
  })
  const [conversationUnreads, setConversationUnreads] = useState<ConversationUnread[]>([])
  const [loading, setLoading] = useState(true)
  const [organizationId, setOrganizationId] = useState<string | null>(null)

  // Fetch organization ID
  useEffect(() => {
    if (!user) {
      setOrganizationId(null)
      return
    }

    const getOrganization = async () => {
      try {
        const response = await fetch('/api/sms/read-status?type=organization')
        if (response.ok) {
          const data = await response.json()
          setOrganizationId(data.organizationId)
        }
      } catch (error) {
        console.error('Error fetching organization:', error)
      }
    }

    getOrganization()
  }, [user])

  // Fetch total unread count
  const fetchUnreadCount = useCallback(async () => {
    if (!user) return

    try {
      const response = await fetch('/api/sms/read-status?type=total')
      if (response.ok) {
        const data = await response.json()
        setUnreadCounts({
          totalUnread: data.totalUnread || 0,
          conversationsWithUnread: data.conversationsWithUnread || 0
        })
      }
    } catch (error) {
      console.error('Error fetching unread count:', error)
    } finally {
      setLoading(false)
    }
  }, [user])

  // Fetch unread counts by conversation
  const fetchConversationUnreads = useCallback(async () => {
    if (!user) return

    try {
      const response = await fetch('/api/sms/read-status?type=by-conversation')
      if (response.ok) {
        const data = await response.json()
        setConversationUnreads(data.conversations || [])
      }
    } catch (error) {
      console.error('Error fetching conversation unreads:', error)
    }
  }, [user])

  // Initial fetch on mount
  useEffect(() => {
    if (!user) return

    fetchUnreadCount()
    fetchConversationUnreads()
  }, [user, fetchUnreadCount, fetchConversationUnreads])

  // Subscribe to new messages - refresh counts when new message arrives
  useNewMessageSubscription(
    organizationId,
    useCallback((payload) => {
      console.log('📨 New message detected, refreshing unread counts')
      // Only refresh if it's an inbound message
      if (payload.new && payload.new.direction === 'inbound') {
        fetchUnreadCount()
        fetchConversationUnreads()
      }
    }, [fetchUnreadCount, fetchConversationUnreads]),
    !!user && !!organizationId
  )

  // Subscribe to read status changes - refresh counts when status changes
  useReadStatusSubscription(
    useCallback((payload) => {
      console.log('📖 Read status changed, refreshing unread counts')
      fetchUnreadCount()
      fetchConversationUnreads()
    }, [fetchUnreadCount, fetchConversationUnreads]),
    !!user
  )

  // Mark messages as read
  const markAsRead = useCallback(async (messageIds?: string[], conversationId?: string) => {
    try {
      const response = await fetch('/api/sms/read-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messageIds,
          conversationId
        })
      })

      if (response.ok) {
        // Realtime subscriptions will handle the update
        // But we can optimistically update the UI
        if (conversationId) {
          setConversationUnreads(prev =>
            prev.filter(c => c.conversation_id !== conversationId)
          )
        }
      }
    } catch (error) {
      console.error('Error marking as read:', error)
    }
  }, [])

  // Mark conversation as read
  const markConversationAsRead = useCallback(async (conversationId: string) => {
    return markAsRead(undefined, conversationId)
  }, [markAsRead])

  return {
    unreadCounts,
    conversationUnreads,
    loading,
    markAsRead,
    markConversationAsRead,
    refreshUnreadCounts: fetchUnreadCount
  }
}
