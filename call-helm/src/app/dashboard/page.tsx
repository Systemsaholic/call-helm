'use client'

import { useAuth } from '@/lib/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import Link from 'next/link'
import { 
  Loader2, 
  Phone, 
  Users, 
  BarChart3,
  PhoneCall,
  TrendingUp,
  Clock,
  Target,
  ArrowRight,
  Calendar,
  FileText,
  MessageSquare
} from 'lucide-react'
import { SystemHealthIndicator } from '@/components/system/SystemHealthIndicator'

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  // Mock data - in production, this would come from your database
  const stats = {
    totalCalls: 1247,
    callsToday: 43,
    activeAgents: 8,
    totalAgents: 12,
    avgDuration: '4:32',
    conversionRate: 23.5,
    activeCampaigns: 3,
    pendingContacts: 856
  }

  const recentActivity = [
    { id: 1, agent: 'John Doe', action: 'Completed call', contact: 'Sarah Johnson', time: '5 minutes ago', status: 'success' },
    { id: 2, agent: 'Jane Smith', action: 'Started campaign', campaign: 'Q1 Sales', time: '15 minutes ago', status: 'info' },
    { id: 3, agent: 'Mike Wilson', action: 'Added contact', contact: 'Tech Corp', time: '1 hour ago', status: 'info' },
    { id: 4, agent: 'Emily Brown', action: 'Voicemail left', contact: 'Robert Lee', time: '2 hours ago', status: 'warning' },
  ]

  return (
    <div className="px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Welcome Section */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {user.user_metadata?.full_name || 'User'}!</h1>
          <p className="text-gray-600 mt-1">Here's what's happening in your call center today</p>
        </div>
        <SystemHealthIndicator variant="compact" />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-primary/10 p-3 rounded-lg">
              <Phone className="h-6 w-6 text-primary" />
            </div>
            <span className="text-sm text-gray-500">Today</span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{stats.callsToday}</h3>
          <p className="text-gray-600 text-sm mt-1">Calls Made</p>
          <div className="mt-2 flex items-center text-sm">
            <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
            <span className="text-green-500">12% from yesterday</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-accent/10 p-3 rounded-lg">
              <Users className="h-6 w-6 text-accent" />
            </div>
            <span className="text-sm text-gray-500">Active</span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{stats.activeAgents}/{stats.totalAgents}</h3>
          <p className="text-gray-600 text-sm mt-1">Agents Online</p>
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-accent h-2 rounded-full" 
                style={{ width: `${(stats.activeAgents / stats.totalAgents) * 100}%` }}
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Clock className="h-6 w-6 text-blue-600" />
            </div>
            <span className="text-sm text-gray-500">Average</span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{stats.avgDuration}</h3>
          <p className="text-gray-600 text-sm mt-1">Call Duration</p>
          <div className="mt-2 flex items-center text-sm text-gray-500">
            <span>Target: 5:00</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-purple-100 p-3 rounded-lg">
              <Target className="h-6 w-6 text-purple-600" />
            </div>
            <span className="text-sm text-gray-500">Rate</span>
          </div>
          <h3 className="text-2xl font-bold text-gray-900">{stats.conversionRate}%</h3>
          <p className="text-gray-600 text-sm mt-1">Conversion</p>
          <div className="mt-2 flex items-center text-sm">
            <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
            <span className="text-green-500">3.2% from last week</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link href="/dashboard/call-board">
                <Button className="w-full justify-center flex-col h-20" variant="outline">
                  <PhoneCall className="h-5 w-5 mb-1" />
                  <span className="text-xs">Start Calling</span>
                </Button>
              </Link>
              <Link href="/dashboard/contacts">
                <Button className="w-full justify-center flex-col h-20" variant="outline">
                  <Users className="h-5 w-5 mb-1" />
                  <span className="text-xs">Add Contacts</span>
                </Button>
              </Link>
              <Link href="/dashboard/call-lists">
                <Button className="w-full justify-center flex-col h-20" variant="outline">
                  <FileText className="h-5 w-5 mb-1" />
                  <span className="text-xs">Create List</span>
                </Button>
              </Link>
              <Link href="/dashboard/analytics">
                <Button className="w-full justify-center flex-col h-20" variant="outline">
                  <BarChart3 className="h-5 w-5 mb-1" />
                  <span className="text-xs">View Reports</span>
                </Button>
              </Link>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
              <Link href="/dashboard/activity" className="text-sm text-primary hover:text-primary/80">
                View all
                <ArrowRight className="h-4 w-4 inline ml-1" />
              </Link>
            </div>
            <div className="space-y-3">
              {recentActivity.map((activity) => (
                <div key={activity.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
                  <div className={`p-2 rounded-lg ${
                    activity.status === 'success' ? 'bg-green-100' :
                    activity.status === 'warning' ? 'bg-yellow-100' :
                    'bg-blue-100'
                  }`}>
                    {activity.status === 'success' ? <Phone className="h-4 w-4 text-green-600" /> :
                     activity.status === 'warning' ? <MessageSquare className="h-4 w-4 text-yellow-600" /> :
                     <Users className="h-4 w-4 text-blue-600" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{activity.agent}</span> {activity.action}
                    </p>
                    <p className="text-xs text-gray-500">
                      {activity.contact || activity.campaign} • {activity.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Active Campaigns */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Active Campaigns</h3>
              <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded">
                {stats.activeCampaigns} Active
              </span>
            </div>
            <div className="space-y-3">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900">Q1 Sales Outreach</span>
                  <span className="text-xs text-gray-500">68%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full" style={{ width: '68%' }} />
                </div>
                <p className="text-xs text-gray-500 mt-2">234 of 345 contacts</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900">Customer Follow-up</span>
                  <span className="text-xs text-gray-500">45%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-primary h-2 rounded-full" style={{ width: '45%' }} />
                </div>
                <p className="text-xs text-gray-500 mt-2">156 of 347 contacts</p>
              </div>
            </div>
            <Link href="/dashboard/call-lists">
              <Button className="w-full mt-4" variant="outline" size="sm">
                View All Campaigns
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>

          {/* Upcoming Tasks */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Today's Schedule</h3>
              <Calendar className="h-5 w-5 text-gray-400" />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 bg-green-500 rounded-full" />
                <span className="text-gray-600">09:00 - Team Meeting</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
                <span className="text-gray-600">10:00 - Sales Campaign</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 bg-purple-500 rounded-full" />
                <span className="text-gray-600">14:00 - Training Session</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                <span className="text-gray-600">16:00 - Performance Review</span>
              </div>
            </div>
          </div>

          {/* Getting Started */}
          <div className="bg-gradient-to-r from-primary to-accent rounded-lg p-6 text-white">
            <h3 className="text-lg font-semibold mb-2">Need Help?</h3>
            <p className="text-sm opacity-90 mb-4">
              Check out our quick start guide to get the most out of Call Helm.
            </p>
            <Button size="sm" variant="secondary" className="bg-white text-primary hover:bg-gray-100">
              View Guide
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}