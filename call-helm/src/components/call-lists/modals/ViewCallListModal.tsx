'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { 
  Users, 
  Phone, 
  Calendar, 
  Clock,
  Target,
  TrendingUp,
  AlertCircle,
  BarChart3
} from 'lucide-react'
import { type CallList } from '@/lib/hooks/useCallLists'
import { format } from 'date-fns'

interface ViewCallListModalProps {
  callList: CallList | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ViewCallListModal({ callList, open, onOpenChange }: ViewCallListModalProps) {
  if (!callList) return null

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      active: 'default',
      draft: 'secondary',
      paused: 'outline',
      completed: 'default',
      archived: 'secondary',
    }
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>
  }

  const getPriorityBadge = (priority: number) => {
    const labels: Record<number, string> = {
      1: 'low',
      2: 'medium',
      3: 'high',
      4: 'urgent',
    }
    const variants: Record<number, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      4: 'destructive',
      3: 'default',
      2: 'secondary',
      1: 'outline',
    }
    return <Badge variant={variants[priority] || 'outline'}>{labels[priority] || 'unknown'}</Badge>
  }

  const completionRate = (callList.total_contacts || 0) > 0 
    ? Math.round(((callList.completed_contacts || 0) / (callList.total_contacts || 1)) * 100)
    : 0

  const successRate = (callList.completed_contacts || 0) > 0
    ? Math.round(((callList.successful_contacts || 0) / (callList.completed_contacts || 1)) * 100)
    : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Call List Details</DialogTitle>
          <DialogDescription>
            View complete information about this call list
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Name</p>
                <p className="font-medium">{callList.name}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Type</p>
                <p className="font-medium capitalize">{callList.campaign_type}</p>
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Status</p>
                {getStatusBadge(callList.status)}
              </div>

              <div>
                <p className="text-sm text-muted-foreground">Priority</p>
                {getPriorityBadge(callList.priority)}
              </div>
            </div>

            {callList.description && (
              <div className="mt-4">
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="text-sm mt-1">{callList.description}</p>
              </div>
            )}
          </div>

          {/* Schedule */}
          {(callList.start_date || callList.end_date) && (
            <div>
              <h3 className="text-lg font-semibold mb-3">Schedule</h3>
              <div className="grid grid-cols-2 gap-4">
                {callList.start_date && (
                  <div className="flex items-start gap-3">
                    <Calendar className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Start Date</p>
                      <p className="font-medium">
                        {format(new Date(callList.start_date), 'PPP')}
                      </p>
                    </div>
                  </div>
                )}

                {callList.end_date && (
                  <div className="flex items-start gap-3">
                    <Calendar className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">End Date</p>
                      <p className="font-medium">
                        {format(new Date(callList.end_date), 'PPP')}
                      </p>
                    </div>
                  </div>
                )}

                {(callList.daily_start_time && callList.daily_end_time) && (
                  <div className="flex items-start gap-3">
                    <Clock className="h-4 w-4 mt-1 text-muted-foreground" />
                    <div>
                      <p className="text-sm text-muted-foreground">Call Hours</p>
                      <p className="font-medium">
                        {callList.daily_start_time} - {callList.daily_end_time}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {callList.timezone}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <AlertCircle className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Weekend Calls</p>
                    <p className="font-medium">
                      {callList.active_days?.includes(6) || callList.active_days?.includes(7) ? 'Allowed' : 'Not Allowed'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Distribution Settings */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Distribution Settings</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <Target className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Strategy</p>
                  <p className="font-medium capitalize">
                    {callList.distribution_strategy.replace('_', ' ')}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="h-4 w-4 mt-1 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Max Attempts</p>
                  <p className="font-medium">{callList.max_attempts_per_contact}</p>
                </div>
              </div>

              {callList.max_contacts_per_agent && (
                <div className="flex items-start gap-3">
                  <Users className="h-4 w-4 mt-1 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Max per Agent</p>
                    <p className="font-medium">{callList.max_contacts_per_agent}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Progress & Statistics */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Progress & Statistics</h3>
            
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Overall Progress</span>
                  <span className="text-sm font-medium">{completionRate}%</span>
                </div>
                <Progress value={completionRate} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  {callList.completed_contacts} of {callList.total_contacts} contacts completed
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="border rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Total Contacts</p>
                  </div>
                  <p className="text-2xl font-bold mt-1">{callList.total_contacts}</p>
                </div>

                <div className="border rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Assigned</p>
                  </div>
                  <p className="text-2xl font-bold mt-1">{callList.assigned_contacts}</p>
                </div>

                <div className="border rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Success Rate</p>
                  </div>
                  <p className="text-2xl font-bold mt-1">{successRate}%</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Total Attempts</p>
                  </div>
                  <p className="text-xl font-bold mt-1">{callList.total_attempts}</p>
                  <p className="text-xs text-muted-foreground">
                    Avg: {(callList.completed_contacts || 0) > 0 
                      ? ((callList.total_attempts || 0) / (callList.completed_contacts || 1)).toFixed(1)
                      : 0} per contact
                  </p>
                </div>

                <div className="border rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Total Duration</p>
                  </div>
                  <p className="text-xl font-bold mt-1">
                    {Math.floor((callList.total_duration || 0) / 60)}m
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Avg: {(callList.total_attempts || 0) > 0 
                      ? Math.floor((callList.total_duration || 0) / (callList.total_attempts || 1))
                      : 0}s per call
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Metadata */}
          <div className="border-t pt-4">
            <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>
                <span>Created: </span>
                <span>{format(new Date(callList.created_at), 'PPp')}</span>
              </div>
              {callList.updated_at && (
                <div>
                  <span>Updated: </span>
                  <span>{format(new Date(callList.updated_at), 'PPp')}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}