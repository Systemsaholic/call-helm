'use client'

import { useAuth } from '@/lib/hooks/useAuth'
import { useUserRole } from '@/lib/hooks/useUserRole'
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
  TrendingDown,
  Clock,
  Target,
  ArrowRight,
  Calendar,
  FileText,
  MessageSquare,
  Minus
} from 'lucide-react'
import { SystemHealthIndicator } from '@/components/system/SystemHealthIndicator'
import { useDashboardStats, formatRelativeTime, getTrendIndicator } from '@/lib/hooks/useDashboardStats'
import { useOnboardingProgress } from '@/lib/hooks/useOnboardingProgress'
import { OnboardingChecklist } from '@/components/dashboard/OnboardingChecklist'
import { AgentHome } from '@/components/dashboard/AgentHome'
import { Skeleton } from '@/components/ui/skeleton'

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const { isAgent, isLoading: roleLoading } = useUserRole()
  const router = useRouter()
  const { data: dashboardData, isLoading: statsLoading } = useDashboardStats()
  const { progress: onboardingProgress, updateProgress, isLoading: onboardingLoading } = useOnboardingProgress()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/auth/login')
    }
  }, [user, authLoading, router])

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    return null
  }

  // Show Agent-specific dashboard for agents
  if (isAgent) {
    return <AgentHome />
  }

  const stats = dashboardData?.stats || {
    totalCalls: 0,
    callsToday: 0,
    activeAgents: 0,
    totalAgents: 0,
    avgDuration: '0:00',
    avgDurationSeconds: 0,
    conversionRate: 0,
    activeCampaigns: 0,
    pendingContacts: 0,
    smsToday: 0,
    totalConversations: 0,
    callsTrend: 0
  }

  const recentActivity = dashboardData?.recentActivity || []
  const campaigns = dashboardData?.campaigns || []
  const userName = dashboardData?.user?.name || user.user_metadata?.full_name || 'User'

  return (
    <div className="px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      {/* Welcome Section */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back, {userName}!</h1>
          <p className="text-gray-600 mt-1">Here's what's happening in your call center today</p>
        </div>
        <SystemHealthIndicator variant="compact" />
      </div>

      {/* Onboarding Checklist */}
      {!onboardingLoading && (
        <OnboardingChecklist
          progress={onboardingProgress}
          onUpdateProgress={updateProgress}
          isLoading={onboardingLoading}
        />
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-primary/10 p-3 rounded-lg">
              <Phone className="h-6 w-6 text-primary" />
            </div>
            <span className="text-sm text-gray-500">Today</span>
          </div>
          {statsLoading ? (
            <Skeleton className="h-8 w-16 mb-2" />
          ) : (
            <h3 className="text-2xl font-bold text-gray-900">{stats.callsToday}</h3>
          )}
          <p className="text-gray-600 text-sm mt-1">Calls Made</p>
          <div className="mt-2 flex items-center text-sm">
            {stats.callsTrend > 0 ? (
              <>
                <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                <span className="text-green-500">{stats.callsTrend}% from yesterday</span>
              </>
            ) : stats.callsTrend < 0 ? (
              <>
                <TrendingDown className="h-4 w-4 text-red-500 mr-1" />
                <span className="text-red-500">{Math.abs(stats.callsTrend)}% from yesterday</span>
              </>
            ) : (
              <>
                <Minus className="h-4 w-4 text-gray-500 mr-1" />
                <span className="text-gray-500">Same as yesterday</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <div className="bg-accent/10 p-3 rounded-lg">
              <Users className="h-6 w-6 text-accent" />
            </div>
            <span className="text-sm text-gray-500">Active</span>
          </div>
          {statsLoading ? (
            <Skeleton className="h-8 w-24 mb-2" />
          ) : (
            <h3 className="text-2xl font-bold text-gray-900">{stats.activeAgents}/{stats.totalAgents}</h3>
          )}
          <p className="text-gray-600 text-sm mt-1">Agents Online</p>
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-accent h-2 rounded-full transition-all duration-300" 
                style={{ width: stats.totalAgents > 0 ? `${(stats.activeAgents / stats.totalAgents) * 100}%` : '0%' }}
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
          {statsLoading ? (
            <Skeleton className="h-8 w-16 mb-2" />
          ) : (
            <h3 className="text-2xl font-bold text-gray-900">{stats.avgDuration}</h3>
          )}
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
          {statsLoading ? (
            <Skeleton className="h-8 w-20 mb-2" />
          ) : (
            <h3 className="text-2xl font-bold text-gray-900">{stats.conversionRate}%</h3>
          )}
          <p className="text-gray-600 text-sm mt-1">Conversion</p>
          <div className="mt-2 flex items-center text-sm">
            {stats.conversionRate > 10 ? (
              <>
                <TrendingUp className="h-4 w-4 text-green-500 mr-1" />
                <span className="text-green-500">Above target</span>
              </>
            ) : (
              <>
                <Target className="h-4 w-4 text-gray-500 mr-1" />
                <span className="text-gray-500">Target: 15%</span>
              </>
            )}
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
              <Link href="/dashboard/calls" className="text-sm text-primary hover:text-primary/80">
                View all
                <ArrowRight className="h-4 w-4 inline ml-1" />
              </Link>
            </div>
            <div className="space-y-3">
              {statsLoading ? (
                <>
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </>
              ) : recentActivity.length > 0 ? (
                recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3 pb-3 border-b last:border-0">
                    <div className={`p-2 rounded-lg ${
                      activity.status === 'success' ? 'bg-green-100' :
                      activity.status === 'error' ? 'bg-red-100' :
                      activity.status === 'warning' ? 'bg-yellow-100' :
                      'bg-blue-100'
                    }`}>
                      {activity.status === 'success' ? <Phone className="h-4 w-4 text-green-600" /> :
                       activity.status === 'error' ? <Phone className="h-4 w-4 text-red-600" /> :
                       activity.status === 'warning' ? <MessageSquare className="h-4 w-4 text-yellow-600" /> :
                       <Users className="h-4 w-4 text-blue-600" />}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">
                        <span className="font-medium">{activity.agent}</span> {activity.action}
                      </p>
                      <p className="text-xs text-gray-500">
                        {activity.contact || activity.campaign} • {formatRelativeTime(activity.time)}
                        {activity.duration && ` • ${Math.floor(activity.duration / 60)}:${(activity.duration % 60).toString().padStart(2, '0')}`}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No recent activity
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Side Panel */}
        <div className="space-y-6">
          {/* Active Campaigns */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Campaigns</h3>
              <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-1 rounded">
                {campaigns.length} Total
              </span>
            </div>
            <div className="space-y-3">
              {statsLoading ? (
                <>
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </>
              ) : campaigns.length > 0 ? (
                campaigns.map((campaign) => (
                  <div key={campaign.id} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900 truncate">
                        {campaign.name}
                      </span>
                      <span className="text-xs text-gray-500">{campaign.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all duration-300" 
                        style={{ width: `${campaign.progress}%` }} 
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      {campaign.completedContacts} of {campaign.totalContacts} contacts
                      {campaign.status === 'active' && 
                        <span className="ml-2 text-green-600 font-medium">• Active</span>
                      }
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-gray-500 text-sm">
                  No campaigns yet
                </div>
              )}
            </div>
            <Link href="/dashboard/call-lists">
              <Button className="w-full mt-4" variant="outline" size="sm">
                View All Campaigns
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </Link>
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Quick Stats</h3>
              <BarChart3 className="h-5 w-5 text-gray-400" />
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Total Calls (30d)</span>
                <span className="text-sm font-medium text-gray-900">
                  {statsLoading ? <Skeleton className="h-4 w-8" /> : stats.totalCalls}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">SMS Today</span>
                <span className="text-sm font-medium text-gray-900">
                  {statsLoading ? <Skeleton className="h-4 w-8" /> : stats.smsToday || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Conversations</span>
                <span className="text-sm font-medium text-gray-900">
                  {statsLoading ? <Skeleton className="h-4 w-8" /> : stats.totalConversations || 0}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Pending Contacts</span>
                <span className="text-sm font-medium text-gray-900">
                  {statsLoading ? <Skeleton className="h-4 w-8" /> : stats.pendingContacts}
                </span>
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