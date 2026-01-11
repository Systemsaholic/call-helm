// Client-safe SignalWire implementation that uses API endpoints
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

class ClientSafeSignalWireClient extends EventEmitter {
  private static instance: ClientSafeSignalWireClient | null = null
  private isConnected: boolean = false
  private typingTimers: Map<string, NodeJS.Timeout> = new Map()
  private config: any = null

  private constructor() {
    super()
  }

  public static getInstance(): ClientSafeSignalWireClient {
    if (!ClientSafeSignalWireClient.instance) {
      ClientSafeSignalWireClient.instance = new ClientSafeSignalWireClient()
    }
    return ClientSafeSignalWireClient.instance
  }

  public async connect(projectId: string, token: string, topics: string[] = ['office']): Promise<void> {
    if (this.isConnected) {
      console.log('SignalWire client already connected')
      return
    }

    try {
      // Store config for later use
      this.config = { projectId, token, topics }
      
      // For now, we'll just mark as connected
      // In a real implementation, you would establish WebSocket connection here
      this.isConnected = true
      this.emit('connected')
      
      console.log('SignalWire client connected (client-safe mode)')
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

      // For now, emit locally
      // In a real implementation, you would send this via WebSocket
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

  public async updatePresence(userId: string, status: 'online' | 'offline' | 'away'): Promise<void> {
    try {
      // For now, emit locally
      // In a real implementation, you would send this via WebSocket
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
    
    this.isConnected = false
    this.emit('disconnected')
    
    console.log('SignalWire client disconnected')
  }

  public getConnectionStatus(): boolean {
    return this.isConnected
  }
}

export default ClientSafeSignalWireClient.getInstance()