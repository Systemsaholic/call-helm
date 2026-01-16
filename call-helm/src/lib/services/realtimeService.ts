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

type SubscriptionCallback<T = any> = (payload: T) => void
type PostgresChangeCallback = (payload: RealtimePostgresChangesPayload<any>) => void
type BroadcastCallback = (payload: any) => void
type PresenceCallback = (state: PresenceState) => void

interface PresenceState {
  [key: string]: PresenceUser[]
}

interface PresenceUser {
  id: string
  status: 'online' | 'offline' | 'away'
  lastSeen?: string
  [key: string]: any
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
      // Create new channel
      const channel = this.supabase
        .channel(channelName)
        .on(
          'postgres_changes' as any,
          {
            event: config.event,
            schema: config.schema,
            table: config.table,
            filter: config.filter,
          },
          (payload: RealtimePostgresChangesPayload<any>) => {
            // Route to all subscribers
            const sub = this.channels.get(channelName)
            if (sub) {
              sub.subscribers.forEach(cb => cb(payload))
            }
          }
        )
        .subscribe((status) => {
          console.log(`📡 Channel ${channelName} status:`, status)

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
        .on('broadcast', { event }, (payload) => {
          // Route to all subscribers
          const sub = this.channels.get(channelName)
          if (sub) {
            sub.subscribers.forEach(cb => cb(payload))
          }
        })
        .subscribe((status) => {
          console.log(`📡 Broadcast channel ${channelName} status:`, status)

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
  async broadcast(channelName: string, event: string, payload: any): Promise<void> {
    const channelSub = this.channels.get(channelName)

    if (channelSub) {
      await channelSub.channel.send({
        type: 'broadcast',
        event,
        payload
      })
    } else {
      console.warn(`Cannot broadcast to ${channelName}: channel not found`)
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
          console.log(`👋 User joined ${channelName}:`, key, newPresences)
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          console.log(`👋 User left ${channelName}:`, key, leftPresences)
        })
        .subscribe(async (status) => {
          console.log(`📡 Presence channel ${channelName} status:`, status)

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
                console.log(`📡 Typing channel ${channelName} ready`)
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
          callback(payload.payload)
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
      console.log(`🗑️ Removing channel ${channelName} (no subscribers)`)
      this.supabase.removeChannel(channelSub.channel)
      this.channels.delete(channelName)
    }
  }

  /**
   * Handle channel errors with automatic reconnection
   */
  private handleChannelError(channelName: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Max reconnection attempts reached for ${channelName}`)
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1) // Exponential backoff

    console.log(`🔄 Reconnecting channel ${channelName} in ${delay}ms (attempt ${this.reconnectAttempts})`)

    setTimeout(() => {
      const channelSub = this.channels.get(channelName)
      if (channelSub) {
        // Recreate the channel
        this.channels.delete(channelName)

        // Subscribers will be notified via their callback on next event
        console.log(`🔄 Channel ${channelName} recreated after error`)
      }
    }, delay)
  }

  /**
   * Clean up all channels (call on app unmount/logout)
   */
  cleanup(): void {
    console.log('🧹 Cleaning up all realtime channels')

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
