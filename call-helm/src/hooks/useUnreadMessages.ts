'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { toast } from 'sonner'

interface UnreadCounts {
  totalUnread: number
  conversationsWithUnread: number
}

interface ConversationUnread {
  conversation_id: string
  phone_number: string
  display_name: string | null
  unread_count: number
  last_message_at: string
}

export function useUnreadMessages() {
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({
    totalUnread: 0,
    conversationsWithUnread: 0
  })
  const [conversationUnreads, setConversationUnreads] = useState<ConversationUnread[]>([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const supabase = createClient()
  const fetchDebounceRef = useRef<NodeJS.Timeout | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const lastCheckTime = useRef<string>(new Date().toISOString())

  // Notification preferences (could be moved to a separate hook/context)
  const [notificationSettings, setNotificationSettings] = useState({
    showToasts: true,
    playSound: true,
    soundEnabled: true
  })

  // Load notification preferences from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('sms-notification-settings')
      if (saved) {
        setNotificationSettings(JSON.parse(saved))
      }
    } catch (error) {
      console.log('Could not load notification settings:', error)
    }
  }, [])

  // Save notification preferences to localStorage
  const updateNotificationSettings = (settings: typeof notificationSettings) => {
    setNotificationSettings(settings)
    try {
      localStorage.setItem('sms-notification-settings', JSON.stringify(settings))
    } catch (error) {
      console.log('Could not save notification settings:', error)
    }
  }

  // Initialize audio for notifications
  useEffect(() => {
    // Create audio element for notification sound (using a system-like notification sound)
    const createNotificationSound = () => {
      // Create a simple beep sound using Web Audio API as fallback
      try {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()
        
        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime)
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1)
        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2)
        
        return () => {
          oscillator.start(audioContext.currentTime)
          oscillator.stop(audioContext.currentTime + 0.2)
        }
      } catch {
        return null
      }
    }
    
    const playBeep = createNotificationSound()
    if (playBeep) {
      audioRef.current = { 
        play: () => Promise.resolve(playBeep()),
        currentTime: 0 
      } as HTMLAudioElement
    } else {
      // Fallback to simple data URI beep
      audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+PyvGMcBiqRwu68ijEI')
    }
  }, [])

  // Show toast notification for new message
  const showNewMessageNotification = (messageData: any) => {
    if (!notificationSettings.showToasts) return
    
    const senderInfo = messageData.conversation_id ? 
      `New message from conversation` : 
      `New message from ${messageData.from_number || 'Unknown'}`
    
    toast.success(senderInfo, {
      description: messageData.message_body ? 
        `${messageData.message_body.substring(0, 50)}${messageData.message_body.length > 50 ? '...' : ''}` : 
        'Tap to view message',
      action: {
        label: 'View',
        onClick: () => {
          // Navigate to messages page - could be enhanced to open specific conversation
          window.location.href = '/dashboard/messages'
        }
      },
      duration: 5000,
    })
  }

  // Play notification sound
  const playNotificationSound = () => {
    if (!notificationSettings.playSound || !notificationSettings.soundEnabled) return
    
    try {
      if (audioRef.current) {
        audioRef.current.currentTime = 0
        audioRef.current.play().catch(e => {
          console.log('Could not play notification sound:', e)
        })
      }
    } catch (error) {
      console.log('Notification sound error:', error)
    }
  }

  // Check for new messages since last check and show notifications
  const checkForNewMessages = async () => {
    if (!user) return

    try {
      // First get the user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()
      
      if (!member) {
        console.log('No organization found for user')
        return
      }

      const { data, error } = await supabase
        .from('sms_messages')
        .select(`
          id,
          direction,
          message_body,
          from_number,
          created_at,
          conversation_id
        `)
        .eq('organization_id', member.organization_id)
        .eq('direction', 'inbound')
        .gte('created_at', lastCheckTime.current)
        .order('created_at', { ascending: false })

      if (!error && data && data.length > 0) {
        console.log(`🔍 Found ${data.length} new messages since last check`)
        
        // Update last check time to now
        lastCheckTime.current = new Date().toISOString()
        
        // Show notification for the most recent message
        const latestMessage = data[0]
        console.log('📨 Showing notification for latest message:', latestMessage)
        
        showNewMessageNotification(latestMessage)
        playNotificationSound()
      }
    } catch (error) {
      console.error('Error checking for new messages:', error)
    }
  }

  // Fetch total unread count with debouncing to prevent excessive calls
  const fetchUnreadCount = async () => {
    if (!user) return

    try {
      const response = await fetch('/api/sms/read-status?type=total')
      if (response.ok) {
        const data = await response.json()
        setUnreadCounts({
          totalUnread: data.totalUnread || 0,
          conversationsWithUnread: data.conversationsWithUnread || 0
        })
      }
    } catch (error) {
      console.error('Error fetching unread count:', error)
    } finally {
      setLoading(false)
    }
  }

  // Fetch unread counts by conversation
  const fetchConversationUnreads = async () => {
    if (!user) return

    try {
      const response = await fetch('/api/sms/read-status?type=by-conversation')
      if (response.ok) {
        const data = await response.json()
        setConversationUnreads(data.conversations || [])
      }
    } catch (error) {
      console.error('Error fetching conversation unreads:', error)
    }
  }

  // Mark messages as read
  const markAsRead = async (messageIds?: string[], conversationId?: string) => {
    try {
      const response = await fetch('/api/sms/read-status', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messageIds,
          conversationId
        })
      })

      if (response.ok) {
        // Debounce the refresh to prevent rapid API calls
        if (fetchDebounceRef.current) {
          clearTimeout(fetchDebounceRef.current)
        }
        
        fetchDebounceRef.current = setTimeout(async () => {
          await fetchUnreadCount()
          if (conversationId) {
            // Remove the conversation from unread list
            setConversationUnreads(prev => 
              prev.filter(c => c.conversation_id !== conversationId)
            )
          }
        }, 500) // Wait 500ms before refreshing
      }
    } catch (error) {
      console.error('Error marking as read:', error)
    }
  }

  // Mark conversation as read
  const markConversationAsRead = async (conversationId: string) => {
    return markAsRead(undefined, conversationId)
  }

  // Set up real-time subscription for read status updates
  useEffect(() => {
    if (!user) return

    console.log('🚀 Setting up real-time subscriptions for unread messages')
    
    // First get the user's organization for filtering
    const setupSubscriptions = async () => {
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()
      
      if (!member) {
        console.log('No organization found for user')
        return
      }
      
      const organizationId = member.organization_id
      console.log('📋 Setting up subscriptions for organization:', organizationId)
      
      fetchUnreadCount()
      fetchConversationUnreads()
      checkForNewMessages() // Check for new messages on initial load

      // Check for messages when tab becomes visible again
      const handleVisibilityChange = () => {
        if (!document.hidden) {
          console.log('👁️ Page became visible, checking for new messages')
          checkForNewMessages()
          fetchUnreadCount()
        }
      }
      
      document.addEventListener('visibilitychange', handleVisibilityChange)

      // Real-time subscriptions will handle all updates automatically

      // Subscribe to real-time updates
      const channel = supabase
        .channel('sms-read-status')
        .on('broadcast', { event: 'conversation-read' }, (payload) => {
          // Another user marked messages as read, refresh counts
          if (payload.payload.userId !== user.id) {
            fetchUnreadCount()
          }
        })
        .on('broadcast', { event: 'messages-read' }, (payload) => {
          // Another user marked messages as read, refresh counts
          if (payload.payload.userId !== user.id) {
            fetchUnreadCount()
          }
        })
        .subscribe()

      // Subscribe to new message events to update unread counts
      // Filter by organization_id for this user's messages
      const messageChannel = supabase
        .channel(`sms-messages-${organizationId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'sms_messages',
            filter: `organization_id=eq.${organizationId}`
          },
          (payload) => {
            console.log('🔔 New message detected via real-time:', payload)
            // Check if it's an inbound message
            if (payload.new && payload.new.direction === 'inbound') {
              console.log('📨 Inbound message confirmed, showing notification')
              
              // Show immediate toast notification
              showNewMessageNotification(payload.new)
              
              // Play notification sound
              playNotificationSound()
              
              // New inbound message received, refresh unread counts immediately (reduced delay)
              if (fetchDebounceRef.current) {
                clearTimeout(fetchDebounceRef.current)
              }
              fetchDebounceRef.current = setTimeout(() => {
                console.log('📊 Refreshing unread counts due to new inbound message')
                fetchUnreadCount()
                fetchConversationUnreads()
              }, 100) // Reduced from 500ms to 100ms for faster updates
            } else {
              console.log('📤 Outbound message detected, no action needed')
            }
          }
        )
        .subscribe((status) => {
          console.log('📡 SMS Messages subscription status:', status)
        })

      // Subscribe to message read status changes to update unread counts
      const readStatusChannel = supabase
        .channel('message-read-status')
        .on(
          'postgres_changes',
          {
            event: '*', // INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'message_read_status'
          },
          (payload) => {
            console.log('📖 Message read status changed via real-time:', payload)
            // Messages marked as read/unread, refresh unread counts with debouncing
            if (fetchDebounceRef.current) {
              clearTimeout(fetchDebounceRef.current)
            }
            fetchDebounceRef.current = setTimeout(() => {
              console.log('📊 Refreshing unread counts due to read status change')
              fetchUnreadCount()
              fetchConversationUnreads()
            }, 100) // Reduced delay for faster updates
          }
        )
        .subscribe((status) => {
          console.log('📖 Read status subscription status:', status)
        })

      // Fallback: Poll for updates and check for new messages every 10 seconds initially, then 30 seconds
      let pollInterval = 10000 // Start with 10 second polling
      let pollCount = 0
      
      const pollFunction = () => {
        console.log('🔄 Polling for unread count updates (fallback)')
        fetchUnreadCount()
        checkForNewMessages() // Also check for new messages to trigger notifications
        
        // After 6 polls (1 minute), reduce to 30 second intervals
        pollCount++
        if (pollCount >= 6 && pollInterval !== 30000) {
          pollInterval = 30000
          clearInterval(pollingIntervalRef.current!)
          pollingIntervalRef.current = setInterval(pollFunction, pollInterval)
          console.log('📉 Reduced polling frequency to 30 seconds')
        }
      }
      
      pollingIntervalRef.current = setInterval(pollFunction, pollInterval)

      return () => {
        // Clear any pending debounced calls
        if (fetchDebounceRef.current) {
          clearTimeout(fetchDebounceRef.current)
        }
        
        // Clear polling interval
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
        }
        
        // Remove visibility change listener
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        
        supabase.removeChannel(channel)
        supabase.removeChannel(messageChannel)
        supabase.removeChannel(readStatusChannel)
      }
    }
    
    // Execute the setup
    setupSubscriptions()
  }, [user])

  return {
    unreadCounts,
    conversationUnreads,
    loading,
    markAsRead,
    markConversationAsRead,
    refreshUnreadCounts: fetchUnreadCount,
    notificationSettings,
    updateNotificationSettings
  }
}

// Hook for conversation-specific unread status
// NOW USES POSTGRES_CHANGES for real-time updates!
export function useConversationReadStatus(conversationId: string) {
  const [unreadCount, setUnreadCount] = useState(0)
  const [unreadMessages, setUnreadMessages] = useState<string[]>([])
  const { user } = useAuth()
  const supabase = createClient()

  // Fetch initial unread messages
  const fetchUnreadMessages = useCallback(async () => {
    if (!user || !conversationId) return

    // Query messages with their read status using left join
    const { data, error } = await supabase
      .from('sms_messages')
      .select(`
        id,
        message_read_status!left(
          id,
          user_id
        )
      `)
      .eq('conversation_id', conversationId)
      .eq('direction', 'inbound')

    if (!error && data) {
      // Filter out messages that have been read by this user
      const unread = data.filter(m => {
        // Message is unread if there's no read status entry for this user
        const hasBeenRead = m.message_read_status?.some((rs: any) => rs.user_id === user.id)
        return !hasBeenRead
      })
      setUnreadMessages(unread.map(m => m.id))
      setUnreadCount(unread.length)
    } else if (error) {
      console.error('Error fetching unread messages:', error)
      // Set empty state on error to avoid infinite loops
      setUnreadMessages([])
      setUnreadCount(0)
    }
  }, [user, conversationId, supabase])

  // Initial fetch
  useEffect(() => {
    fetchUnreadMessages()
  }, [fetchUnreadMessages])

  // Subscribe to read status changes via postgres_changes (not broadcast!)
  // This will automatically update when ANY user marks messages as read
  useEffect(() => {
    if (!user || !conversationId) return

    console.log(`📖 Setting up postgres_changes subscription for conversation ${conversationId}`)

    const channel = supabase
      .channel(`read-status-${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'message_read_status',
          // Filter doesn't work for joins, so we check in the callback
        },
        (payload) => {
          console.log('📖 Read status changed via postgres_changes:', payload)
          // Refetch unread messages when read status changes
          fetchUnreadMessages()
        }
      )
      .subscribe((status) => {
        console.log(`📖 Read status subscription status for ${conversationId}:`, status)
      })

    return () => {
      console.log(`📖 Cleaning up read status subscription for ${conversationId}`)
      supabase.removeChannel(channel)
    }
  }, [user, conversationId, fetchUnreadMessages, supabase])

  return {
    unreadCount,
    unreadMessages,
    isUnread: (messageId: string) => unreadMessages.includes(messageId)
  }
}