import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { enableMapSet } from 'immer'

// Enable Map support in Immer
enableMapSet()

export interface Message {
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound'
  from_number: string
  to_number: string
  message_body: string
  media_urls?: string[]
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed'
  sent_by_agent_id?: string
  sentiment?: number
  intent_detected?: string
  created_at: string
  delivered_at?: string
  read_at?: string
  error_message?: string
  ai_analysis?: any
}

export interface Conversation {
  id: string
  contact_id: string | null
  phone_number: string
  status: 'active' | 'archived' | 'spam'
  last_message_at: string
  unread_count: number
  is_opted_out: boolean
  assigned_agent_id: string | null
  contact?: {
    first_name: string
    last_name: string
    company?: string
    email?: string
  }
  last_message?: {
    content: string
    direction: 'inbound' | 'outbound'
    created_at: string
  }
  sentiment?: {
    score: number
    label: 'positive' | 'negative' | 'neutral' | 'mixed'
  }
}

interface TypingState {
  [conversationId: string]: {
    isTyping: boolean
    userId?: string
    timestamp: number
  }
}

interface SMSState {
  // Draft messages keyed by conversation ID
  drafts: Map<string, string>
  
  // Active conversation state
  activeConversationId: string | null
  
  // Typing indicators
  typingState: TypingState
  
  // UI state
  isSending: boolean
  sendingMessageId: string | null
  
  // Optimistic message tracking
  optimisticMessages: Map<string, Message> // tempId -> Message
  
  // Actions
  setDraft: (conversationId: string, text: string) => void
  getDraft: (conversationId: string) => string
  clearDraft: (conversationId: string) => void
  clearAllDrafts: () => void
  
  // Conversation actions
  setActiveConversation: (conversationId: string | null) => void
  
  // Typing actions
  setTyping: (conversationId: string, isTyping: boolean, userId?: string) => void
  getTypingUsers: (conversationId: string) => string[]
  
  // Sending state actions
  setSending: (sending: boolean, messageId?: string) => void
  
  // Optimistic update actions
  addOptimisticMessage: (tempId: string, message: Message) => void
  removeOptimisticMessage: (tempId: string) => void
  confirmOptimisticMessage: (tempId: string, realId: string) => void
  getAllOptimisticMessages: () => Message[]
  getOptimisticMessagesForConversation: (conversationId: string) => Message[]
}

export const useSMSStore = create<SMSState>()(
  immer((set, get) => ({
    // Initial state
    drafts: new Map(),
    activeConversationId: null,
    typingState: {},
    isSending: false,
    sendingMessageId: null,
    optimisticMessages: new Map(),
    
    // Draft actions
    setDraft: (conversationId, text) =>
      set((state) => {
        if (text.trim() === '') {
          state.drafts.delete(conversationId)
        } else {
          state.drafts.set(conversationId, text)
        }
      }),
    
    getDraft: (conversationId) => {
      return get().drafts.get(conversationId) || ''
    },
    
    clearDraft: (conversationId) =>
      set((state) => {
        state.drafts.delete(conversationId)
      }),
    
    clearAllDrafts: () =>
      set((state) => {
        state.drafts.clear()
      }),
    
    // Conversation actions
    setActiveConversation: (conversationId) =>
      set((state) => {
        state.activeConversationId = conversationId
      }),
    
    // Typing actions
    setTyping: (conversationId, isTyping, userId) =>
      set((state) => {
        if (isTyping) {
          state.typingState[conversationId] = {
            isTyping: true,
            userId,
            timestamp: Date.now()
          }
        } else {
          delete state.typingState[conversationId]
        }
      }),
    
    getTypingUsers: (conversationId) => {
      const typing = get().typingState[conversationId]
      if (!typing || !typing.isTyping) return []
      
      // Clear stale typing indicators (older than 5 seconds)
      if (Date.now() - typing.timestamp > 5000) {
        set((state) => {
          delete state.typingState[conversationId]
        })
        return []
      }
      
      return typing.userId ? [typing.userId] : []
    },
    
    // Sending state actions
    setSending: (sending, messageId) =>
      set((state) => {
        state.isSending = sending
        state.sendingMessageId = messageId || null
      }),
    
    // Optimistic update actions
    addOptimisticMessage: (tempId, message) =>
      set((state) => {
        state.optimisticMessages.set(tempId, message)
      }),
    
    removeOptimisticMessage: (tempId) =>
      set((state) => {
        state.optimisticMessages.delete(tempId)
      }),
    
    confirmOptimisticMessage: (tempId, realId) =>
      set((state) => {
        const message = state.optimisticMessages.get(tempId)
        if (message) {
          // Update the message with real ID and remove from optimistic
          message.id = realId
          message.status = 'sent'
          state.optimisticMessages.delete(tempId)
        }
      }),
    
    getAllOptimisticMessages: () => {
      return Array.from(get().optimisticMessages.values())
    },
    
    getOptimisticMessagesForConversation: (conversationId) => {
      return Array.from(get().optimisticMessages.values())
        .filter(msg => msg.conversation_id === conversationId)
    },
  }))
)