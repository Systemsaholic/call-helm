import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { RealtimeChannel } from '@supabase/supabase-js'
import { toast } from 'sonner'

// Generic realtime subscription hook
export function useRealtimeSubscription(
  table: string,
  callback: (payload: any) => void,
  filter?: string
) {
  const { supabase } = useAuth()

  useEffect(() => {
    const channelName = `realtime-${table}-${Date.now()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          ...(filter && { filter })
        },
        callback
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, table, filter, callback])
}

export function useRealtimeCallListUpdates(callListId?: string) {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!user || !callListId) return

    const channel = supabase
      .channel(`call-list-${callListId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_list_contacts',
          filter: `call_list_id=eq.${callListId}`
        },
        (payload) => {
          // Invalidate relevant queries
          queryClient.invalidateQueries({ queryKey: ['call-lists', callListId] })
          queryClient.invalidateQueries({ queryKey: ['callLists', 'contacts', callListId] })
          
          // Show notification for important events
          if (payload.eventType === 'UPDATE' && payload.new.status === 'completed') {
            toast.success('Contact marked as completed')
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, user, callListId, queryClient])
}

export function useRealtimeAgentUpdates() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!user) return

    // Get user's organization
    const getOrgAndSubscribe = async () => {
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

      if (!member?.organization_id) return

      const channel = supabase
        .channel(`org-agents-${member.organization_id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'organization_members',
            filter: `organization_id=eq.${member.organization_id}`
          },
          (payload) => {
            // Invalidate agent queries
            queryClient.invalidateQueries({ queryKey: ['agents'] })
            
            // Show notifications
            if (payload.eventType === 'INSERT') {
              toast.info('New agent added to organization')
            } else if (payload.eventType === 'UPDATE') {
              const newData = payload.new as any
              if (newData.status === 'active' && payload.old?.status !== 'active') {
                toast.success(`${newData.full_name || newData.email} is now active`)
              }
            }
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }

    const cleanup = getOrgAndSubscribe()

    return () => {
      cleanup.then(fn => fn?.())
    }
  }, [supabase, user, queryClient])
}

export function useRealtimeCallUpdates() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!user) return

    const getOrgAndSubscribe = async () => {
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

      if (!member?.organization_id) return

      const channel = supabase
        .channel(`org-calls-${member.organization_id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'calls',
            filter: `organization_id=eq.${member.organization_id}`
          },
          (payload) => {
            const call = payload.new as any
            
            // Invalidate relevant queries
            queryClient.invalidateQueries({ queryKey: ['calls'] })
            queryClient.invalidateQueries({ queryKey: ['analytics'] })
            
            // Show notification for calls
            if (call.direction === 'inbound') {
              toast.info(`Incoming call from ${call.caller_number}`)
            } else if (call.status === 'answered') {
              toast.success('Call connected successfully')
            }
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }

    const cleanup = getOrgAndSubscribe()

    return () => {
      cleanup.then(fn => fn?.())
    }
  }, [supabase, user, queryClient])
}

export function useRealtimeContactAssignments() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`agent-assignments-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'call_list_contacts',
          filter: `assigned_to=eq.${user.id}`
        },
        (payload) => {
          // Invalidate queries
          queryClient.invalidateQueries({ queryKey: ['my-assignments'] })
          queryClient.invalidateQueries({ queryKey: ['callLists'] })
          
          // Show notifications
          if (payload.eventType === 'INSERT' || 
              (payload.eventType === 'UPDATE' && payload.old?.assigned_to !== user.id)) {
            const contact = payload.new as any
            toast.info('New contact assigned to you', {
              description: `Contact ${contact.id} has been assigned to your queue`
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase, user, queryClient])
}

// Global subscription hook to use in the app layout
export function useGlobalRealtimeSubscriptions() {
  useRealtimeAgentUpdates()
  useRealtimeCallUpdates()
  useRealtimeContactAssignments()
}