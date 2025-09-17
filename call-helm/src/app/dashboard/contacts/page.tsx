'use client'

import { ContactsTable } from '@/components/contacts/ContactsTable'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Phone, UserCheck, UserX } from 'lucide-react'
import { useContacts } from '@/lib/hooks/useContacts'

export default function ContactsPage() {
  const { data: contacts } = useContacts()

  // Calculate statistics
  const stats = {
    total: contacts?.length || 0,
    active: contacts?.filter(c => c.status === 'active').length || 0,
    doNotCall: contacts?.filter(c => c.status === 'do_not_call').length || 0,
    inactive: contacts?.filter(c => c.status === 'inactive').length || 0,
  }

  return (
    <div className="px-6 lg:px-8 py-6">
      <div className="space-y-6">
        <div>
        <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
        <p className="text-muted-foreground">
          Manage your contact database and track communication history
        </p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground">
              In your organization
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.active}</div>
            <p className="text-xs text-muted-foreground">
              Ready to contact
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Do Not Call</CardTitle>
            <Phone className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.doNotCall}</div>
            <p className="text-xs text-muted-foreground">
              Opted out
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inactive</CardTitle>
            <UserX className="h-4 w-4 text-gray-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inactive}</div>
            <p className="text-xs text-muted-foreground">
              Not available
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Contacts Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Contacts</CardTitle>
          <CardDescription>
            View and manage all contacts in your organization
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContactsTable />
        </CardContent>
      </Card>
      </div>
    </div>
  )
}