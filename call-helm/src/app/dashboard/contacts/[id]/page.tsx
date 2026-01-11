'use client'

import { useParams, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/lib/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ContactHeader } from '@/components/contacts/ContactHeader'
import { ContactDetails } from '@/components/contacts/ContactDetails'
import { ContactNotes } from '@/components/contacts/ContactNotes'
import { ContactActivities } from '@/components/contacts/ContactActivities'
import { ContactViewSkeleton } from '@/components/contacts/ContactViewSkeleton'
import { CallHistory } from '@/components/calls/CallHistory'
import { SimpleCallButton } from '@/components/calls/SimpleCallButton'
import { ArrowLeft, User, FileText, Phone, Activity, Calendar, Loader2 } from 'lucide-react'
import { type Contact, contactKeys } from '@/lib/hooks/useContacts'

export default function ContactViewPage() {
  const params = useParams()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('overview')
  const { user } = useAuth()
  const supabase = createClient()
  const [organizationId, setOrganizationId] = useState<string | null>(null)

  // Get organization ID
  useEffect(() => {
    async function getOrganizationId() {
      if (!user?.id) return

      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

      if (member?.organization_id) {
        setOrganizationId(member.organization_id)
      }
    }

    getOrganizationId()
  }, [user])

  // Fetch contact details
  const { data: contact, isLoading, error } = useQuery({
    queryKey: contactKeys.detail(params.id as string),
    enabled: !!params.id && !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', params.id as string)
        .eq('organization_id', organizationId!)
        .single()

      if (error) throw error
      return data as Contact
    }
  })

  // Fetch contact statistics
  const { data: stats } = useQuery({
    queryKey: [...contactKeys.detail(params.id as string), 'stats'],
    enabled: !!params.id && !!organizationId,
    queryFn: async () => {
      // Get call count
      const { data: calls } = await supabase
        .from('calls')
        .select('id, status, duration')
        .eq('contact_id', params.id as string)
        .eq('organization_id', organizationId!)

      // Get notes count
      const { data: notes } = await supabase
        .from('contact_notes')
        .select('id')
        .eq('contact_id', params.id as string)
        .eq('organization_id', organizationId!)

      // Get activities count
      const { data: activities } = await supabase
        .from('contact_activities')
        .select('id')
        .eq('contact_id', params.id as string)
        .eq('organization_id', organizationId!)

      const totalCalls = calls?.length || 0
      const completedCalls = calls?.filter(c => c.status === 'completed').length || 0
      const totalDuration = calls?.reduce((acc, c) => acc + (c.duration || 0), 0) || 0

      return {
        totalCalls,
        completedCalls,
        avgCallDuration: completedCalls > 0 ? Math.round(totalDuration / completedCalls) : 0,
        totalNotes: notes?.length || 0,
        totalActivities: activities?.length || 0
      }
    }
  })

  if (isLoading || !organizationId) {
    return <ContactViewSkeleton />
  }

  if ((error || !contact) && organizationId) {
    return (
      <div className="px-6 lg:px-8 py-6">
        <div className="text-center">
          <User className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">Contact not found</p>
          <Button onClick={() => router.push('/dashboard/contacts')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Contacts
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="px-6 lg:px-8 py-6">
      <div className="space-y-6">
        {/* Back Navigation */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push('/dashboard/contacts')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Contacts
        </Button>

        {/* Contact Header */}
        {contact && <ContactHeader contact={contact} />}

        {/* Statistics Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Calls</CardDescription>
              <CardTitle className="text-2xl">{stats?.totalCalls || 0}</CardTitle>
            </CardHeader>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Completed Calls</CardDescription>
              <CardTitle className="text-2xl">{stats?.completedCalls || 0}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Avg Call Duration</CardDescription>
              <CardTitle className="text-2xl">
                {stats?.avgCallDuration ? `${Math.floor(stats.avgCallDuration / 60)}:${(stats.avgCallDuration % 60).toString().padStart(2, '0')}` : '0:00'}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Notes</CardDescription>
              <CardTitle className="text-2xl">{stats?.totalNotes || 0}</CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Activities</CardDescription>
              <CardTitle className="text-2xl">{stats?.totalActivities || 0}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="calls" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Call History
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Notes
            </TabsTrigger>
            <TabsTrigger value="activities" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Activities
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Contact Information</CardTitle>
                  <CardDescription>All details about this contact</CardDescription>
                </CardHeader>
                <CardContent>
                  {contact && <ContactDetails contact={contact} />}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Recent Notes</CardTitle>
                  <CardDescription>Latest notes for this contact</CardDescription>
                </CardHeader>
                <CardContent>
                  {contact && <ContactNotes contactId={contact.id} limit={3} compact />}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
                <CardDescription>Latest interactions with this contact</CardDescription>
              </CardHeader>
              <CardContent>
                {contact && <ContactActivities contactId={contact.id} limit={5} />}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Call History Tab */}
          <TabsContent value="calls" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Call History</CardTitle>
                    <CardDescription>All calls with this contact</CardDescription>
                  </div>
                  {contact && (
                    <SimpleCallButton 
                      phoneNumber={contact.phone_number}
                      contactId={contact.id}
                      contactName={contact.full_name}
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {contact && <CallHistory contactId={contact.id} />}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
                <CardDescription>All notes for this contact</CardDescription>
              </CardHeader>
              <CardContent>
                {contact && <ContactNotes contactId={contact.id} />}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Activities Tab */}
          <TabsContent value="activities" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Activity Timeline</CardTitle>
                <CardDescription>Complete history of all interactions</CardDescription>
              </CardHeader>
              <CardContent>
                {contact && <ContactActivities contactId={contact.id} />}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}