'use client'

import { CallListsTable } from '@/components/call-lists/CallListsTable'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Phone, Users, Target, TrendingUp } from 'lucide-react'
import { useCallLists } from '@/lib/hooks/useCallLists'

export default function CallListsPage() {
  const { data: callLists } = useCallLists()

  // Calculate statistics
  const stats = {
    total: callLists?.length || 0,
    active: callLists?.filter(l => l.status === 'active').length || 0,
    totalContacts: callLists?.reduce((sum, l) => sum + (l.total_contacts || 0), 0) || 0,
    completedContacts: callLists?.reduce((sum, l) => sum + (l.completed_contacts || 0), 0) || 0,
  }

  const completionRate = stats.totalContacts > 0 
    ? Math.round((stats.completedContacts / stats.totalContacts) * 100)
    : 0

  return (
    <div className="px-6 lg:px-8 py-6">
      <div className="space-y-6">
        <div>
        <h1 className="text-3xl font-bold tracking-tight">Call Lists</h1>
        <p className="text-muted-foreground">
          Manage campaigns and distribute contacts to your agents
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Campaigns</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              {stats.active} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            <Users className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalContacts}</div>
            <p className="text-xs text-muted-foreground">
              Across all campaigns
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed</CardTitle>
            <Phone className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.completedContacts}</div>
            <p className="text-xs text-muted-foreground">
              Contacts called
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completionRate}%</div>
            <p className="text-xs text-muted-foreground">
              Overall progress
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Call Lists Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Call Lists</CardTitle>
          <CardDescription>
            View and manage your calling campaigns
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CallListsTable />
        </CardContent>
      </Card>
      </div>
    </div>
  )
}