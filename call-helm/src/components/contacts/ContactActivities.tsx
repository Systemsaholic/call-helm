'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { useState, useEffect } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { format } from 'date-fns'
import { 
  Phone, 
  PhoneIncoming, 
  PhoneOutgoing,
  PhoneMissed,
  FileText, 
  Mail, 
  MessageSquare,
  Calendar,
  User,
  Activity,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ChevronDown
} from 'lucide-react'

interface ContactActivitiesProps {
  contactId: string
  limit?: number
}

interface ActivityItem {
  id: string
  contact_id: string
  organization_id: string
  member_id: string | null
  activity_type: string
  activity_subtype?: string
  title: string
  description?: string
  metadata?: any
  related_entity_type?: string
  related_entity_id?: string
  occurred_at: string
  created_at: string
  member?: {
    full_name: string
    email: string
  }
}

export function ContactActivities({ contactId, limit = 20 }: ContactActivitiesProps) {
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const supabase = createClient()
  const { user } = useAuth()

  // Get organization ID
  useEffect(() => {
    async function getOrganizationId() {
      if (!user?.id) return

      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

      if (member?.organization_id) {
        setOrganizationId(member.organization_id)
      }
    }

    getOrganizationId()
  }, [user])

  // Fetch activities
  const { data: activities, isLoading } = useQuery({
    queryKey: ['contact-activities', contactId, limit, showAll],
    enabled: !!contactId && !!organizationId,
    queryFn: async () => {
      // First get activities from the activities table
      let activitiesQuery = supabase
        .from('contact_activities')
        .select(`
          *,
          member:organization_members!contact_activities_member_id_fkey(
            full_name,
            email
          )
        `)
        .eq('contact_id', contactId)
        .eq('organization_id', organizationId!)
        .order('occurred_at', { ascending: false })

      if (!showAll && limit) {
        activitiesQuery = activitiesQuery.limit(limit)
      }

      const { data: activitiesData } = await activitiesQuery

      // Also get recent calls to merge into activities
      const { data: callsData } = await supabase
        .from('calls')
        .select(`
          id,
          start_time,
          end_time,
          status,
          direction,
          duration,
          member_id,
          member:organization_members!calls_member_id_fkey(
            full_name,
            email
          )
        `)
        .eq('contact_id', contactId)
        .eq('organization_id', organizationId!)
        .order('start_time', { ascending: false })
        .limit(showAll ? 100 : 10)

      // Convert calls to activity format
      const callActivities = callsData?.map(call => ({
        id: `call-${call.id}`,
        contact_id: contactId,
        organization_id: organizationId!,
        member_id: call.member_id,
        activity_type: 'call',
        activity_subtype: call.direction,
        title: `${call.direction === 'outbound' ? 'Outbound' : 'Inbound'} Call`,
        description: `Call ${call.status} - Duration: ${call.duration ? Math.floor(call.duration / 60) + 'm ' + (call.duration % 60) + 's' : 'N/A'}`,
        metadata: { 
          status: call.status, 
          duration: call.duration 
        },
        related_entity_type: 'calls',
        related_entity_id: call.id,
        occurred_at: call.start_time,
        created_at: call.start_time,
        member: call.member
      })) || []

      // Merge and sort all activities
      const allActivities = [...(activitiesData || []), ...callActivities]
        .sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())

      // Apply limit if not showing all
      if (!showAll && limit) {
        return allActivities.slice(0, limit)
      }

      return allActivities
    }
  })

  const getActivityIcon = (type: string, subtype?: string) => {
    switch (type) {
      case 'call':
        if (subtype === 'outbound') return <PhoneOutgoing className="h-4 w-4" />
        if (subtype === 'inbound') return <PhoneIncoming className="h-4 w-4" />
        return <Phone className="h-4 w-4" />
      case 'note':
        return <FileText className="h-4 w-4" />
      case 'email':
        return <Mail className="h-4 w-4" />
      case 'sms':
      case 'message':
        return <MessageSquare className="h-4 w-4" />
      case 'task':
      case 'callback':
        return <Calendar className="h-4 w-4" />
      case 'status_change':
        return <AlertCircle className="h-4 w-4" />
      default:
        return <Activity className="h-4 w-4" />
    }
  }

  const getActivityColor = (type: string, metadata?: any) => {
    if (type === 'call') {
      if (metadata?.status === 'completed') return 'text-green-600 bg-green-50'
      if (metadata?.status === 'failed' || metadata?.status === 'no-answer') return 'text-red-600 bg-red-50'
      return 'text-blue-600 bg-blue-50'
    }
    
    switch (type) {
      case 'note':
        return 'text-purple-600 bg-purple-50'
      case 'email':
        return 'text-indigo-600 bg-indigo-50'
      case 'sms':
      case 'message':
        return 'text-cyan-600 bg-cyan-50'
      case 'task':
      case 'callback':
        return 'text-orange-600 bg-orange-50'
      case 'status_change':
        return 'text-yellow-600 bg-yellow-50'
      default:
        return 'text-gray-600 bg-gray-50'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-500" />
      case 'failed':
      case 'no-answer':
      case 'busy':
        return <XCircle className="h-3 w-3 text-red-500" />
      default:
        return <Clock className="h-3 w-3 text-yellow-500" />
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!activities || activities.length === 0) {
    return (
      <div className="text-center py-12">
        <Activity className="h-12 w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-muted-foreground">No activities recorded yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200" />

        {/* Activity items */}
        <div className="space-y-4">
          {activities.map((activity, index) => (
            <div key={activity.id} className="relative flex gap-4">
              {/* Icon */}
              <div 
                className={`
                  relative z-10 flex h-10 w-10 items-center justify-center rounded-full
                  ${getActivityColor(activity.activity_type, activity.metadata)}
                `}
              >
                {getActivityIcon(activity.activity_type, activity.activity_subtype)}
              </div>

              {/* Content */}
              <div className="flex-1 pb-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{activity.title}</p>
                      {activity.activity_type === 'call' && activity.metadata?.status && (
                        <div className="flex items-center gap-1">
                          {getStatusIcon(activity.metadata.status)}
                          <Badge variant="outline" className="text-xs">
                            {activity.metadata.status}
                          </Badge>
                        </div>
                      )}
                    </div>
                    
                    {activity.description && (
                      <p className="text-sm text-muted-foreground">
                        {activity.description}
                      </p>
                    )}

                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {activity.member && (
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span>{activity.member.full_name}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        <span>{format(new Date(activity.occurred_at), 'MMM d, h:mm a')}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Load More Button */}
      {!showAll && activities.length >= (limit || 20) && (
        <div className="text-center pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAll(true)}
          >
            <ChevronDown className="h-4 w-4 mr-2" />
            Show All Activities
          </Button>
        </div>
      )}
    </div>
  )
}