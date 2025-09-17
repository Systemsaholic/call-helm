'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell
} from 'recharts'
import {
  Zap,
  Brain,
  Phone,
  MessageSquare,
  DollarSign,
  TrendingUp,
  Calendar,
  AlertTriangle,
  Info,
  Download,
  Filter,
  RefreshCw
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { cn } from '@/lib/utils'

interface UsageStats {
  resource_type: string
  tier_included: number
  used_amount: number
  overage_amount: number
  overage_cost: number
  total_cost: number
  utilization_percent: number
}

interface UsageEvent {
  id: string
  resource_type: string
  amount: number
  unit_cost: number
  total_cost: number
  description: string
  created_at: string
  campaign?: { id: string; name: string }
  agent?: { id: string; full_name: string; email: string }
  contact?: { id: string; first_name: string; last_name: string; phone_number: string }
}

interface UsageData {
  period: { start: string; end: string }
  subscription: { tier: string; balance: number }
  usage_stats: UsageStats[]
  totals: {
    llm_tokens: number
    analytics_tokens: number
    call_minutes: number
    sms_messages: number
    total_cost: number
  }
  daily_breakdown: Record<string, {
    llm_tokens: number
    analytics_tokens: number
    call_minutes: number
    sms_messages: number
    total_cost: number
  }>
  recent_events: UsageEvent[]
  total_events: number
}

const resourceColors = {
  llm_tokens: 'hsl(var(--primary))',
  analytics_tokens: 'hsl(var(--accent))', 
  call_minutes: '#10B981',
  sms_messages: '#F59E0B'
}

const resourceIcons = {
  llm_tokens: Brain,
  analytics_tokens: BarChart,
  call_minutes: Phone,
  sms_messages: MessageSquare
}

const resourceLabels = {
  llm_tokens: 'LLM Tokens',
  analytics_tokens: 'Analytics Tokens',
  call_minutes: 'Call Minutes',
  sms_messages: 'SMS Messages'
}

export function UsageDashboard() {
  const { user } = useAuth()
  const [usageData, setUsageData] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedPeriod, setSelectedPeriod] = useState('month')
  const [refreshing, setRefreshing] = useState(false)

  const fetchUsageData = async (period = selectedPeriod) => {
    if (refreshing) return
    setRefreshing(true)
    
    try {
      const response = await fetch(`/api/usage/stats?period=${period}`)
      if (!response.ok) throw new Error('Failed to fetch usage data')
      
      const data = await response.json()
      if (data.success) {
        setUsageData(data)
      }
    } catch (error) {
      console.error('Error fetching usage data:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchUsageData()
  }, [selectedPeriod])

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period)
    setLoading(true)
  }

  const exportUsageData = () => {
    if (!usageData) return
    
    const csvData = [
      ['Date', 'Resource Type', 'Amount', 'Cost', 'Description'],
      ...usageData.recent_events.map(event => [
        format(new Date(event.created_at), 'yyyy-MM-dd HH:mm'),
        resourceLabels[event.resource_type as keyof typeof resourceLabels] || event.resource_type,
        event.amount.toString(),
        event.total_cost.toFixed(4),
        event.description
      ])
    ]
    
    const csvContent = csvData.map(row => row.join(',')).join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    
    const a = document.createElement('a')
    a.href = url
    a.download = `usage-report-${usageData.period.start}-${usageData.period.end}.csv`
    a.click()
    
    URL.revokeObjectURL(url)
  }

  if (loading && !usageData) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
        <div className="h-96 bg-gray-200 rounded-lg"></div>
      </div>
    )
  }

  if (!usageData) {
    return (
      <div className="text-center py-8">
        <AlertTriangle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900">Failed to load usage data</h3>
        <p className="text-gray-600 mt-2">Please try refreshing the page</p>
        <Button onClick={() => fetchUsageData()} className="mt-4">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    )
  }

  // Transform daily breakdown for charts
  const chartData = Object.entries(usageData.daily_breakdown).map(([date, data]) => ({
    date: format(new Date(date), 'MMM dd'),
    ...data
  }))

  // Prepare pie chart data
  const pieChartData = Object.entries(usageData.totals)
    .filter(([key, value]) => key !== 'total_cost' && value > 0)
    .map(([key, value]) => ({
      name: resourceLabels[key as keyof typeof resourceLabels] || key,
      value,
      color: resourceColors[key as keyof typeof resourceColors] || '#6B7280'
    }))

  const hasOverages = usageData.usage_stats.some(stat => stat.overage_amount > 0)
  const totalOverageCost = usageData.usage_stats.reduce((sum, stat) => sum + stat.overage_cost, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usage & Billing</h1>
          <p className="text-gray-600">
            Monitor your usage and costs for {usageData.period.start} to {usageData.period.end}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={selectedPeriod} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportUsageData}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button 
            variant="outline" 
            onClick={() => fetchUsageData()} 
            disabled={refreshing}
          >
            <RefreshCw className={cn("h-4 w-4 mr-2", refreshing && "animate-spin")} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Subscription Overview */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900 capitalize">
              {usageData.subscription.tier} Plan
            </h2>
            <p className="text-gray-600">
              Current balance: ${usageData.subscription.balance?.toFixed(2) || '0.00'}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-primary">
              ${usageData.totals.total_cost.toFixed(2)}
            </div>
            <p className="text-gray-600">Total usage this period</p>
          </div>
        </div>

        {hasOverages && (
          <div className="mt-4 p-3 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <span className="font-medium text-red-900">Usage Overages Detected</span>
            </div>
            <p className="text-sm text-red-700 mt-1">
              Additional charges: ${totalOverageCost.toFixed(2)}
            </p>
          </div>
        )}
      </div>

      {/* Resource Usage Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {usageData.usage_stats.map((stat) => {
          const Icon = resourceIcons[stat.resource_type as keyof typeof resourceIcons] || Info
          const color = resourceColors[stat.resource_type as keyof typeof resourceColors] || '#6B7280'
          const isOverage = stat.overage_amount > 0
          
          return (
            <Card key={stat.resource_type} className="relative overflow-hidden">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-gray-600">
                    {resourceLabels[stat.resource_type as keyof typeof resourceLabels] || stat.resource_type}
                  </CardTitle>
                  <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}20` }}>
                    <Icon className="h-4 w-4" style={{ color }} />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Used</span>
                      <span className="font-medium">
                        {stat.used_amount.toLocaleString()} / {stat.tier_included.toLocaleString()}
                      </span>
                    </div>
                    <Progress 
                      value={stat.utilization_percent} 
                      className="h-2 mt-1"
                      style={{
                        backgroundColor: isOverage ? '#FEE2E2' : '#F3F4F6'
                      }}
                    />
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-500">
                        {stat.utilization_percent.toFixed(1)}% used
                      </span>
                      {isOverage && (
                        <Badge variant="destructive" className="text-xs font-medium">
                          +{stat.overage_amount.toLocaleString()} over
                        </Badge>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Cost</span>
                    <span className="font-bold">
                      ${stat.total_cost.toFixed(4)}
                      {isOverage && (
                        <span className="text-red-600 text-xs ml-1">
                          (+${stat.overage_cost.toFixed(4)})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Charts and Analytics */}
      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trends">Usage Trends</TabsTrigger>
          <TabsTrigger value="breakdown">Resource Breakdown</TabsTrigger>
          <TabsTrigger value="events">Recent Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Daily Usage Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Line 
                      type="monotone" 
                      dataKey="total_cost" 
                      stroke="hsl(180, 60%, 40%)" 
                      strokeWidth={2}
                      name="Total Cost ($)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="breakdown" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Usage Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieChartData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                      >
                        {pieChartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Daily Resource Usage</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      {Object.entries(resourceColors).map(([resource, color]) => (
                        <Bar 
                          key={resource}
                          dataKey={resource} 
                          stackId="a"
                          fill={color}
                          name={resourceLabels[resource as keyof typeof resourceLabels]}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="events" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Recent Usage Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {usageData.recent_events.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No usage events found for this period</p>
                  </div>
                ) : (
                  usageData.recent_events.map((event) => {
                    const Icon = resourceIcons[event.resource_type as keyof typeof resourceIcons] || Info
                    const color = resourceColors[event.resource_type as keyof typeof resourceColors] || '#6B7280'
                    
                    return (
                      <div key={event.id} className="flex items-start gap-3 p-3 border rounded-lg hover:bg-gray-50">
                        <div className="p-2 rounded-lg flex-shrink-0" style={{ backgroundColor: `${color}20` }}>
                          <Icon className="h-4 w-4" style={{ color }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-gray-900 truncate">
                              {event.description}
                            </p>
                            <span className="text-sm font-bold text-gray-900">
                              ${event.total_cost.toFixed(4)}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                            <span>{event.amount.toLocaleString()} {event.resource_type}</span>
                            {event.campaign && (
                              <span>Campaign: {event.campaign.name}</span>
                            )}
                            {event.agent && (
                              <span>Agent: {event.agent.full_name}</span>
                            )}
                            <span>{formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
                
                {usageData.total_events > usageData.recent_events.length && (
                  <div className="text-center pt-4 border-t">
                    <p className="text-sm text-gray-600 mb-3">
                      Showing {usageData.recent_events.length} of {usageData.total_events} events
                    </p>
                    <Button variant="outline">
                      View All Events
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}