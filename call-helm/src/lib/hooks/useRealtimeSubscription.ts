/**
 * Realtime Subscription Hooks
 *
 * Clean React hooks for subscribing to Supabase realtime events.
 * Uses the centralized realtimeService for all subscriptions.
 *
 * Benefits:
 * - Simple, declarative API
 * - Automatic cleanup on unmount
 * - Type-safe event handlers
 * - No duplicate subscriptions
 * - Uses centralized service (DRY principle)
 */

'use client'

import { useEffect, useCallback } from 'react'
import { realtimeService } from '@/lib/services/realtimeService'
import type { PostgresChangeCallback, BroadcastCallback } from '@/lib/services/realtimeService'

/**
 * Subscribe to INSERT events on sms_messages table for an organization
 *
 * @param organizationId - Organization to filter messages for
 * @param onNewMessage - Callback when new message is inserted
 * @param enabled - Whether subscription is active (default: true)
 */
export function useNewMessageSubscription(
  organizationId: string | null | undefined,
  onNewMessage: PostgresChangeCallback,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled || !organizationId) return

    console.log(`📨 Subscribing to new messages for org: ${organizationId}`)

    const unsubscribe = realtimeService.subscribeToTable(
      `sms-messages-${organizationId}`,
      {
        event: 'INSERT',
        schema: 'public',
        table: 'sms_messages',
        filter: `organization_id=eq.${organizationId}`
      },
      onNewMessage
    )

    return () => {
      console.log(`📨 Unsubscribing from new messages for org: ${organizationId}`)
      unsubscribe()
    }
  }, [organizationId, onNewMessage, enabled])
}

/**
 * Subscribe to changes on message_read_status table
 *
 * @param onReadStatusChange - Callback when read status changes
 * @param enabled - Whether subscription is active (default: true)
 */
export function useReadStatusSubscription(
  onReadStatusChange: PostgresChangeCallback,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return

    console.log('📖 Subscribing to read status changes')

    const unsubscribe = realtimeService.subscribeToTable(
      'message-read-status',
      {
        event: '*', // INSERT, UPDATE, DELETE
        schema: 'public',
        table: 'message_read_status'
      },
      onReadStatusChange
    )

    return () => {
      console.log('📖 Unsubscribing from read status changes')
      unsubscribe()
    }
  }, [onReadStatusChange, enabled])
}

/**
 * Subscribe to read status changes for a specific conversation
 *
 * @param conversationId - Conversation to filter for
 * @param onReadStatusChange - Callback when read status changes
 * @param enabled - Whether subscription is active (default: true)
 */
export function useConversationReadStatusSubscription(
  conversationId: string | null | undefined,
  onReadStatusChange: PostgresChangeCallback,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled || !conversationId) return

    console.log(`📖 Subscribing to read status for conversation: ${conversationId}`)

    const unsubscribe = realtimeService.subscribeToTable(
      `read-status-${conversationId}`,
      {
        event: '*',
        schema: 'public',
        table: 'message_read_status',
        filter: `conversation_id=eq.${conversationId}`
      },
      onReadStatusChange
    )

    return () => {
      console.log(`📖 Unsubscribing from read status for conversation: ${conversationId}`)
      unsubscribe()
    }
  }, [conversationId, onReadStatusChange, enabled])
}

/**
 * Subscribe to typing indicator broadcasts
 *
 * @param conversationId - Conversation to listen for typing in
 * @param onTyping - Callback when someone types
 * @param enabled - Whether subscription is active (default: true)
 */
export function useTypingSubscription(
  conversationId: string | null | undefined,
  onTyping: BroadcastCallback,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled || !conversationId) return

    console.log(`⌨️ Subscribing to typing indicators for conversation: ${conversationId}`)

    const unsubscribe = realtimeService.subscribeToBroadcast(
      `typing-${conversationId}`,
      'typing',
      onTyping
    )

    return () => {
      console.log(`⌨️ Unsubscribing from typing indicators for conversation: ${conversationId}`)
      unsubscribe()
    }
  }, [conversationId, onTyping, enabled])
}

/**
 * Send a typing indicator broadcast
 *
 * @param conversationId - Conversation ID
 * @param userId - User ID who is typing
 * @param isTyping - Whether user is currently typing
 */
export async function sendTypingIndicator(
  conversationId: string,
  userId: string,
  isTyping: boolean
): Promise<void> {
  await realtimeService.broadcast(`typing-${conversationId}`, 'typing', {
    conversationId,
    userId,
    isTyping,
    timestamp: new Date().toISOString()
  })
}

/**
 * Subscribe to messages for a specific conversation
 *
 * @param conversationId - Conversation to listen for messages in
 * @param onMessage - Callback when message is added/updated
 * @param enabled - Whether subscription is active (default: true)
 */
export function useConversationMessagesSubscription(
  conversationId: string | null | undefined,
  onMessage: PostgresChangeCallback,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled || !conversationId) return

    console.log(`💬 Subscribing to messages for conversation: ${conversationId}`)

    const unsubscribe = realtimeService.subscribeToTable(
      `messages-${conversationId}`,
      {
        event: '*',
        schema: 'public',
        table: 'sms_messages',
        filter: `conversation_id=eq.${conversationId}`
      },
      onMessage
    )

    return () => {
      console.log(`💬 Unsubscribing from messages for conversation: ${conversationId}`)
      unsubscribe()
    }
  }, [conversationId, onMessage, enabled])
}

/**
 * Subscribe to conversation updates
 *
 * @param organizationId - Organization to filter conversations for
 * @param onConversationChange - Callback when conversation changes
 * @param enabled - Whether subscription is active (default: true)
 */
export function useConversationUpdatesSubscription(
  organizationId: string | null | undefined,
  onConversationChange: PostgresChangeCallback,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled || !organizationId) return

    console.log(`💼 Subscribing to conversation updates for org: ${organizationId}`)

    const unsubscribe = realtimeService.subscribeToTable(
      `conversations-${organizationId}`,
      {
        event: '*',
        schema: 'public',
        table: 'sms_conversations',
        filter: `organization_id=eq.${organizationId}`
      },
      onConversationChange
    )

    return () => {
      console.log(`💼 Unsubscribing from conversation updates for org: ${organizationId}`)
      unsubscribe()
    }
  }, [organizationId, onConversationChange, enabled])
}

/**
 * Get realtime service status (useful for debugging)
 */
export function useRealtimeStatus() {
  return realtimeService.getStatus()
}
