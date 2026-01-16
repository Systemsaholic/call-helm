'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeSubscription } from '@/lib/hooks/useRealtimeSubscription'
import { useUserRole } from '@/lib/hooks/useUserRole'
import { useAgentQueue } from '@/lib/hooks/useAgentAssignments'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { CallHistory } from './CallHistory'
import Link from 'next/link'
import {
  Phone,
  PhoneOff,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Users,
  Clock,
  TrendingUp,
  Activity,
  Pause,
  Play,
  Circle,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Mic,
  MicOff,
  Volume2,
  RefreshCw,
  User,
  Building2,
  ListTodo,
  ArrowRight
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { SystemHealthIndicator } from '@/components/system/SystemHealthIndicator'

interface ActiveCall {
  id: string
  agent_id: string
  agent_name: string
  contact_id: string
  contact_name: string
  phone_number: string
  direction: 'inbound' | 'outbound'
  status: 'initiated' | 'ringing' | 'in-progress' | 'completed' | 'failed'
  start_time: string
  duration_seconds: number
  call_list_name?: string
  muted: boolean
  on_hold: boolean
}

interface AgentStatus {
  id: string
  name: string
  email: string
  status: 'available' | 'busy' | 'offline' | 'break' | 'after-call'
  current_call?: ActiveCall
  calls_today: number
  avg_call_time: number
  last_activity: string
}

interface CallStats {
  total_calls: number
  active_calls: number
  completed_calls: number
  failed_calls: number
  avg_duration: number
  total_duration: number
}

export function RealtimeCallBoard() {
  const supabase = createClient()
  const { isAgent, memberId: userMemberId } = useUserRole()
  const { data: queueData, isLoading: queueLoading, refetch: refetchQueue } = useAgentQueue()
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([])
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([])
  const [callStats, setCallStats] = useState<CallStats>({
    total_calls: 0,
    active_calls: 0,
    completed_calls: 0,
    failed_calls: 0,
    avg_duration: 0,
    total_duration: 0
  })
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedView, setSelectedView] = useState<'grid' | 'list'>('grid')
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [subscriptionStatus, setSubscriptionStatus] = useState<string>('CONNECTING')
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  // Get organization ID and load initial data
  useEffect(() => {
    const initializeBoard = async () => {
      console.log('🚀 Initializing CallBoard...')
      // Get user's organization
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.log('❌ No user found')
        return
      }

      console.log('👤 User found:', user.id)
      const { data: member } = await supabase
        .from('organization_members')
        .select('id, organization_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

      console.log('🏢 Organization member:', member)
      if (member?.organization_id) {
        console.log('✅ Setting organizationId:', member.organization_id)
        setOrganizationId(member.organization_id)
        setMemberId(member.id)
        // Don't call loadCallBoard here, it will be called in the useEffect below
      } else {
        console.log('❌ No organization found for user')
      }
    }
    
    initializeBoard()
  }, [])

  // Load call board when organization ID is set
  useEffect(() => {
    console.log('📋 Organization ID changed:', organizationId)
    if (organizationId) {
      console.log('🔄 Loading call board for organization:', organizationId)
      loadCallBoard()
    }
  }, [organizationId])

  // Subscribe to real-time updates for this organization's calls
  useEffect(() => {
    if (!organizationId) {
      console.log('⚠️ No organizationId for subscription')
      return
    }

    console.log('🔌 Setting up real-time subscription for organization:', organizationId)
    
    const channel = supabase
      .channel(`org-calls-board-${organizationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'calls',
          filter: `organization_id=eq.${organizationId}`
        },
        async (payload) => {
          const newData = payload.new as any
          const oldData = payload.old as any
          
          console.log('🔔 Call Board Real-time Update:', {
            event: payload.eventType,
            callId: newData?.id || oldData?.id,
            hasEndTime: !!newData?.end_time,
            organizationId: newData?.organization_id || oldData?.organization_id,
            timestamp: new Date().toISOString()
          })
          
          if (payload.eventType === 'INSERT') {
            // New call started - fetch full details and add to board
            console.log('📞 New call detected:', newData.id, 'End time:', newData.end_time)
            if (!newData.end_time) {
              await handleNewCall(newData)
            }
          } else if (payload.eventType === 'UPDATE') {
            // Call updated - could be status change or call ending
            if (newData.end_time && !oldData?.end_time) {
              // Call just ended
              console.log('📴 Call ended:', newData.id)
              handleCallEnd(newData)
            } else if (!newData.end_time) {
              // Call still active, update its info
              console.log('🔄 Call updated:', newData.id, 'Status:', newData.status)
              handleCallUpdate(newData)
            }
          } else if (payload.eventType === 'DELETE') {
            // Call deleted
            console.log('🗑️ Call deleted:', oldData?.id)
            handleCallEnd(oldData)
          }
        }
      )
      .subscribe((status, error) => {
        console.log('📡 CallBoard subscription status:', status)
        setSubscriptionStatus(status)
        
        if (error) {
          console.error('❌ CallBoard subscription error:', error)
        }
        
        if (status === 'SUBSCRIBED') {
          console.log('✅ CallBoard successfully subscribed to real-time updates')
          setLastUpdate(new Date())
        } else if (status === 'CHANNEL_ERROR') {
          console.error('⚠️ CallBoard channel error - will retry...')
        } else if (status === 'TIMED_OUT') {
          console.error('⏱️ CallBoard subscription timed out - will retry...')
        } else if (status === 'CLOSED') {
          console.log('🔌 CallBoard subscription closed')
        }
      })

    // Log channel state for debugging
    console.log('📊 Channel state after subscribe:', {
      topic: channel.topic,
      state: channel.state,
      bindings: channel.bindings.length
    })

    return () => {
      console.log('🧹 Cleaning up CallBoard subscription')
      supabase.removeChannel(channel)
    }
  }, [organizationId])

  // Subscribe to agent status updates
  useRealtimeSubscription(
    'agent_status',
    (payload) => {
      if (payload.eventType === 'UPDATE') {
        handleAgentStatusUpdate(payload.new as any)
      }
    }
  )
  
  // Update call durations every second for active calls
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveCalls(prev => prev.map(call => {
        const startTime = new Date(call.start_time).getTime()
        const now = new Date().getTime()
        const durationSeconds = Math.floor((now - startTime) / 1000)
        return { ...call, duration_seconds: durationSeconds }
      }))
    }, 1000)
    
    return () => clearInterval(interval)
  }, [])

  // Fallback polling mechanism when real-time isn't working
  useEffect(() => {
    if (!organizationId) return

    // Poll every 10 seconds if subscription isn't working
    const fallbackInterval = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastUpdate.getTime()
      const isSubscriptionHealthy = subscriptionStatus === 'SUBSCRIBED' && timeSinceLastUpdate < 30000
      
      if (!isSubscriptionHealthy) {
        console.log('⚠️ Real-time may be stale, using fallback polling', {
          subscriptionStatus,
          timeSinceLastUpdate: Math.round(timeSinceLastUpdate / 1000) + 's'
        })
        loadCallBoard(true) // Silent refresh
      }
    }, 10000) // Poll every 10 seconds

    return () => clearInterval(fallbackInterval)
  }, [organizationId, subscriptionStatus, lastUpdate])

  const loadCallBoard = async (silent = false) => {
    if (!silent) setLoading(true)

    try {
      // Load active calls - only get calls that haven't ended
      let query = supabase
        .from('calls')
        .select('*')
        .eq('organization_id', organizationId) // Filter by organization
        .is('end_time', null) // Only get calls without an end time
        .order('start_time', { ascending: false })

      // For agents, only show their own calls
      if (isAgent && memberId) {
        query = query.eq('member_id', memberId)
      }

      const { data: callsData, error: callsError } = await query
      
      if (callsError) {
        console.error('Error loading active calls:', callsError)
      }

      // Enrich calls with related data
      let calls = []
      if (callsData) {
        calls = await Promise.all(
          callsData.map(async (call) => {
            let member = null
            let contact = null

            if (call.member_id) {
              const { data: memberData } = await supabase
                .from('organization_members')
                .select('full_name, email')
                .eq('id', call.member_id)
                .maybeSingle()
              
              member = memberData ? {
                full_name: memberData.full_name,
                email: memberData.email
              } : null
            }

            if (call.contact_id) {
              const { data: contactData } = await supabase
                .from('contacts')
                .select('full_name')
                .eq('id', call.contact_id)
                .maybeSingle()
              contact = contactData
            }

            return { ...call, member, contact }
          })
        )
      }

      // Load agent statuses (from organization_members)
      const { data: agents } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', organizationId) // Filter by organization
        .eq('is_active', true)

      // Load today's call stats including agent data
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      
      const { data: stats } = await supabase
        .from('calls')
        .select('status, duration, end_time, member_id, start_time')
        .eq('organization_id', organizationId) // Filter by organization
        .gte('start_time', today.toISOString())

      // Process data
      console.log('Active calls loaded:', callsData?.length || 0, 'calls', callsData)
      if (calls) {
        setActiveCalls(calls.map(call => ({
          id: call.id,
          agent_id: call.member_id,
          agent_name: call.member?.full_name || 'Unknown',
          contact_id: call.contact_id,
          contact_name: call.contact?.full_name || 'Unknown',
          phone_number: call.called_number,
          direction: call.direction,
          status: call.status,
          start_time: call.start_time,
          duration_seconds: call.duration || 0,
          call_list_name: call.metadata?.campaign_name,
          muted: false,
          on_hold: false
        })))
      }

      if (agents) {
        // Calculate stats for each agent
        const agentStats = agents.map(agent => {
          // Filter calls for this agent
          const agentCalls = stats?.filter(call => call.member_id === agent.id) || []
          const completedCalls = agentCalls.filter(call => call.end_time !== null)
          
          // Calculate average call time
          const totalDuration = completedCalls.reduce((acc, call) => acc + (call.duration || 0), 0)
          const avgCallTime = completedCalls.length > 0 ? totalDuration / completedCalls.length : 0
          
          // Find if agent has any active calls
          const hasActiveCall = calls?.some(call => call.member_id === agent.id)
          
          // Determine last activity (most recent call start time or created_at)
          const lastCallTime = agentCalls.length > 0 
            ? agentCalls.reduce((latest, call) => {
                const callTime = new Date(call.start_time).getTime()
                return callTime > latest ? callTime : latest
              }, 0)
            : null
          
          const lastActivity = lastCallTime 
            ? new Date(lastCallTime).toISOString()
            : agent.created_at
          
          return {
            id: agent.id,
            name: agent.full_name || 'Unknown',
            email: agent.email || '',
            status: hasActiveCall ? 'busy' as const : 'available' as const,
            calls_today: agentCalls.length,
            avg_call_time: avgCallTime,
            last_activity: lastActivity
          }
        })
        
        setAgentStatuses(agentStats)
      }

      if (stats) {
        // Completed calls are those with an end_time
        const completed = stats.filter(s => s.end_time !== null)
        const failed = stats.filter(s => s.status === 'failed' || s.status === 'abandoned')
        const active = stats.filter(s => s.end_time === null)
        const totalDuration = completed.reduce((acc, c) => acc + (c.duration || 0), 0)
        
        setCallStats({
          total_calls: stats.length,
          active_calls: active.length,
          completed_calls: completed.length,
          failed_calls: failed.length,
          avg_duration: completed.length > 0 ? totalDuration / completed.length : 0,
          total_duration: totalDuration
        })
      }
    } catch (error) {
      console.error('Error loading call board:', error)
    } finally {
      if (!silent) setLoading(false)
    }
  }
  
  const handleManualRefresh = async () => {
    console.log('Manual refresh triggered, organizationId:', organizationId)
    setRefreshing(true)
    await loadCallBoard(true)
    setRefreshing(false)
  }

  const handleNewCall = async (call: any) => {
    // Update last update timestamp
    setLastUpdate(new Date())
    
    // Fetch additional details for the call
    let member = null
    let contact = null

    if (call.member_id) {
      const { data: memberData } = await supabase
        .from('organization_members')
        .select('full_name, email')
        .eq('id', call.member_id)
        .maybeSingle()
      member = memberData
    }

    if (call.contact_id) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('full_name')
        .eq('id', call.contact_id)
        .maybeSingle()
      contact = contactData
    }

    const activeCall: ActiveCall = {
      id: call.id,
      agent_id: call.member_id,
      agent_name: member?.full_name || 'Unknown',
      contact_id: call.contact_id,
      contact_name: contact?.full_name || call.called_number || 'Unknown',
      phone_number: call.called_number,
      direction: call.direction,
      status: call.status,
      start_time: call.start_time,
      duration_seconds: 0,
      call_list_name: call.metadata?.campaign_name,
      muted: false,
      on_hold: false
    }

    setActiveCalls(prev => {
      // Check if call already exists (to avoid duplicates)
      const exists = prev.some(c => c.id === call.id)
      if (exists) {
        return prev.map(c => c.id === call.id ? activeCall : c)
      }
      return [...prev, activeCall]
    })

    // Update agent status
    setAgentStatuses(prev => prev.map(agent => 
      agent.id === call.member_id 
        ? { ...agent, status: 'busy' as const }
        : agent
    ))

    // Update stats
    setCallStats(prev => ({
      ...prev,
      total_calls: prev.total_calls + 1,
      active_calls: prev.active_calls + 1
    }))
  }

  const handleCallUpdate = (call: any) => {
    // Update last update timestamp
    setLastUpdate(new Date())
    
    setActiveCalls(prev => prev.map(c => {
      if (c.id === call.id) {
        // Calculate duration in seconds
        const startTime = new Date(call.start_time).getTime()
        const now = new Date().getTime()
        const durationSeconds = Math.floor((now - startTime) / 1000)
        
        return {
          ...c,
          status: call.status,
          duration_seconds: call.duration || durationSeconds
        }
      }
      return c
    }))
  }

  const handleCallEnd = (call: any) => {
    // Update last update timestamp
    setLastUpdate(new Date())
    
    setActiveCalls(prev => prev.filter(c => c.id !== call.id))
    
    // Update agent status and stats
    setAgentStatuses(prev => prev.map(agent => {
      if (agent.id === call.member_id) {
        // Only increment call count and update average for completed calls with duration
        const isCompletedWithDuration = call.status === 'completed' && call.duration
        const newCallsToday = isCompletedWithDuration ? agent.calls_today + 1 : agent.calls_today
        
        // Calculate new average time, guarding against division by zero
        let newAvgTime = agent.avg_call_time
        if (isCompletedWithDuration && agent.calls_today === 0) {
          // First call of the day
          newAvgTime = call.duration
        } else if (isCompletedWithDuration && agent.calls_today > 0) {
          // Calculate weighted average
          newAvgTime = ((agent.avg_call_time * agent.calls_today) + call.duration) / newCallsToday
        }
        
        return {
          ...agent,
          status: 'after-call' as const,
          calls_today: newCallsToday,
          avg_call_time: newAvgTime,
          last_activity: new Date().toISOString()
        }
      }
      return agent
    }))

    // Update stats
    setCallStats(prev => ({
      ...prev,
      active_calls: Math.max(0, prev.active_calls - 1),
      completed_calls: call.status === 'completed' ? prev.completed_calls + 1 : prev.completed_calls,
      failed_calls: call.status === 'failed' ? prev.failed_calls + 1 : prev.failed_calls
    }))
  }

  const handleAgentStatusUpdate = (status: any) => {
    setAgentStatuses(prev => prev.map(agent => 
      agent.id === status.agent_id 
        ? { ...agent, status: status.status, last_activity: status.last_activity }
        : agent
    ))
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-green-500'
      case 'busy':
      case 'in-progress':
        return 'bg-red-500'
      case 'after-call':
      case 'ringing':
        return 'bg-yellow-500'
      case 'break':
        return 'bg-blue-500'
      case 'offline':
        return 'bg-gray-400'
      default:
        return 'bg-gray-300'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'available':
        return <CheckCircle className="h-4 w-4" />
      case 'busy':
      case 'in-progress':
        return <PhoneCall className="h-4 w-4" />
      case 'after-call':
        return <Clock className="h-4 w-4" />
      case 'break':
        return <Pause className="h-4 w-4" />
      case 'offline':
        return <Circle className="h-4 w-4" />
      default:
        return <AlertCircle className="h-4 w-4" />
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  // Helper to get initials from name
  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  // Pending contacts from agent queue
  const pendingContacts = queueData?.contacts || []

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column - Active Calls, Agent Status, Recent Calls */}
      <div className="lg:col-span-2 space-y-6">
        {/* System Health Status */}
        <div className="flex justify-end">
          <SystemHealthIndicator variant="compact" />
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Calls</CardDescription>
            <CardTitle className="text-2xl">{callStats.total_calls}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">Today</div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Calls</CardDescription>
            <CardTitle className="text-2xl text-green-600">
              {callStats.active_calls}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1">
              <Activity className="h-3 w-3 text-green-600" />
              <span className="text-xs text-muted-foreground">Live now</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Completed</CardDescription>
            <CardTitle className="text-2xl">{callStats.completed_calls}</CardTitle>
          </CardHeader>
          <CardContent>
            <Progress 
              value={(callStats.completed_calls / Math.max(1, callStats.total_calls)) * 100} 
              className="h-1"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failed</CardDescription>
            <CardTitle className="text-2xl text-red-600">
              {callStats.failed_calls}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">
              {callStats.total_calls > 0 
                ? `${((callStats.failed_calls / callStats.total_calls) * 100).toFixed(1)}%`
                : '0%'
              } failure rate
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Duration</CardDescription>
            <CardTitle className="text-2xl">
              {formatDuration(Math.floor(callStats.avg_duration))}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-muted-foreground">Per call</div>
          </CardContent>
        </Card>
      </div>

      {/* Active Calls Section */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Active Calls</CardTitle>
              <CardDescription>
                {activeCalls.length} call{activeCalls.length !== 1 ? 's' : ''} in progress
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleManualRefresh}
                disabled={refreshing}
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant={selectedView === 'grid' ? 'default' : 'outline'}
                onClick={() => setSelectedView('grid')}
              >
                Grid
              </Button>
              <Button
                size="sm"
                variant={selectedView === 'list' ? 'default' : 'outline'}
                onClick={() => setSelectedView('list')}
              >
                List
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {activeCalls.length === 0 ? (
            <div className="text-center py-8">
              <Phone className="h-8 w-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No active calls</p>
            </div>
          ) : selectedView === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {activeCalls.map((call) => (
                <Card key={call.id} className="relative">
                  <div className={`absolute top-2 right-2 h-2 w-2 rounded-full ${getStatusColor(call.status)} animate-pulse`} />
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {call.direction === 'outbound' ? (
                          <PhoneOutgoing className="h-4 w-4 text-blue-500" />
                        ) : (
                          <PhoneIncoming className="h-4 w-4 text-green-500" />
                        )}
                        <div>
                          <p className="text-sm font-medium">{call.contact_name}</p>
                          <p className="text-xs text-muted-foreground">{call.phone_number}</p>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Agent:</span>
                      <span className="font-medium">{call.agent_name}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="font-mono">{formatDuration(call.duration_seconds)}</span>
                    </div>
                    {call.call_list_name && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Campaign:</span>
                        <Badge variant="outline" className="text-xs">
                          {call.call_list_name}
                        </Badge>
                      </div>
                    )}
                    <div className="flex gap-1 pt-2">
                      <Button size="sm" variant="ghost" className="flex-1">
                        {call.muted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                      </Button>
                      <Button size="sm" variant="ghost" className="flex-1">
                        <Volume2 className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="destructive" className="flex-1">
                        <PhoneOff className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {activeCalls.map((call) => (
                <div key={call.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className={`h-2 w-2 rounded-full ${getStatusColor(call.status)} animate-pulse`} />
                    {call.direction === 'outbound' ? (
                      <PhoneOutgoing className="h-4 w-4 text-blue-500" />
                    ) : (
                      <PhoneIncoming className="h-4 w-4 text-green-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{call.contact_name}</p>
                      <p className="text-xs text-muted-foreground">{call.phone_number}</p>
                    </div>
                    <Badge variant="outline">{call.agent_name}</Badge>
                    {call.call_list_name && (
                      <Badge variant="secondary" className="text-xs">
                        {call.call_list_name}
                      </Badge>
                    )}
                    <span className="font-mono text-sm">{formatDuration(call.duration_seconds)}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost">
                      {call.muted ? <MicOff className="h-3 w-3" /> : <Mic className="h-3 w-3" />}
                    </Button>
                    <Button size="sm" variant="ghost">
                      <Volume2 className="h-3 w-3" />
                    </Button>
                    <Button size="sm" variant="destructive">
                      <PhoneOff className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

        {/* Agent Status Grid */}
        <Card>
          <CardHeader>
            <CardTitle>Agent Status</CardTitle>
            <CardDescription>
              {agentStatuses.filter(a => a.status !== 'offline').length} of {agentStatuses.length} agents online
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agentStatuses.map((agent) => (
                <div key={agent.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  <Avatar>
                    <AvatarFallback>
                      {agent.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{agent.name}</p>
                    <div className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full ${getStatusColor(agent.status)}`} />
                      <span className="text-xs text-muted-foreground capitalize">
                        {agent.status.replace('-', ' ')}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {agent.calls_today} {agent.calls_today === 1 ? 'call' : 'calls'} today
                    </p>
                    {agent.avg_call_time > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Avg: {formatDuration(Math.floor(agent.avg_call_time))}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(agent.last_activity), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Call History */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Calls</CardTitle>
            <CardDescription>Last 10 completed calls</CardDescription>
          </CardHeader>
          <CardContent>
            <CallHistory limit={10} />
          </CardContent>
        </Card>
      </div>

      {/* Right Column - Pending Contacts Queue */}
      <div className="space-y-6">
        <Card className="sticky top-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ListTodo className="h-5 w-5" />
                  My Call Queue
                </CardTitle>
                <CardDescription>
                  {pendingContacts.length} contact{pendingContacts.length !== 1 ? 's' : ''} to call
                </CardDescription>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => refetchQueue()}
                disabled={queueLoading}
              >
                {queueLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {queueLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : pendingContacts.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-900">All caught up!</p>
                <p className="text-xs text-muted-foreground">No pending contacts to call</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto">
                {pendingContacts.map((contact, index) => (
                  <div
                    key={contact.call_list_contact_id}
                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex-shrink-0">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary text-sm">
                          {getInitials(contact.full_name)}
                        </AvatarFallback>
                      </Avatar>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {contact.full_name || 'Unknown Contact'}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" />
                        <span className="truncate">{contact.phone_number}</span>
                      </div>
                      {contact.company && (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Building2 className="h-3 w-3" />
                          <span className="truncate">{contact.company}</span>
                        </div>
                      )}
                      <Badge variant="secondary" className="mt-1 text-[10px]">
                        {contact.call_list_name}
                      </Badge>
                    </div>
                    <div className="flex-shrink-0">
                      <Link href={`/dashboard/active-call/${encodeURIComponent(contact.phone_number)}`}>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Phone className="h-4 w-4 mr-1" />
                          Call
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {pendingContacts.length > 0 && (
              <div className="pt-3 border-t mt-3">
                <Link href={`/dashboard/active-call/${encodeURIComponent(pendingContacts[0].phone_number)}`}>
                  <Button className="w-full bg-green-600 hover:bg-green-700">
                    <Phone className="h-4 w-4 mr-2" />
                    Start Calling
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Stats */}
        {queueData?.stats && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Today's Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Calls Made</span>
                <span className="text-sm font-medium">{queueData.stats.callsToday}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Completed</span>
                <span className="text-sm font-medium">{queueData.stats.completedToday}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-muted-foreground">Remaining</span>
                <span className="text-sm font-medium">{queueData.stats.pendingCalls}</span>
              </div>
              {queueData.stats.avgCallDuration > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Avg Duration</span>
                  <span className="text-sm font-medium">
                    {formatDuration(queueData.stats.avgCallDuration)}
                  </span>
                </div>
              )}
              {queueData.stats.conversionRate > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Conversion Rate</span>
                  <span className="text-sm font-medium text-green-600">
                    {queueData.stats.conversionRate}%
                  </span>
                </div>
              )}
              {queueData.stats.callbacksScheduled > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Callbacks</span>
                  <span className="text-sm font-medium">{queueData.stats.callbacksScheduled}</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}