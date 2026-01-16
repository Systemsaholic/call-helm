// Client-safe SignalWire implementation that uses API endpoints
// Uses Supabase Realtime for typing indicators and presence
import { EventEmitter } from 'events'
import { realtimeService, type PresenceState } from '@/lib/services/realtimeService'

export interface TypingEvent {
  conversationId: string
  userId: string
  isTyping: boolean
}

export interface MessageStatusEvent {
  messageId: string
  status: 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
}

export interface PresenceEvent {
  userId: string
  status: 'online' | 'offline' | 'away'
  lastSeen?: string
}

export interface IncomingMessageEvent {
  id: string
  conversationId: string
  from: string
  to: string
  body: string
  media?: string[]
  timestamp: string
}

class ClientSafeSignalWireClient extends EventEmitter {
  private static instance: ClientSafeSignalWireClient | null = null
  private isConnected: boolean = false
  private typingTimers: Map<string, NodeJS.Timeout> = new Map()
  private typingUnsubscribers: Map<string, () => void> = new Map()
  private config: any = null
  private currentUserId: string | null = null
  private presenceControl: {
    unsubscribe: () => void
    updatePresence: (state: any) => Promise<void>
  } | null = null

  private constructor() {
    super()
  }

  public static getInstance(): ClientSafeSignalWireClient {
    if (!ClientSafeSignalWireClient.instance) {
      ClientSafeSignalWireClient.instance = new ClientSafeSignalWireClient()
    }
    return ClientSafeSignalWireClient.instance
  }

  public async connect(projectId: string, token: string, topics: string[] = ['office'], userId?: string): Promise<void> {
    if (this.isConnected) {
      console.log('SignalWire client already connected')
      return
    }

    try {
      // Store config for later use
      this.config = { projectId, token, topics }
      this.currentUserId = userId || null

      // Set up presence tracking if we have a user ID and organization context
      if (userId && projectId) {
        const presenceChannelName = `presence:${projectId}`

        this.presenceControl = realtimeService.subscribeToPresence(
          presenceChannelName,
          userId,
          { status: 'online' },
          (state: PresenceState) => {
            // Emit presence updates for all users
            Object.entries(state).forEach(([key, users]) => {
              users.forEach(user => {
                this.emit('presence', {
                  userId: user.id,
                  status: user.status || 'online',
                  lastSeen: user.online_at
                })
              })
            })
          }
        )
      }

      this.isConnected = true
      this.emit('connected')

      console.log('SignalWire client connected (using Supabase Realtime)')
    } catch (error) {
      console.error('Failed to connect SignalWire client:', error)
      this.emit('error', error)
      throw error
    }
  }

  public async sendMessage(to: string, from: string, body: string, conversationId?: string, mediaUrls?: string[]): Promise<any> {
    // Use the REST API endpoint
    try {
      const response = await fetch('/api/sms/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          from,
          message: body,
          conversationId,
          mediaUrls
        })
      })

      if (!response.ok) {
        throw new Error('Failed to send message')
      }

      return await response.json()
    } catch (error) {
      console.error('Failed to send message:', error)
      throw error
    }
  }

  public async sendTypingIndicator(conversationId: string, userId: string, isTyping: boolean): Promise<void> {
    try {
      // Clear existing typing timer for this conversation
      const timerKey = `${conversationId}-${userId}`
      if (this.typingTimers.has(timerKey)) {
        clearTimeout(this.typingTimers.get(timerKey)!)
        this.typingTimers.delete(timerKey)
      }

      // Send typing indicator via Supabase Realtime broadcast
      const typingChannel = realtimeService.getTypingChannel(conversationId)
      await typingChannel.sendTyping(userId, isTyping)

      // Also emit locally for immediate feedback
      this.emit('typing', {
        conversationId,
        userId,
        isTyping
      })

      // Auto-stop typing after 5 seconds if typing is true
      if (isTyping) {
        const timer = setTimeout(() => {
          this.sendTypingIndicator(conversationId, userId, false)
          this.typingTimers.delete(timerKey)
        }, 5000)
        this.typingTimers.set(timerKey, timer)
      }
    } catch (error) {
      console.error('Failed to send typing indicator:', error)
    }
  }

  /**
   * Subscribe to typing indicators for a conversation
   * @returns Unsubscribe function
   */
  public subscribeToTyping(conversationId: string, callback: (event: TypingEvent) => void): () => void {
    const typingChannel = realtimeService.getTypingChannel(conversationId)
    return typingChannel.onTyping((event) => {
      callback({
        conversationId,
        userId: event.userId,
        isTyping: event.isTyping
      })
    })
  }

  public async updatePresence(userId: string, status: 'online' | 'offline' | 'away'): Promise<void> {
    try {
      // Update presence via Supabase Realtime presence
      if (this.presenceControl) {
        await this.presenceControl.updatePresence({
          status,
          lastSeen: new Date().toISOString()
        })
      }

      // Also emit locally for immediate feedback
      this.emit('presence', {
        userId,
        status,
        lastSeen: new Date().toISOString()
      })
    } catch (error) {
      console.error('Failed to update presence:', error)
    }
  }

  public disconnect(): void {
    console.log('Disconnecting SignalWire client...')

    // Clear typing timers
    this.typingTimers.forEach(timer => clearTimeout(timer))
    this.typingTimers.clear()

    // Unsubscribe from typing channels
    this.typingUnsubscribers.forEach(unsub => unsub())
    this.typingUnsubscribers.clear()

    // Clean up presence subscription
    if (this.presenceControl) {
      this.presenceControl.unsubscribe()
      this.presenceControl = null
    }

    this.currentUserId = null
    this.isConnected = false
    this.emit('disconnected')

    console.log('SignalWire client disconnected')
  }

  public getConnectionStatus(): boolean {
    return this.isConnected
  }
}

export default ClientSafeSignalWireClient.getInstance()