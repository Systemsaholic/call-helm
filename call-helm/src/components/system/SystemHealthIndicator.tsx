'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle, WifiOff, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface HealthStatus {
  healthy: boolean
  recentTimeouts?: number
  webhookStale?: boolean
  totalRecentCalls?: number
  failureRate?: number
  message?: string
  lastCheck?: string
}

interface SystemHealthIndicatorProps {
  variant?: 'compact' | 'detailed'
  className?: string
}

export function SystemHealthIndicator({ 
  variant = 'compact',
  className 
}: SystemHealthIndicatorProps) {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const response = await fetch('/api/calls/health-check')
        if (response.ok) {
          const data = await response.json()
          setHealth({
            ...data,
            lastCheck: new Date().toISOString()
          })
          setLastUpdate(new Date())
        } else {
          setHealth({
            healthy: false,
            message: 'Unable to check system health',
            lastCheck: new Date().toISOString()
          })
        }
      } catch (error) {
        console.error('Health check failed:', error)
        setHealth({
          healthy: false,
          message: 'Health check unavailable',
          lastCheck: new Date().toISOString()
        })
      } finally {
        setLoading(false)
      }
    }

    // Initial check
    checkHealth()

    // Check every 30 seconds
    const interval = setInterval(checkHealth, 30000)

    return () => clearInterval(interval)
  }, [])

  const getStatusIcon = () => {
    if (loading) {
      return <Activity className="h-4 w-4 animate-pulse text-gray-500" />
    }

    if (!health) {
      return <WifiOff className="h-4 w-4 text-gray-400" />
    }

    if (health.healthy) {
      return <CheckCircle className="h-4 w-4 text-green-500" />
    }

    if (health.webhookStale) {
      return <WifiOff className="h-4 w-4 text-orange-500" />
    }

    return <AlertCircle className="h-4 w-4 text-red-500" />
  }

  const getStatusText = () => {
    if (loading) return 'Checking...'
    if (!health) return 'Unknown'
    
    if (health.healthy) return 'System Healthy'
    if (health.webhookStale) return 'Connection Issues'
    if (health.recentTimeouts && health.recentTimeouts > 3) return 'Call Failures Detected'
    
    return 'System Issues'
  }

  const getStatusColor = () => {
    if (loading) return 'text-gray-500'
    if (!health) return 'text-gray-400'
    if (health.healthy) return 'text-green-600'
    if (health.webhookStale) return 'text-orange-600'
    return 'text-red-600'
  }

  const getTooltipContent = () => {
    if (!health) return 'System health unknown'

    const parts = []
    
    if (health.healthy) {
      parts.push('✅ All systems operational')
    } else {
      if (health.recentTimeouts && health.recentTimeouts > 0) {
        parts.push(`⚠️ ${health.recentTimeouts} recent call timeouts`)
      }
      if (health.webhookStale) {
        parts.push('🔌 Not receiving call updates')
      }
      if (health.failureRate && health.failureRate > 0) {
        parts.push(`📊 ${health.failureRate}% failure rate`)
      }
    }

    if (health.totalRecentCalls) {
      parts.push(`📞 ${health.totalRecentCalls} calls in last 10 min`)
    }

    const timeSinceUpdate = Math.floor((new Date().getTime() - new Date(lastUpdate).getTime()) / 1000)
    if (timeSinceUpdate < 60) {
      parts.push(`🕐 Updated ${timeSinceUpdate}s ago`)
    } else {
      parts.push(`🕐 Updated ${Math.floor(timeSinceUpdate / 60)}m ago`)
    }

    return parts.join('\n')
  }

  if (variant === 'compact') {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full border transition-colors cursor-help",
              health?.healthy ? "bg-green-50 border-green-200" : 
              health?.webhookStale ? "bg-orange-50 border-orange-200" :
              "bg-red-50 border-red-200",
              className
            )}>
              {getStatusIcon()}
              <span className={cn("text-xs font-medium", getStatusColor())}>
                {getStatusText()}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <pre className="text-xs whitespace-pre-wrap">{getTooltipContent()}</pre>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  // Detailed variant for dashboard
  return (
    <div className={cn(
      "p-4 rounded-lg border",
      health?.healthy ? "bg-green-50 border-green-200" : 
      health?.webhookStale ? "bg-orange-50 border-orange-200" :
      "bg-red-50 border-red-200",
      className
    )}>
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-2">
            {getStatusIcon()}
            <h3 className={cn("font-semibold", getStatusColor())}>
              {getStatusText()}
            </h3>
          </div>
          
          {health && !health.healthy && (
            <div className="space-y-1 text-sm">
              {health.recentTimeouts && health.recentTimeouts > 0 && (
                <p className="text-gray-600">
                  {health.recentTimeouts} calls timed out recently
                </p>
              )}
              {health.webhookStale && (
                <p className="text-gray-600">
                  Call system not receiving updates
                </p>
              )}
              {health.message && (
                <p className="text-gray-700 font-medium mt-2">
                  {health.message}
                </p>
              )}
            </div>
          )}
          
          {health?.healthy && health.totalRecentCalls && (
            <p className="text-sm text-gray-600">
              {health.totalRecentCalls} calls processed successfully
            </p>
          )}
        </div>
        
        <div className="text-xs text-gray-500">
          Last check: {new Date(lastUpdate).toLocaleTimeString()}
        </div>
      </div>
    </div>
  )
}