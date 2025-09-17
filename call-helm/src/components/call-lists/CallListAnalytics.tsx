'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { useCallListStats } from '@/lib/hooks/useCallLists'
import { Phone, Users, Clock, TrendingUp, CheckCircle, XCircle } from 'lucide-react'

interface CallListAnalyticsProps {
  callListId: string
}

export function CallListAnalytics({ callListId }: CallListAnalyticsProps) {
  const { data: stats, isLoading } = useCallListStats(callListId)

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Loading analytics...</div>
        </CardContent>
      </Card>
    )
  }

  if (!stats) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">No analytics data available</div>
        </CardContent>
      </Card>
    )
  }

  const completionRate = stats.totalContacts > 0 
    ? Math.round((stats.completedContacts / stats.totalContacts) * 100)
    : 0

  const answerRate = stats.totalCalls > 0
    ? Math.round((stats.answeredCalls / stats.totalCalls) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalContacts}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
              <Users className="h-3 w-3" />
              <span>{stats.activeAgents} active agents</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionRate}%</div>
            <Progress value={completionRate} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Answer Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{answerRate}%</div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats.answeredCalls} of {stats.totalCalls} calls
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Call Duration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.floor(stats.averageCallDuration / 60)}:{(stats.averageCallDuration % 60).toString().padStart(2, '0')}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              minutes per call
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Contact Status Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Contact Status Breakdown</CardTitle>
          <CardDescription>
            Current status of all contacts in this call list
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-gray-400 rounded-full" />
                <span className="text-sm">Pending</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{stats.pendingContacts}</span>
                <span className="text-xs text-muted-foreground">
                  ({stats.totalContacts > 0 ? Math.round((stats.pendingContacts / stats.totalContacts) * 100) : 0}%)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-blue-500 rounded-full" />
                <span className="text-sm">Assigned</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{stats.assignedContacts}</span>
                <span className="text-xs text-muted-foreground">
                  ({stats.totalContacts > 0 ? Math.round((stats.assignedContacts / stats.totalContacts) * 100) : 0}%)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-yellow-500 rounded-full" />
                <span className="text-sm">In Progress</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{stats.inProgressContacts}</span>
                <span className="text-xs text-muted-foreground">
                  ({stats.totalContacts > 0 ? Math.round((stats.inProgressContacts / stats.totalContacts) * 100) : 0}%)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full" />
                <span className="text-sm">Completed</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{stats.completedContacts}</span>
                <span className="text-xs text-muted-foreground">
                  ({stats.totalContacts > 0 ? Math.round((stats.completedContacts / stats.totalContacts) * 100) : 0}%)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-orange-500 rounded-full" />
                <span className="text-sm">Skipped</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{stats.skippedContacts}</span>
                <span className="text-xs text-muted-foreground">
                  ({stats.totalContacts > 0 ? Math.round((stats.skippedContacts / stats.totalContacts) * 100) : 0}%)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full" />
                <span className="text-sm">Failed</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{stats.failedContacts}</span>
                <span className="text-xs text-muted-foreground">
                  ({stats.totalContacts > 0 ? Math.round((stats.failedContacts / stats.totalContacts) * 100) : 0}%)
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Call Outcomes */}
      <Card>
        <CardHeader>
          <CardTitle>Call Outcomes</CardTitle>
          <CardDescription>
            Breakdown of call attempts and their outcomes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Attempts</p>
              <p className="text-2xl font-bold">{stats.totalAttempts}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Avg Attempts/Contact</p>
              <p className="text-2xl font-bold">{stats.averageAttemptsPerContact}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Answered</p>
              <p className="text-2xl font-bold text-green-600">{stats.answeredCalls}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Voicemail</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.voicemailCalls}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">No Answer</p>
              <p className="text-2xl font-bold text-gray-600">{stats.noAnswerCalls}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Conversion Rate</p>
              <p className="text-2xl font-bold text-primary">{stats.conversionRate}%</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}