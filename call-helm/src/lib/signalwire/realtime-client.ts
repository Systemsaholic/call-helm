import { SignalWire } from '@signalwire/realtime-api'
import { EventEmitter } from 'events'

// SignalWire client types
// Using Awaited<ReturnType> for the main client, but looser types for sub-clients
// since the actual API usage doesn't match library's strict TypeScript definitions
type SignalWireClient = Awaited<ReturnType<typeof SignalWire>>

// Messaging client interface based on actual usage
interface MessagingClientInterface {
  listen: (options: {
    topics: string[]
    onMessageReceived: (message: SignalWireMessage) => void
    onMessageUpdated: (message: SignalWireMessage) => void
  }) => Promise<() => Promise<void>>
  send: (options: {
    topic?: string
    from: string
    to: string
    body: string
    media?: string[]
  }) => Promise<unknown>
}

// PubSub client interface based on actual usage
interface PubSubClientInterface {
  listen: (options: {
    channels: string[]
    onMessageReceived: (message: PubSubMessage) => void
  }) => Promise<() => Promise<void>>
  publish: (options: {
    channel: string
    content: unknown
  }) => Promise<unknown>
}

// SignalWire message types for callbacks
interface SignalWireMessage {
  id?: string
  context?: string
  from: string
  to: string
  body: string
  media?: string[]
  status?: string
}

interface PubSubMessage {
  channel: string
  content: TypingEvent | PresenceEvent | unknown
}

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
  private client: SignalWireClient | null = null
  private messagingClient: MessagingClientInterface | null = null
  private pubSubClient: PubSubClientInterface | null = null
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
      })

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
        onMessageReceived: (message: SignalWireMessage) => {
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
        onMessageUpdated: (message: SignalWireMessage) => {
          console.log('Message updated:', message)

          const statusEvent: MessageStatusEvent = {
            messageId: message.id || '',
            status: this.mapSignalWireStatus(message.status || ''),
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
        onMessageReceived: (message: PubSubMessage) => {
          console.log('PubSub message received:', message)

          if (message.channel === 'typing-indicators') {
            const typingEvent = message.content as TypingEvent
            this.emit('typing', typingEvent)
          } else if (message.channel === 'presence') {
            const presenceEvent = message.content as PresenceEvent
            this.emit('presence', presenceEvent)
          }
        }
      })
    } catch (error) {
      console.error('Failed to setup PubSub listeners:', error)
      throw error
    }
  }

  public async sendMessage(to: string, from: string, body: string, _conversationId?: string, mediaUrls?: string[]): Promise<unknown> {
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
        }).catch((error: unknown) => {
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