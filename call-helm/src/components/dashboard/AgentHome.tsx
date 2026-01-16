'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAgentQueue } from '@/lib/hooks/useAgentAssignments'
import { useUpcomingCallbacks } from '@/lib/hooks/useCallTracking'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Phone,
  PhoneCall,
  Clock,
  Target,
  Calendar,
  ArrowRight,
  User,
  Building2,
  TrendingUp,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
} from 'lucide-react'
import { formatUSPhone } from '@/lib/utils/phone'

export function AgentHome() {
  const router = useRouter()
  const { data: queueData, isLoading: queueLoading } = useAgentQueue()
  const { data: callbacks, isLoading: callbacksLoading } = useUpcomingCallbacks()

  const stats = queueData?.stats
  const contacts = queueData?.contacts || []

  // Format duration as MM:SS
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Get priority contacts (high priority or callbacks due)
  const priorityContacts = contacts.filter(c => c.priority && c.priority > 5).slice(0, 3)

  // Get next contacts to call
  const nextContacts = contacts.slice(0, 5)

  return (
    <div className="px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Welcome Section */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Dashboard</h1>
        <p className="text-gray-600 mt-1">Your assigned contacts and call activity</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="bg-primary/10 p-2 rounded-lg">
                <Phone className="h-5 w-5 text-primary" />
              </div>
            </div>
            {queueLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <h3 className="text-2xl font-bold text-gray-900">{stats?.callsToday || 0}</h3>
            )}
            <p className="text-gray-600 text-sm">Calls Today</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="bg-green-100 p-2 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
            </div>
            {queueLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <h3 className="text-2xl font-bold text-gray-900">{stats?.completedToday || 0}</h3>
            )}
            <p className="text-gray-600 text-sm">Completed Today</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="bg-blue-100 p-2 rounded-lg">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
            </div>
            {queueLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <h3 className="text-2xl font-bold text-gray-900">
                {stats?.avgCallDuration ? formatDuration(stats.avgCallDuration) : '0:00'}
              </h3>
            )}
            <p className="text-gray-600 text-sm">Avg Duration</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <div className="bg-purple-100 p-2 rounded-lg">
                <Target className="h-5 w-5 text-purple-600" />
              </div>
            </div>
            {queueLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <h3 className="text-2xl font-bold text-gray-900">{stats?.conversionRate || 0}%</h3>
            )}
            <p className="text-gray-600 text-sm">Conversion Rate</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content - My Queue */}
        <div className="lg:col-span-2 space-y-6">
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <Link href="/dashboard/call-board">
                  <Button className="w-full h-20 flex-col" variant="default">
                    <PhoneCall className="h-5 w-5 mb-1" />
                    <span className="text-xs">Start Calling</span>
                  </Button>
                </Link>
                <Link href="/dashboard/messages">
                  <Button className="w-full h-20 flex-col" variant="outline">
                    <MessageSquare className="h-5 w-5 mb-1" />
                    <span className="text-xs">Messages</span>
                  </Button>
                </Link>
                {nextContacts[0] && (
                  <Link href={`/dashboard/active-call/${encodeURIComponent(nextContacts[0].phone_number)}`}>
                    <Button className="w-full h-20 flex-col" variant="outline">
                      <User className="h-5 w-5 mb-1" />
                      <span className="text-xs">Next Contact</span>
                    </Button>
                  </Link>
                )}
              </div>
            </CardContent>
          </Card>

          {/* My Call Queue */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                <Phone className="h-5 w-5" />
                My Call Queue
              </CardTitle>
              <Badge variant="secondary">
                {stats?.pendingCalls || 0} pending
              </Badge>
            </CardHeader>
            <CardContent>
              {queueLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : nextContacts.length > 0 ? (
                <div className="space-y-3">
                  {nextContacts.map((contact, index) => (
                    <div
                      key={contact.call_list_contact_id}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        index === 0 ? 'bg-primary/5 border-primary/20' : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          index === 0 ? 'bg-primary/10' : 'bg-gray-100'
                        }`}>
                          <User className={`h-4 w-4 ${
                            index === 0 ? 'text-primary' : 'text-gray-500'
                          }`} />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {contact.full_name || 'Unknown Contact'}
                          </p>
                          <div className="flex items-center gap-2 text-sm text-gray-500">
                            <span>{formatUSPhone(contact.phone_number)}</span>
                            {contact.company && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Building2 className="h-3 w-3" />
                                  {contact.company}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {contact.call_list_name}
                        </Badge>
                        <Link href={`/dashboard/active-call/${encodeURIComponent(contact.phone_number)}`}>
                          <Button size="sm" variant={index === 0 ? 'default' : 'outline'}>
                            <PhoneCall className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-green-500" />
                  <p className="font-medium">All caught up!</p>
                  <p className="text-sm">No contacts in your queue right now.</p>
                </div>
              )}
              {nextContacts.length > 0 && (
                <Link href="/dashboard/call-board">
                  <Button variant="outline" className="w-full mt-4">
                    View All Contacts
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Priority Contacts */}
          {priorityContacts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-amber-500" />
                  Priority Contacts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {priorityContacts.map((contact) => (
                    <div key={contact.call_list_contact_id} className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900 text-sm">
                          {contact.full_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatUSPhone(contact.phone_number)}
                        </p>
                      </div>
                      <Link href={`/dashboard/active-call/${encodeURIComponent(contact.phone_number)}`}>
                        <Button size="sm" variant="outline">
                          <PhoneCall className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Scheduled Callbacks */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Upcoming Callbacks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {callbacksLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : callbacks && callbacks.length > 0 ? (
                <div className="space-y-3">
                  {callbacks.slice(0, 5).map((callback: any) => (
                    <div
                      key={callback.id}
                      className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-gray-900 text-sm">
                          {callback.call_list_contact?.contact?.full_name || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500">
                          {new Date(callback.callback_date).toLocaleString()}
                        </p>
                      </div>
                      <Link
                        href={`/dashboard/active-call/${encodeURIComponent(
                          callback.call_list_contact?.contact?.phone_number || ''
                        )}`}
                      >
                        <Button size="sm" variant="outline">
                          <PhoneCall className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">
                  No upcoming callbacks
                </p>
              )}
            </CardContent>
          </Card>

          {/* Today's Performance */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Today's Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total Assigned</span>
                  <span className="font-medium">{stats?.totalAssigned || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Calls Made</span>
                  <span className="font-medium">{stats?.callsToday || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Completed</span>
                  <span className="font-medium text-green-600">{stats?.completedToday || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Remaining</span>
                  <span className="font-medium text-amber-600">{stats?.pendingCalls || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Callbacks Scheduled</span>
                  <span className="font-medium">{stats?.callbacksScheduled || 0}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
