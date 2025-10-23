import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { toast } from 'sonner'
import { useNewMessageSubscription } from './useRealtimeSubscription'

export interface Notification {
  id: string
  type: 'assignment' | 'call_ready' | 'campaign_status' | 'usage_alert' | 'system'
  title: string
  message: string
  data?: Record<string, any>
  priority: 'low' | 'normal' | 'high' | 'urgent'
  read: boolean
  created_at: string
  organization_id: string
  user_id?: string
  agent_id?: string
}

export interface CallQueueNotification {
  id: string
  call_list_contact_id: string
  contact_id: string
  assigned_agent_id: string
  campaign_name: string
  contact_name: string
  contact_phone: string
  priority: number
  assigned_at: string
  due_at?: string
  status: 'pending' | 'acknowledged' | 'calling' | 'completed'
}

// Query keys for notifications
export const notificationKeys = {
  all: ['notifications'] as const,
  list: () => [...notificationKeys.all, 'list'] as const,
  queue: () => [...notificationKeys.all, 'queue'] as const,
  unread: () => [...notificationKeys.all, 'unread'] as const,
}

// Hook for managing notifications
export function useNotifications() {
  const { user, supabase } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  // Fetch initial notifications
  useEffect(() => {
    if (!user || !supabase) return

    const fetchNotifications = async () => {
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .or(`user_id.eq.${user.id},user_id.is.null`)
          .order('created_at', { ascending: false })
          .limit(50)

        if (error) throw error

        setNotifications(data || [])
        setUnreadCount(data?.filter(n => !n.read).length || 0)
      } catch (error) {
        console.error('Error fetching notifications:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchNotifications()
  }, [user, supabase])

  // Set up real-time subscription
  useEffect(() => {
    if (!user || !supabase) return

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newNotification = payload.new as Notification
          
          setNotifications(prev => [newNotification, ...prev])
          setUnreadCount(prev => prev + 1)
          
          // Show toast notification
          if (newNotification.priority === 'urgent') {
            toast.error(newNotification.title, {
              description: newNotification.message,
              duration: 10000,
            })
          } else if (newNotification.priority === 'high') {
            toast.warning(newNotification.title, {
              description: newNotification.message,
              duration: 7000,
            })
          } else {
            toast.info(newNotification.title, {
              description: newNotification.message,
              duration: 5000,
            })
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const updatedNotification = payload.new as Notification
          
          setNotifications(prev => 
            prev.map(n => n.id === updatedNotification.id ? updatedNotification : n)
          )
          
          if (updatedNotification.read && !payload.old.read) {
            setUnreadCount(prev => Math.max(0, prev - 1))
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, supabase])

  const markAsRead = async (notificationId: string) => {
    if (!supabase) return

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', notificationId)

      if (error) throw error
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const markAllAsRead = async () => {
    if (!supabase || !user) return

    try {
      const { error } = await supabase
        .from('notifications')
        .update({ read: true })
        .eq('user_id', user.id)
        .eq('read', false)

      if (error) throw error

      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
    }
  }

  const deleteNotification = async (notificationId: string) => {
    if (!supabase) return

    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId)

      if (error) throw error

      setNotifications(prev => prev.filter(n => n.id !== notificationId))
    } catch (error) {
      console.error('Error deleting notification:', error)
    }
  }

  return {
    notifications,
    unreadCount,
    loading,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  }
}

// Hook for agent call queue notifications
export function useCallQueueNotifications() {
  const { user, supabase } = useAuth()
  const [callQueue, setCallQueue] = useState<CallQueueNotification[]>([])
  const [loading, setLoading] = useState(true)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Initialize notification sound
  useEffect(() => {
    audioRef.current = new Audio('/notification-sound.mp3')
    audioRef.current.volume = 0.7
  }, [])

  // Fetch initial call queue
  useEffect(() => {
    if (!user || !supabase) return

    const fetchCallQueue = async () => {
      try {
        // Get user's agent ID
        const { data: member } = await supabase
          .from('organization_members')
          .select('id')
          .eq('user_id', user.id)
          .single()

        if (!member) return

        const { data, error } = await supabase
          .from('call_list_contacts')
          .select(`
            id,
            contact_id,
            assigned_to,
            assigned_at,
            status,
            priority,
            call_lists(id, name),
            contacts(id, first_name, last_name, phone_number)
          `)
          .eq('assigned_to', member.id)
          .eq('status', 'assigned')
          .order('priority', { ascending: false })
          .order('assigned_at', { ascending: true })

        if (error) throw error

        const queueItems: CallQueueNotification[] = data?.map(item => ({
          id: item.id,
          call_list_contact_id: item.id,
          contact_id: item.contact_id,
          assigned_agent_id: item.assigned_to,
          campaign_name: (item.call_lists as any)?.name || 'Unknown Campaign',
          contact_name: `${(item.contacts as any)?.first_name || ''} ${(item.contacts as any)?.last_name || ''}`.trim(),
          contact_phone: (item.contacts as any)?.phone_number || '',
          priority: item.priority,
          assigned_at: item.assigned_at,
          status: 'pending',
        })) || []

        setCallQueue(queueItems)
      } catch (error) {
        console.error('Error fetching call queue:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchCallQueue()
  }, [user, supabase])

  // Set up real-time subscription for new assignments
  useEffect(() => {
    if (!user || !supabase) return

    const getUserAgentId = async () => {
      const { data: member } = await supabase
        .from('organization_members')
        .select('id')
        .eq('user_id', user.id)
        .single()

      return member?.id
    }

    getUserAgentId().then(agentId => {
      if (!agentId) return

      const channel = supabase
        .channel(`call_assignments:${agentId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'call_list_contacts',
            filter: `assigned_to=eq.${agentId}`,
          },
          async (payload) => {
            if (payload.eventType === 'INSERT' || 
                (payload.eventType === 'UPDATE' && payload.new.status === 'assigned')) {
              
              // Fetch full contact and campaign data
              const { data: fullData } = await supabase
                .from('call_list_contacts')
                .select(`
                  id,
                  contact_id,
                  assigned_to,
                  assigned_at,
                  status,
                  priority,
                  call_lists(id, name),
                  contacts(id, first_name, last_name, phone_number)
                `)
                .eq('id', payload.new.id)
                .single()

              if (fullData) {
                const queueItem: CallQueueNotification = {
                  id: fullData.id,
                  call_list_contact_id: fullData.id,
                  contact_id: fullData.contact_id,
                  assigned_agent_id: fullData.assigned_to,
                  campaign_name: (fullData.call_lists as any)?.name || 'Unknown Campaign',
                  contact_name: `${(fullData.contacts as any)?.first_name || ''} ${(fullData.contacts as any)?.last_name || ''}`.trim(),
                  contact_phone: (fullData.contacts as any)?.phone_number || '',
                  priority: fullData.priority,
                  assigned_at: fullData.assigned_at,
                  status: 'pending',
                }

                setCallQueue(prev => [queueItem, ...prev])

                // Play notification sound
                if (audioRef.current) {
                  audioRef.current.play().catch(console.error)
                }

                // Show notification
                toast.success('New Contact Assigned', {
                  description: `${queueItem.contact_name} - ${queueItem.campaign_name}`,
                  action: {
                    label: 'Start Calling',
                    onClick: () => {
                      window.location.href = `/dashboard/call-board?list=${(fullData.call_lists as any)?.id}`
                    }
                  }
                })
              }
            } else if (payload.eventType === 'UPDATE' && 
                      payload.new.status !== 'assigned') {
              // Remove from queue if status changed
              setCallQueue(prev => prev.filter(item => item.id !== payload.new.id))
            } else if (payload.eventType === 'DELETE') {
              setCallQueue(prev => prev.filter(item => item.id !== payload.old.id))
            }
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    })
  }, [user, supabase])

  const acknowledgeAssignment = async (callListContactId: string) => {
    if (!supabase) return

    try {
      const { error } = await supabase
        .from('call_list_contacts')
        .update({ 
          status: 'in_progress',
          first_attempt_at: new Date().toISOString() 
        })
        .eq('id', callListContactId)

      if (error) throw error

      setCallQueue(prev => 
        prev.map(item => 
          item.id === callListContactId 
            ? { ...item, status: 'acknowledged' }
            : item
        )
      )
    } catch (error) {
      console.error('Error acknowledging assignment:', error)
    }
  }

  return {
    callQueue,
    loading,
    acknowledgeAssignment,
  }
}

// Hook for sending notifications (admin/system use)
export function useSendNotification() {
  const { supabase } = useAuth()

  const sendNotification = async (notification: Omit<Notification, 'id' | 'created_at' | 'read'>) => {
    if (!supabase) return

    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert({
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data || {},
          priority: notification.priority || 'normal',
          read: false,
          organization_id: notification.organization_id,
          user_id: notification.user_id,
          agent_id: notification.agent_id,
        })
        .select()
        .single()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error sending notification:', error)
      throw error
    }
  }

  const sendBulkNotifications = async (notifications: Omit<Notification, 'id' | 'created_at' | 'read'>[]) => {
    if (!supabase) return

    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert(
          notifications.map(notification => ({
            type: notification.type,
            title: notification.title,
            message: notification.message,
            data: notification.data || {},
            priority: notification.priority || 'normal',
            read: false,
            organization_id: notification.organization_id,
            user_id: notification.user_id,
            agent_id: notification.agent_id,
          }))
        )
        .select()

      if (error) throw error
      return data
    } catch (error) {
      console.error('Error sending bulk notifications:', error)
      throw error
    }
  }

  return {
    sendNotification,
    sendBulkNotifications,
  }
}

// SMS Notification settings interface
interface SMSNotificationSettings {
  showToasts: boolean
  playSound: boolean
  soundEnabled: boolean
}

/**
 * Hook for managing SMS notifications
 * Follows Single Responsibility Principle - ONLY handles SMS notifications
 *
 * @returns Notification settings and helper functions
 */
export function useSMSNotifications() {
  const { user } = useAuth()
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [notificationSettings, setNotificationSettings] = useState<SMSNotificationSettings>({
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
  const updateNotificationSettings = useCallback((settings: SMSNotificationSettings) => {
    setNotificationSettings(settings)
    try {
      localStorage.setItem('sms-notification-settings', JSON.stringify(settings))
    } catch (error) {
      console.log('Could not save notification settings:', error)
    }
  }, [])

  // Initialize audio for notifications
  useEffect(() => {
    // Create audio element for notification sound using Web Audio API
    const createNotificationSound = () => {
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

  // Fetch organization ID
  useEffect(() => {
    if (!user) {
      setOrganizationId(null)
      return
    }

    const getOrganization = async () => {
      try {
        const response = await fetch('/api/sms/read-status?type=organization')
        if (response.ok) {
          const data = await response.json()
          setOrganizationId(data.organizationId)
        }
      } catch (error) {
        console.error('Error fetching organization:', error)
      }
    }

    getOrganization()
  }, [user])

  // Play notification sound
  const playNotificationSound = useCallback(() => {
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
  }, [notificationSettings.playSound, notificationSettings.soundEnabled])

  // Show toast notification for new message
  const showNewMessageNotification = useCallback((messageData: any) => {
    if (!notificationSettings.showToasts) return

    const senderInfo = messageData.from_number ?
      `New message from ${messageData.from_number}` :
      'New message'

    toast.success(senderInfo, {
      description: messageData.message_body ?
        `${messageData.message_body.substring(0, 50)}${messageData.message_body.length > 50 ? '...' : ''}` :
        'Tap to view message',
      action: {
        label: 'View',
        onClick: () => {
          window.location.href = '/dashboard/messages'
        }
      },
      duration: 5000,
    })
  }, [notificationSettings.showToasts])

  // Subscribe to new messages and show notifications
  useNewMessageSubscription(
    organizationId,
    useCallback((payload) => {
      // Only notify for inbound messages
      if (payload.new && payload.new.direction === 'inbound') {
        console.log('📨 Inbound message confirmed, showing notification')

        // Show toast notification
        showNewMessageNotification(payload.new)

        // Play notification sound
        playNotificationSound()
      }
    }, [showNewMessageNotification, playNotificationSound]),
    !!user && !!organizationId
  )

  return {
    notificationSettings,
    updateNotificationSettings,
    showNewMessageNotification,
    playNotificationSound
  }
}