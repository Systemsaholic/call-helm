'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { useCallList } from '@/lib/hooks/useCallLists'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CallListContacts } from '@/components/call-lists/CallListContacts'
import { CallListScripts } from '@/components/call-lists/CallListScripts'
import { CallListAnalytics } from '@/components/call-lists/CallListAnalytics'
import { CampaignActivation } from '@/components/call-lists/CampaignActivation'
import { CDRUpload } from '@/components/call-lists/CDRUpload'
import { ArrowLeft, Edit, Play, Pause, Archive, Users, FileText, BarChart, Settings } from 'lucide-react'

export default function CallListDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('overview')
  
  const { data: callList, isLoading } = useCallList(params.id as string)

  if (isLoading) {
    return (
      <div className="px-6 lg:px-8 py-6">
        <div className="animate-pulse">
          <div className="h-8 w-48 bg-gray-200 rounded mb-4" />
          <div className="h-4 w-96 bg-gray-200 rounded" />
        </div>
      </div>
    )
  }

  if (!callList) {
    return (
      <div className="px-6 lg:px-8 py-6">
        <div className="text-center">
          <p className="text-muted-foreground">Call list not found</p>
          <Button onClick={() => router.push('/dashboard/call-lists')} className="mt-4">
            Back to Call Lists
          </Button>
        </div>
      </div>
    )
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800'
      case 'active': return 'bg-green-100 text-green-800'
      case 'paused': return 'bg-yellow-100 text-yellow-800'
      case 'completed': return 'bg-blue-100 text-blue-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="px-6 lg:px-8 py-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => router.push('/dashboard/call-lists')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight">{callList.name}</h1>
                <Badge className={getStatusColor(callList.status)}>
                  {callList.status}
                </Badge>
              </div>
              {callList.description && (
                <p className="text-muted-foreground mt-1">{callList.description}</p>
              )}
            </div>
          </div>
          
          <div className="flex gap-2">
            <CDRUpload 
              callListId={params.id as string}
              campaignName={callList.name}
            />
            <Button variant="outline">
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{callList.total_contacts || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Assigned</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{callList.assigned_contacts || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{callList.completed_contacts || 0}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(callList.total_contacts || 0) > 0 
                  ? Math.round((callList.completed_contacts || 0) / (callList.total_contacts || 1) * 100)
                  : 0}%
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activation">
              <Settings className="h-4 w-4 mr-2" />
              Activation
            </TabsTrigger>
            <TabsTrigger value="contacts">
              <Users className="h-4 w-4 mr-2" />
              Contacts
            </TabsTrigger>
            <TabsTrigger value="scripts">
              <FileText className="h-4 w-4 mr-2" />
              Scripts
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Campaign Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Campaign Type</p>
                    <p className="text-sm">{callList.campaign_type || 'Not specified'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Priority</p>
                    <p className="text-sm">Priority {callList.priority || 'Not set'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Distribution Strategy</p>
                    <p className="text-sm capitalize">{callList.distribution_strategy?.replace('_', ' ') || 'Manual'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Schedule</p>
                    <p className="text-sm">
                      {callList.daily_start_time && callList.daily_end_time 
                        ? `${callList.daily_start_time} - ${callList.daily_end_time}`
                        : 'No schedule set'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="activation">
            <CampaignActivation callListId={params.id as string} />
          </TabsContent>

          <TabsContent value="contacts">
            <CallListContacts callListId={params.id as string} />
          </TabsContent>

          <TabsContent value="scripts">
            <CallListScripts callListId={params.id as string} />
          </TabsContent>

          <TabsContent value="analytics">
            <CallListAnalytics callListId={params.id as string} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}