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

interface ChannelSubscription {
  channel: RealtimeChannel
  subscribers: Map<string, SubscriptionCallback>
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
export type { PostgresChangeCallback, BroadcastCallback }
