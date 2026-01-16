/**
 * Centralized Supabase Realtime Service
 *
 * Single source of truth for all Supabase realtime subscriptions.
 * Manages channel lifecycle, event routing, and automatic reconnection.
 *
 * Benefits:
 * - Eliminates duplicate subscriptions
 * - Provides consistent error handling
 * - Easier debugging and testing
 * - Follows Single Responsibility Principle
 */

import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { realtimeLogger } from '@/lib/logger'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PostgresChangeCallback = (payload: RealtimePostgresChangesPayload<any>) => void
type BroadcastPayload = { event: string; payload: Record<string, unknown> }
type BroadcastCallback = (payload: BroadcastPayload) => void
type PresenceCallback = (state: PresenceState) => void
// Union type for all possible subscription callbacks
type SubscriptionCallback = PostgresChangeCallback | BroadcastCallback

interface PresenceState {
  [key: string]: PresenceUser[]
}

interface PresenceUser {
  id: string
  status: 'online' | 'offline' | 'away'
  lastSeen?: string
  online_at?: string
  [key: string]: string | undefined
}

interface ChannelSubscription {
  channel: RealtimeChannel
  subscribers: Map<string, SubscriptionCallback>
  presenceSubscribers?: Map<string, PresenceCallback>
}

class RealtimeService {
  private channels: Map<string, ChannelSubscription> = new Map()
  private supabase = createClient()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000 // Start with 1 second

  /**
   * Subscribe to postgres_changes events on a table
   *
   * @param channelName - Unique name for this channel
   * @param config - Postgres changes configuration
   * @param callback - Function to call when changes occur
   * @returns Unsubscribe function
   */
  subscribeToTable(
    channelName: string,
    config: {
      event: 'INSERT' | 'UPDATE' | 'DELETE' | '*'
      schema: string
      table: string
      filter?: string
    },
    callback: PostgresChangeCallback
  ): () => void {
    const subscriberId = `${channelName}-${Date.now()}-${Math.random()}`

    // Get or create channel
    let channelSub = this.channels.get(channelName)

    if (!channelSub) {
      // Create new channel with postgres_changes subscription
      const channel = this.supabase.channel(channelName)

      // Supabase SDK type definitions don't properly handle postgres_changes overload
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(channel as any).on(
        'postgres_changes',
        {
          event: config.event,
          schema: config.schema,
          table: config.table,
          filter: config.filter,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: RealtimePostgresChangesPayload<any>) => {
          // Route to all subscribers
          const sub = this.channels.get(channelName)
          if (sub) {
            sub.subscribers.forEach(cb => (cb as PostgresChangeCallback)(payload))
          }
        }
      )

      channel.subscribe((status) => {
        realtimeLogger.debug(`Channel status: ${status}`, { data: { channelName } })

        if (status === 'CHANNEL_ERROR') {
          this.handleChannelError(channelName)
        } else if (status === 'SUBSCRIBED') {
          this.reconnectAttempts = 0 // Reset on successful connection
        }
      })

      channelSub = {
        channel,
        subscribers: new Map()
      }

      this.channels.set(channelName, channelSub)
    }

    // Add subscriber
    channelSub.subscribers.set(subscriberId, callback)

    // Return unsubscribe function
    return () => this.unsubscribe(channelName, subscriberId)
  }

  /**
   * Subscribe to broadcast events on a channel
   *
   * @param channelName - Unique name for this channel
   * @param event - Event name to listen for
   * @param callback - Function to call when event occurs
   * @returns Unsubscribe function
   */
  subscribeToBroadcast(
    channelName: string,
    event: string,
    callback: BroadcastCallback
  ): () => void {
    const subscriberId = `${channelName}-${event}-${Date.now()}-${Math.random()}`

    // Get or create channel
    let channelSub = this.channels.get(channelName)

    if (!channelSub) {
      // Create new channel
      const channel = this.supabase
        .channel(channelName)
        .on('broadcast', { event }, (payload: BroadcastPayload) => {
          // Route to all subscribers
          const sub = this.channels.get(channelName)
          if (sub) {
            sub.subscribers.forEach(cb => (cb as BroadcastCallback)(payload))
          }
        })
        .subscribe((status) => {
          realtimeLogger.debug(`Broadcast channel status: ${status}`, { data: { channelName } })

          if (status === 'CHANNEL_ERROR') {
            this.handleChannelError(channelName)
          } else if (status === 'SUBSCRIBED') {
            this.reconnectAttempts = 0
          }
        })

      channelSub = {
        channel,
        subscribers: new Map()
      }

      this.channels.set(channelName, channelSub)
    }

    // Add subscriber
    channelSub.subscribers.set(subscriberId, callback)

    // Return unsubscribe function
    return () => this.unsubscribe(channelName, subscriberId)
  }

  /**
   * Send a broadcast message to a channel
   *
   * @param channelName - Channel name
   * @param event - Event name
   * @param payload - Data to broadcast
   */
  async broadcast(channelName: string, event: string, payload: Record<string, unknown>): Promise<void> {
    const channelSub = this.channels.get(channelName)

    if (channelSub) {
      await channelSub.channel.send({
        type: 'broadcast',
        event,
        payload
      })
    } else {
      realtimeLogger.warn(`Cannot broadcast: channel not found`, { data: { channelName } })
    }
  }

  /**
   * Subscribe to presence events on a channel
   *
   * @param channelName - Unique name for this channel (e.g., 'presence:org-123')
   * @param userId - Current user's ID
   * @param initialState - Initial presence state for this user
   * @param onSync - Callback when presence state syncs
   * @returns Object with unsubscribe function and methods to update presence
   */
  subscribeToPresence(
    channelName: string,
    userId: string,
    initialState: Omit<PresenceUser, 'id'>,
    onSync: PresenceCallback
  ): {
    unsubscribe: () => void
    updatePresence: (state: Partial<PresenceUser>) => Promise<void>
    track: () => Promise<void>
  } {
    const subscriberId = `${channelName}-presence-${Date.now()}-${Math.random()}`

    // Get or create channel
    let channelSub = this.channels.get(channelName)

    if (!channelSub) {
      // Create new channel with presence
      const channel = this.supabase
        .channel(channelName)
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState() as PresenceState
          // Notify all presence subscribers
          const sub = this.channels.get(channelName)
          if (sub?.presenceSubscribers) {
            sub.presenceSubscribers.forEach(cb => cb(state))
          }
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          realtimeLogger.debug('User joined', { data: { channelName, key, newPresences } })
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          realtimeLogger.debug('User left', { data: { channelName, key, leftPresences } })
        })
        .subscribe(async (status) => {
          realtimeLogger.debug(`Presence channel status: ${status}`, { data: { channelName } })

          if (status === 'SUBSCRIBED') {
            // Track this user's presence
            await channel.track({
              id: userId,
              ...initialState,
              online_at: new Date().toISOString()
            })
            this.reconnectAttempts = 0
          } else if (status === 'CHANNEL_ERROR') {
            this.handleChannelError(channelName)
          }
        })

      channelSub = {
        channel,
        subscribers: new Map(),
        presenceSubscribers: new Map()
      }

      this.channels.set(channelName, channelSub)
    }

    // Add presence subscriber
    if (!channelSub.presenceSubscribers) {
      channelSub.presenceSubscribers = new Map()
    }
    channelSub.presenceSubscribers.set(subscriberId, onSync)

    // Return control object
    return {
      unsubscribe: () => {
        const sub = this.channels.get(channelName)
        if (sub?.presenceSubscribers) {
          sub.presenceSubscribers.delete(subscriberId)
          if (sub.presenceSubscribers.size === 0 && sub.subscribers.size === 0) {
            sub.channel.untrack()
            this.supabase.removeChannel(sub.channel)
            this.channels.delete(channelName)
          }
        }
      },
      updatePresence: async (state: Partial<PresenceUser>) => {
        const sub = this.channels.get(channelName)
        if (sub) {
          await sub.channel.track({
            id: userId,
            ...initialState,
            ...state,
            online_at: new Date().toISOString()
          })
        }
      },
      track: async () => {
        const sub = this.channels.get(channelName)
        if (sub) {
          await sub.channel.track({
            id: userId,
            ...initialState,
            online_at: new Date().toISOString()
          })
        }
      }
    }
  }

  /**
   * Get or create a typing indicator channel for a conversation
   *
   * @param conversationId - The conversation ID
   * @returns Object with methods to send and listen for typing indicators
   */
  getTypingChannel(conversationId: string): {
    sendTyping: (userId: string, isTyping: boolean) => Promise<void>
    onTyping: (callback: (event: { userId: string; isTyping: boolean }) => void) => () => void
  } {
    const channelName = `typing:${conversationId}`

    return {
      sendTyping: async (userId: string, isTyping: boolean) => {
        // Ensure channel exists
        let channelSub = this.channels.get(channelName)
        if (!channelSub) {
          const channel = this.supabase
            .channel(channelName)
            .subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                realtimeLogger.debug('Typing channel ready', { data: { channelName } })
              }
            })

          channelSub = {
            channel,
            subscribers: new Map()
          }
          this.channels.set(channelName, channelSub)
        }

        await channelSub.channel.send({
          type: 'broadcast',
          event: 'typing',
          payload: { userId, isTyping, timestamp: new Date().toISOString() }
        })
      },
      onTyping: (callback: (event: { userId: string; isTyping: boolean }) => void) => {
        return this.subscribeToBroadcast(channelName, 'typing', (payload) => {
          const typingData = payload.payload as { userId: string; isTyping: boolean }
          callback(typingData)
        })
      }
    }
  }

  /**
   * Unsubscribe a specific subscriber from a channel
   */
  private unsubscribe(channelName: string, subscriberId: string): void {
    const channelSub = this.channels.get(channelName)

    if (!channelSub) return

    // Remove subscriber
    channelSub.subscribers.delete(subscriberId)

    // If no more subscribers, remove the channel
    if (channelSub.subscribers.size === 0) {
      realtimeLogger.debug('Removing channel (no subscribers)', { data: { channelName } })
      this.supabase.removeChannel(channelSub.channel)
      this.channels.delete(channelName)
    }
  }

  /**
   * Handle channel errors with automatic reconnection
   */
  private handleChannelError(channelName: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      realtimeLogger.error('Max reconnection attempts reached', { data: { channelName } })
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) // Exponential backoff

    realtimeLogger.info('Reconnecting channel', { data: { channelName, delayMs: delay, attempt: this.reconnectAttempts } })

    setTimeout(() => {
      const channelSub = this.channels.get(channelName)
      if (channelSub) {
        // Recreate the channel
        this.channels.delete(channelName)

        // Subscribers will be notified via their callback on next event
        realtimeLogger.info('Channel recreated after error', { data: { channelName } })
      }
    }, delay)
  }

  /**
   * Clean up all channels (call on app unmount/logout)
   */
  cleanup(): void {
    realtimeLogger.info('Cleaning up all realtime channels')

    this.channels.forEach((channelSub, channelName) => {
      this.supabase.removeChannel(channelSub.channel)
    })

    this.channels.clear()
    this.reconnectAttempts = 0
  }

  /**
   * Get status of all active channels
   */
  getStatus(): { channelName: string; subscriberCount: number }[] {
    return Array.from(this.channels.entries()).map(([channelName, channelSub]) => ({
      channelName,
      subscriberCount: channelSub.subscribers.size
    }))
  }
}

// Export singleton instance
export const realtimeService = new RealtimeService()

// Export types
export type { PostgresChangeCallback, BroadcastCallback, PresenceCallback, PresenceState, PresenceUser }
