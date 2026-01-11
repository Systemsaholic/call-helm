'use client'

import { useQuery } from '@tanstack/react-query'

interface DashboardStats {
  totalCalls: number
  callsToday: number
  activeAgents: number
  totalAgents: number
  avgDuration: string
  avgDurationSeconds: number
  conversionRate: number
  activeCampaigns: number
  pendingContacts: number
  smsToday: number
  totalConversations: number
  callsTrend: number
}

interface RecentActivity {
  id: string
  type: 'call' | 'sms'
  agent: string
  action: string
  contact?: string
  campaign?: string
  time: string
  status: 'success' | 'error' | 'warning' | 'info'
  duration?: number
}

interface Campaign {
  id: string
  name: string
  status: string
  totalContacts: number
  completedContacts: number
  pendingContacts: number
  progress: number
}

interface DashboardData {
  stats: DashboardStats
  recentActivity: RecentActivity[]
  campaigns: Campaign[]
  user: {
    name: string
  }
}

// Query key factory for dashboard
export const dashboardKeys = {
  all: ['dashboard'] as const,
  stats: () => [...dashboardKeys.all, 'stats'] as const,
}

export function useDashboardStats() {
  return useQuery({
    queryKey: dashboardKeys.stats(),
    queryFn: async () => {
      const response = await fetch('/api/dashboard/stats')
      
      if (!response.ok) {
        throw new Error('Failed to fetch dashboard statistics')
      }
      
      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch dashboard statistics')
      }
      
      return result.data as DashboardData
    },
    // Refetch every 30 seconds for real-time updates
    refetchInterval: 30000,
    // Keep data fresh
    staleTime: 10000,
    // Cache for 5 minutes
    gcTime: 5 * 60 * 1000,
    // Retry on failure
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  })
}

// Helper function to format relative time
export function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSecs = Math.floor(diffMs / 1000)
  const diffMins = Math.floor(diffSecs / 60)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSecs < 60) {
    return 'just now'
  } else if (diffMins < 60) {
    return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
  } else if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  } else if (diffDays < 7) {
    return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  } else {
    return date.toLocaleDateString()
  }
}

// Helper function to format duration
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// Helper function to get trend indicator
export function getTrendIndicator(value: number): {
  icon: 'up' | 'down' | 'neutral'
  color: string
  text: string
} {
  if (value > 5) {
    return {
      icon: 'up',
      color: 'text-green-500',
      text: `${value}% from last period`
    }
  } else if (value < -5) {
    return {
      icon: 'down',
      color: 'text-red-500',
      text: `${Math.abs(value)}% from last period`
    }
  } else {
    return {
      icon: 'neutral',
      color: 'text-gray-500',
      text: 'No significant change'
    }
  }
}