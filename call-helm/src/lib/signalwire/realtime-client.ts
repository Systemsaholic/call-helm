import { SignalWire } from '@signalwire/realtime-api'
import type { Messaging, PubSub } from '@signalwire/realtime-api'
import { EventEmitter } from 'events'

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

class SignalWireRealtimeClient extends EventEmitter {
  private static instance: SignalWireRealtimeClient | null = null
  private client: any = null
  private messagingClient: any | null = null
  private pubSubClient: any | null = null
  private isConnected: boolean = false
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 10
  private reconnectDelay: number = 1000
  private reconnectTimer: NodeJS.Timeout | null = null
  private typingTimers: Map<string, NodeJS.Timeout> = new Map()
  private heartbeatInterval: NodeJS.Timeout | null = null

  private constructor() {
    super()
  }

  public static getInstance(): SignalWireRealtimeClient {
    if (!SignalWireRealtimeClient.instance) {
      SignalWireRealtimeClient.instance = new SignalWireRealtimeClient()
    }
    return SignalWireRealtimeClient.instance
  }

  public async connect(projectId: string, token: string, topics: string[] = ['office']): Promise<void> {
    if (this.isConnected) {
      console.log('SignalWire Realtime already connected')
      return
    }

    try {
      console.log('Connecting to SignalWire Realtime...')
      
      // Initialize the main client
      this.client = await SignalWire({
        project: projectId,
        token: token
      } as any)

      // Get messaging client
      this.messagingClient = this.client.messaging
      
      // Get PubSub client for typing indicators
      this.pubSubClient = this.client.pubSub

      // Set up message listeners
      await this.setupMessageListeners()
      
      // Set up PubSub listeners for typing indicators
      await this.setupPubSubListeners()

      // Start heartbeat
      this.startHeartbeat()

      this.isConnected = true
      this.reconnectAttempts = 0
      this.emit('connected')
      
      console.log('SignalWire Realtime connected successfully')
    } catch (error) {
      console.error('Failed to connect to SignalWire Realtime:', error)
      this.handleConnectionError()
      throw error
    }
  }

  private async setupMessageListeners(): Promise<void> {
    if (!this.messagingClient) return

    try {
      // Listen for incoming messages
      await this.messagingClient.listen({
        topics: ['office'],
        onMessageReceived: (message: any) => {
          console.log('Message received:', message)
          
          const incomingMessage: IncomingMessageEvent = {
            id: message.id || `temp-${Date.now()}`,
            conversationId: message.context || 'default',
            from: message.from,
            to: message.to,
            body: message.body,
            media: message.media,
            timestamp: new Date().toISOString()
          }
          
          this.emit('message.received', incomingMessage)
        },
        onMessageUpdated: (message: any) => {
          console.log('Message updated:', message)
          
          const statusEvent: MessageStatusEvent = {
            messageId: message.id,
            status: this.mapSignalWireStatus(message.status),
            timestamp: new Date().toISOString()
          }
          
          this.emit('message.status', statusEvent)
        }
      })
    } catch (error) {
      console.error('Failed to setup message listeners:', error)
      throw error
    }
  }

  private async setupPubSubListeners(): Promise<void> {
    if (!this.pubSubClient) return

    try {
      // Subscribe to typing indicators channel
      await this.pubSubClient.listen({
        channels: ['typing-indicators', 'presence'],
        onMessageReceived: (message: any) => {
          console.log('PubSub message received:', message)
          
          if (message.channel === 'typing-indicators') {
            const typingEvent: TypingEvent = message.content
            this.emit('typing', typingEvent)
          } else if (message.channel === 'presence') {
            const presenceEvent: PresenceEvent = message.content
            this.emit('presence', presenceEvent)
          }
        }
      })
    } catch (error) {
      console.error('Failed to setup PubSub listeners:', error)
      throw error
    }
  }

  public async sendMessage(to: string, from: string, body: string, conversationId?: string, mediaUrls?: string[]): Promise<any> {
    if (!this.messagingClient) {
      throw new Error('SignalWire Realtime not connected')
    }

    try {
      const result = await this.messagingClient.send({
        topic: 'office',
        from: from,
        to: to,
        body: body,
        media: mediaUrls
      })

      return result
    } catch (error) {
      console.error('Failed to send message via Realtime:', error)
      throw error
    }
  }

  public async sendTypingIndicator(conversationId: string, userId: string, isTyping: boolean): Promise<void> {
    if (!this.pubSubClient) {
      console.warn('PubSub client not connected for typing indicators')
      return
    }

    try {
      // Clear existing typing timer for this conversation
      const timerKey = `${conversationId}-${userId}`
      if (this.typingTimers.has(timerKey)) {
        clearTimeout(this.typingTimers.get(timerKey)!)
        this.typingTimers.delete(timerKey)
      }

      // Send typing indicator
      await this.pubSubClient.publish({
        channel: 'typing-indicators',
        content: {
          conversationId,
          userId,
          isTyping
        }
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

  public async updatePresence(userId: string, status: 'online' | 'offline' | 'away'): Promise<void> {
    if (!this.pubSubClient) {
      console.warn('PubSub client not connected for presence')
      return
    }

    try {
      await this.pubSubClient.publish({
        channel: 'presence',
        content: {
          userId,
          status,
          lastSeen: new Date().toISOString()
        }
      })
    } catch (error) {
      console.error('Failed to update presence:', error)
    }
  }

  private mapSignalWireStatus(status: string): MessageStatusEvent['status'] {
    const statusMap: { [key: string]: MessageStatusEvent['status'] } = {
      'queued': 'queued',
      'sending': 'sending',
      'sent': 'sent',
      'delivered': 'delivered',
      'read': 'read',
      'failed': 'failed',
      'undelivered': 'failed'
    }
    
    return statusMap[status] || 'queued'
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.isConnected && this.pubSubClient) {
        // Send heartbeat to maintain connection
        this.pubSubClient.publish({
          channel: 'heartbeat',
          content: { timestamp: Date.now() }
        }).catch((error: any) => {
          console.error('Heartbeat failed:', error)
          this.handleConnectionError()
        })
      }
    }, 30000) // Every 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  private handleConnectionError(): void {
    this.isConnected = false
    this.emit('disconnected')
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts), 30000)
      console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`)
      
      this.reconnectTimer = setTimeout(() => {
        this.reconnectAttempts++
        this.reconnect()
      }, delay)
    } else {
      console.error('Max reconnection attempts reached')
      this.emit('error', new Error('Max reconnection attempts reached'))
    }
  }

  private async reconnect(): Promise<void> {
    try {
      // Get credentials from environment or stored config
      const projectId = process.env.SIGNALWIRE_PROJECT_ID || ''
      const token = process.env.SIGNALWIRE_API_TOKEN || ''
      
      if (projectId && token) {
        await this.connect(projectId, token)
      }
    } catch (error) {
      console.error('Reconnection failed:', error)
      this.handleConnectionError()
    }
  }

  public disconnect(): void {
    console.log('Disconnecting SignalWire Realtime...')
    
    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    
    // Clear typing timers
    this.typingTimers.forEach(timer => clearTimeout(timer))
    this.typingTimers.clear()
    
    // Stop heartbeat
    this.stopHeartbeat()
    
    // Disconnect clients
    this.client = null
    this.messagingClient = null
    this.pubSubClient = null
    
    this.isConnected = false
    this.emit('disconnected')
    
    console.log('SignalWire Realtime disconnected')
  }

  public getConnectionStatus(): boolean {
    return this.isConnected
  }
}

export default SignalWireRealtimeClient.getInstance()