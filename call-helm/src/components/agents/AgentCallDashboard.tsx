'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { useRealtimeContactAssignments } from '@/lib/hooks/useRealtimeSubscription'
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import {
  Phone,
  PhoneOff,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  User,
  Users,
  CheckCircle,
  XCircle,
  AlertCircle,
  Calendar,
  TrendingUp,
  Pause,
  Play,
  RefreshCw,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  MessageSquare,
  FileText,
  ChevronRight
} from 'lucide-react'
import { toast } from 'sonner'
import { format, formatDistanceToNow } from 'date-fns'

interface CallQueueItem {
  id: string
  call_list_contact_id: string
  contact: {
    id: string
    full_name: string
    phone_number: string
    company?: string
  }
  campaign: {
    id: string
    name: string
    script_template?: string
  }
  priority: number
  attempts: number
  last_attempt_at?: string
  notes?: string
}

interface ActiveCall {
  id: string
  contact_name: string
  phone_number: string
  duration: number
  status: 'connecting' | 'ringing' | 'active' | 'ended'
  muted: boolean
  onHold: boolean
}

interface CallStats {
  totalCalls: number
  answeredCalls: number
  avgCallDuration: number
  conversionRate: number
  callsToday: number
  callsThisWeek: number
}

export function AgentCallDashboard() {
  const { supabase, user } = useAuth()
  const [activeTab, setActiveTab] = useState('queue')
  const [callQueue, setCallQueue] = useState<CallQueueItem[]>([])
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null)
  const [isAvailable, setIsAvailable] = useState(true)
  const [callStats, setCallStats] = useState<CallStats>({
    totalCalls: 0,
    answeredCalls: 0,
    avgCallDuration: 0,
    conversionRate: 0,
    callsToday: 0,
    callsThisWeek: 0
  })
  const [callTimer, setCallTimer] = useState(0)
  const [selectedContact, setSelectedContact] = useState<CallQueueItem | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)

  // Ref to hold fetchCallQueue for use in callbacks
  const fetchCallQueueRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // Handle real-time assignment changes
  const handleAssignmentChange = useCallback(
    (payload: RealtimePostgresChangesPayload<any>) => {
      console.log('📋 Contact assignment change:', payload.eventType, payload.new || payload.old)

      // Refresh the queue when assignments change
      if (payload.eventType === 'INSERT') {
        // New contact assigned - show toast and refetch queue
        toast.info('New contact assigned to your queue')
        fetchCallQueueRef.current()
      } else if (payload.eventType === 'UPDATE') {
        // Contact updated - refetch queue to get latest status
        fetchCallQueueRef.current()
      } else if (payload.eventType === 'DELETE') {
        // Contact removed from queue - remove from local state
        const deletedId = (payload.old as any)?.id
        if (deletedId) {
          setCallQueue(prev => prev.filter(item => item.id !== deletedId))
        }
      }
    },
    []
  )

  // Subscribe to real-time contact assignment updates
  useRealtimeContactAssignments(memberId, handleAssignmentChange)

  // Timer for active call
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (activeCall && activeCall.status === 'active') {
      interval = setInterval(() => {
        setCallTimer(prev => prev + 1)
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [activeCall])

  // Fetch call queue
  const fetchCallQueue = async () => {
    if (!user) return

    const { data: member } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!member) return

    // Store member ID for real-time subscription
    if (member.id !== memberId) {
      setMemberId(member.id)
    }

    const { data, error } = await supabase
      .from('call_list_contacts')
      .select(`
        *,
        contact:contacts!call_list_contacts_contact_id_fkey(
          id,
          full_name,
          phone_number,
          company
        ),
        call_list:call_lists!call_list_contacts_call_list_id_fkey(
          id,
          name,
          script_template,
          status
        )
      `)
      .eq('assigned_to', member.id)
      .in('status', ['assigned', 'in_progress'])
      .eq('call_list.status', 'active')
      .order('priority', { ascending: false })
      .order('sequence_number')
      .limit(20)

    if (!error && data) {
      setCallQueue(data.map(item => ({
        id: item.id,
        call_list_contact_id: item.id,
        contact: item.contact,
        campaign: {
          id: item.call_list.id,
          name: item.call_list.name,
          script_template: item.call_list.script_template
        },
        priority: item.priority,
        attempts: item.total_attempts || 0,
        last_attempt_at: item.last_attempt_at,
        notes: item.outcome_notes
      })))
    }
  }

  // Keep the ref updated with the latest fetchCallQueue
  useEffect(() => {
    fetchCallQueueRef.current = fetchCallQueue
  })

  // Fetch call statistics
  const fetchCallStats = async () => {
    if (!user) return

    const { data: member } = await supabase
      .from('organization_members')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!member) return

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const weekAgo = new Date()
    weekAgo.setDate(weekAgo.getDate() - 7)

    const { data: stats } = await supabase
      .from('call_attempts')
      .select('*')
      .eq('agent_id', member.id)

    if (stats) {
      const todayCalls = stats.filter(c => new Date(c.created_at) >= today)
      const weekCalls = stats.filter(c => new Date(c.created_at) >= weekAgo)
      const answered = stats.filter(c => c.disposition === 'answered')
      const conversions = stats.filter(c => 
        c.disposition === 'sale_made' || 
        c.disposition === 'appointment_set'
      )

      setCallStats({
        totalCalls: stats.length,
        answeredCalls: answered.length,
        avgCallDuration: answered.length > 0
          ? Math.round(answered.reduce((acc, c) => acc + (c.duration_seconds || 0), 0) / answered.length)
          : 0,
        conversionRate: stats.length > 0
          ? Math.round((conversions.length / stats.length) * 100)
          : 0,
        callsToday: todayCalls.length,
        callsThisWeek: weekCalls.length
      })
    }
  }

  useEffect(() => {
    fetchCallQueue()
    fetchCallStats()
  }, [user])

  const initiateCall = async (item: CallQueueItem) => {
    try {
      setSelectedContact(item)
      
      // Simulate call initiation (replace with actual API call)
      const response = await fetch('/api/voice/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contactId: item.contact.id,
          phoneNumber: item.contact.phone_number,
          callListContactId: item.call_list_contact_id,
          campaignId: item.campaign.id
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to initiate call')
      }

      const { callId } = await response.json()

      setActiveCall({
        id: callId,
        contact_name: item.contact.full_name,
        phone_number: item.contact.phone_number,
        duration: 0,
        status: 'connecting',
        muted: false,
        onHold: false
      })

      setCallTimer(0)
      
      // Simulate call connection
      setTimeout(() => {
        setActiveCall(prev => prev ? {...prev, status: 'ringing'} : null)
      }, 1000)
      
      setTimeout(() => {
        setActiveCall(prev => prev ? {...prev, status: 'active'} : null)
      }, 3000)

      toast.success('Call initiated')
    } catch (error: any) {
      toast.error(error.message || 'Failed to initiate call')
    }
  }

  const endCall = async () => {
    if (!activeCall) return

    try {
      await fetch(`/api/voice/call?callId=${activeCall.id}`, {
        method: 'DELETE'
      })

      setActiveCall(null)
      setCallTimer(0)
      setSelectedContact(null)
      
      // Refresh queue
      fetchCallQueue()
      fetchCallStats()
      
      toast.success('Call ended')
    } catch (error) {
      toast.error('Failed to end call')
    }
  }

  const toggleMute = () => {
    if (activeCall) {
      setActiveCall({...activeCall, muted: !activeCall.muted})
    }
  }

  const toggleHold = () => {
    if (activeCall) {
      setActiveCall({...activeCall, onHold: !activeCall.onHold})
    }
  }

  const formatCallDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="space-y-6">
      {/* Header with availability toggle */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Call Dashboard</h2>
          <p className="text-gray-500">Manage your calls and view statistics</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Availability:</span>
            <Button
              variant={isAvailable ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsAvailable(!isAvailable)}
            >
              {isAvailable ? (
                <>
                  <Play className="h-4 w-4 mr-2" />
                  Available
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4 mr-2" />
                  Unavailable
                </>
              )}
            </Button>
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            fetchCallQueue()
            fetchCallStats()
          }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Active Call Section */}
      {activeCall && (
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Phone className="h-5 w-5 text-blue-600" />
                  {activeCall.status === 'active' && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full animate-pulse" />
                  )}
                </div>
                <div>
                  <CardTitle className="text-lg">{activeCall.contact_name}</CardTitle>
                  <p className="text-sm text-gray-600">{activeCall.phone_number}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={
                  activeCall.status === 'active' ? 'default' :
                  activeCall.status === 'ringing' ? 'secondary' :
                  'outline'
                }>
                  {activeCall.status}
                </Badge>
                <span className="font-mono text-lg">
                  {formatCallDuration(callTimer)}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={activeCall.muted ? 'destructive' : 'outline'}
                onClick={toggleMute}
              >
                {activeCall.muted ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant={activeCall.onHold ? 'secondary' : 'outline'}
                onClick={toggleHold}
              >
                {activeCall.onHold ? (
                  <Play className="h-4 w-4" />
                ) : (
                  <Pause className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={endCall}
                className="ml-auto"
              >
                <PhoneOff className="h-4 w-4 mr-2" />
                End Call
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Today's Calls</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{callStats.callsToday}</div>
            <p className="text-xs text-gray-500 mt-1">
              {callStats.answeredCalls} answered
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">This Week</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{callStats.callsThisWeek}</div>
            <p className="text-xs text-gray-500 mt-1">
              {callStats.totalCalls} total
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Avg Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCallDuration(callStats.avgCallDuration)}
            </div>
            <p className="text-xs text-gray-500 mt-1">per call</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Conversion</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{callStats.conversionRate}%</div>
            <p className="text-xs text-gray-500 mt-1">success rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="queue">
            <Users className="h-4 w-4 mr-2" />
            Call Queue ({callQueue.length})
          </TabsTrigger>
          <TabsTrigger value="script">
            <FileText className="h-4 w-4 mr-2" />
            Script
          </TabsTrigger>
          <TabsTrigger value="history">
            <Clock className="h-4 w-4 mr-2" />
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="space-y-4">
          {!isAvailable && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                You are currently unavailable. Set yourself as available to receive calls.
              </AlertDescription>
            </Alert>
          )}
          
          {callQueue.length === 0 ? (
            <Card>
              <CardContent className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">No contacts in your queue</p>
                <p className="text-sm text-gray-400 mt-1">
                  Contacts will appear here when campaigns are active
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {callQueue.map((item) => (
                <Card key={item.id} className="hover:bg-gray-50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <User className="h-4 w-4 text-gray-400" />
                          <div>
                            <p className="font-medium">{item.contact.full_name}</p>
                            <p className="text-sm text-gray-500">{item.contact.phone_number}</p>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                          <span>{item.campaign.name}</span>
                          {item.attempts > 0 && (
                            <span>Attempts: {item.attempts}</span>
                          )}
                          {item.last_attempt_at && (
                            <span>
                              Last: {formatDistanceToNow(new Date(item.last_attempt_at), { addSuffix: true })}
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => initiateCall(item)}
                        disabled={!isAvailable || !!activeCall}
                      >
                        <Phone className="h-4 w-4 mr-2" />
                        Call
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="script">
          {selectedContact ? (
            <Card>
              <CardHeader>
                <CardTitle>Call Script</CardTitle>
                <CardDescription>
                  {selectedContact.campaign.name} - {selectedContact.contact.full_name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="whitespace-pre-wrap font-mono text-sm">
                  {selectedContact.campaign.script_template || 'No script available for this campaign.'}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="text-center py-8">
                <FileText className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500">Select a contact to view the script</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle>Recent Calls</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-500">Call history will appear here</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}