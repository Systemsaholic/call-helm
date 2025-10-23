import { useEffect, useState, useCallback, useRef } from 'react'
import signalWireClient from '@/lib/signalwire/client-safe'
import type { 
  TypingEvent, 
  MessageStatusEvent, 
  PresenceEvent, 
  IncomingMessageEvent 
} from '@/lib/signalwire/client-safe'

// Hook for managing SignalWire connection
export function useSignalWireConnection() {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<Error | null>(null)

  useEffect(() => {
    const handleConnected = () => {
      setIsConnected(true)
      setConnectionError(null)
    }

    const handleDisconnected = () => {
      setIsConnected(false)
    }

    const handleError = (error: Error) => {
      setConnectionError(error)
      setIsConnected(false)
    }

    signalWireClient.on('connected', handleConnected)
    signalWireClient.on('disconnected', handleDisconnected)
    signalWireClient.on('error', handleError)

    // Check initial connection status
    setIsConnected(signalWireClient.getConnectionStatus())

    return () => {
      signalWireClient.off('connected', handleConnected)
      signalWireClient.off('disconnected', handleDisconnected)
      signalWireClient.off('error', handleError)
    }
  }, [])

  const connect = useCallback(async (projectId: string, token: string, topics?: string[]) => {
    try {
      await signalWireClient.connect(projectId, token, topics)
    } catch (error) {
      setConnectionError(error as Error)
      throw error
    }
  }, [])

  const disconnect = useCallback(() => {
    signalWireClient.disconnect()
  }, [])

  return {
    isConnected,
    connectionError,
    connect,
    disconnect
  }
}

// Hook for typing indicators
export function useTypingIndicator(conversationId: string, userId: string) {
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())
  const typingTimeoutsRef = useRef<Map<string, NodeJS.Timeout>>(new Map())

  useEffect(() => {
    const handleTyping = (event: TypingEvent) => {
      if (event.conversationId !== conversationId) return
      if (event.userId === userId) return // Don't show own typing

      setTypingUsers(prev => {
        const newSet = new Set(prev)
        
        // Clear existing timeout for this user
        const existingTimeout = typingTimeoutsRef.current.get(event.userId)
        if (existingTimeout) {
          clearTimeout(existingTimeout)
        }

        if (event.isTyping) {
          newSet.add(event.userId)
          
          // Auto-remove after 6 seconds (slightly more than sender's 5 seconds)
          const timeout = setTimeout(() => {
            setTypingUsers(current => {
              const updated = new Set(current)
              updated.delete(event.userId)
              return updated
            })
            typingTimeoutsRef.current.delete(event.userId)
          }, 6000)
          
          typingTimeoutsRef.current.set(event.userId, timeout)
        } else {
          newSet.delete(event.userId)
          typingTimeoutsRef.current.delete(event.userId)
        }
        
        return newSet
      })
    }

    signalWireClient.on('typing', handleTyping)

    return () => {
      signalWireClient.off('typing', handleTyping)
      
      // Clear all timeouts
      typingTimeoutsRef.current.forEach(timeout => clearTimeout(timeout))
      typingTimeoutsRef.current.clear()
    }
  }, [conversationId, userId])

  const sendTypingIndicator = useCallback(async (isTyping: boolean) => {
    try {
      await signalWireClient.sendTypingIndicator(conversationId, userId, isTyping)
    } catch (error) {
      console.error('Failed to send typing indicator:', error)
    }
  }, [conversationId, userId])

  return {
    typingUsers: Array.from(typingUsers),
    sendTypingIndicator,
    isAnyoneTyping: typingUsers.size > 0
  }
}

// Hook for message status updates
export function useMessageStatus(messageIds: string[]) {
  const [messageStatuses, setMessageStatuses] = useState<Map<string, MessageStatusEvent>>(new Map())

  useEffect(() => {
    const handleStatusUpdate = (event: MessageStatusEvent) => {
      if (messageIds.includes(event.messageId)) {
        setMessageStatuses(prev => {
          const newMap = new Map(prev)
          newMap.set(event.messageId, event)
          return newMap
        })
      }
    }

    signalWireClient.on('message.status', handleStatusUpdate)

    return () => {
      signalWireClient.off('message.status', handleStatusUpdate)
    }
  }, [messageIds])

  return messageStatuses
}

// Hook for presence/online status
export function usePresence(userIds: string[]) {
  const [presenceMap, setPresenceMap] = useState<Map<string, PresenceEvent>>(new Map())

  useEffect(() => {
    const handlePresenceUpdate = (event: PresenceEvent) => {
      if (userIds.includes(event.userId)) {
        setPresenceMap(prev => {
          const newMap = new Map(prev)
          newMap.set(event.userId, event)
          return newMap
        })
      }
    }

    signalWireClient.on('presence', handlePresenceUpdate)

    return () => {
      signalWireClient.off('presence', handlePresenceUpdate)
    }
  }, [userIds])

  const updateOwnPresence = useCallback(async (userId: string, status: 'online' | 'offline' | 'away') => {
    try {
      await signalWireClient.updatePresence(userId, status)
    } catch (error) {
      console.error('Failed to update presence:', error)
    }
  }, [])

  return {
    presenceMap,
    updateOwnPresence
  }
}

// Hook for incoming messages
export function useIncomingMessages(conversationId?: string) {
  const [incomingMessages, setIncomingMessages] = useState<IncomingMessageEvent[]>([])

  useEffect(() => {
    const handleIncomingMessage = (message: IncomingMessageEvent) => {
      // Filter by conversation if specified
      if (conversationId && message.conversationId !== conversationId) {
        return
      }

      setIncomingMessages(prev => [...prev, message])
    }

    signalWireClient.on('message.received', handleIncomingMessage)

    return () => {
      signalWireClient.off('message.received', handleIncomingMessage)
    }
  }, [conversationId])

  const clearIncomingMessages = useCallback(() => {
    setIncomingMessages([])
  }, [])

  return {
    incomingMessages,
    clearIncomingMessages
  }
}

// Combined hook for all real-time features
export function useSignalWireRealtime(conversationId: string, userId: string) {
  const connection = useSignalWireConnection()
  const typing = useTypingIndicator(conversationId, userId)
  const messages = useIncomingMessages(conversationId)
  const presence = usePresence([]) // Will be populated with conversation participants

  return {
    connection,
    typing,
    messages,
    presence
  }
}