'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Users, UserPlus, Download, Upload } from 'lucide-react'
import { useCallListContacts } from '@/lib/hooks/useCallLists'
import { AssignContactsModal } from './modals/AssignContactsModal'

interface CallListContactsProps {
  callListId: string
}

export function CallListContacts({ callListId }: CallListContactsProps) {
  const [showAssignModal, setShowAssignModal] = useState(false)
  const { data: contacts, isLoading } = useCallListContacts(callListId)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-gray-100 text-gray-800'
      case 'assigned': return 'bg-blue-100 text-blue-800'
      case 'in_progress': return 'bg-yellow-100 text-yellow-800'
      case 'completed': return 'bg-green-100 text-green-800'
      case 'skipped': return 'bg-orange-100 text-orange-800'
      case 'failed': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Loading contacts...</div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Actions Bar */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Assigned Contacts</h3>
          <p className="text-sm text-muted-foreground">
            {contacts?.length || 0} contacts in this call list
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button variant="outline">
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button onClick={() => setShowAssignModal(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Contacts
          </Button>
        </div>
      </div>

      {/* Contacts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Contact List</CardTitle>
          <CardDescription>
            View and manage contacts assigned to this call list
          </CardDescription>
        </CardHeader>
        <CardContent>
          {contacts && contacts.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned To</TableHead>
                  <TableHead>Attempts</TableHead>
                  <TableHead>Last Attempt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((contact) => (
                  <TableRow key={contact.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {contact.contact?.full_name || 'Unknown'}
                        </div>
                        {contact.contact?.email && (
                          <div className="text-xs text-muted-foreground">
                            {contact.contact.email}
                          </div>
                        )}
                        {contact.contact?.company && (
                          <div className="text-xs text-muted-foreground">
                            {contact.contact.company}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{contact.contact?.phone_number || '-'}</TableCell>
                    <TableCell>
                      <Badge className={getStatusColor(contact.status)}>
                        {contact.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {contact.assigned_agent?.full_name || '-'}
                    </TableCell>
                    <TableCell>{contact.total_attempts || 0}</TableCell>
                    <TableCell>
                      {contact.last_attempt_at 
                        ? new Date(contact.last_attempt_at).toLocaleDateString()
                        : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8">
              <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground mb-4">No contacts assigned yet</p>
              <Button onClick={() => setShowAssignModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Contacts
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign Contacts Modal */}
      {showAssignModal && (
        <AssignContactsModal
          callList={{ id: callListId } as any}
          open={showAssignModal}
          onOpenChange={setShowAssignModal}
        />
      )}
    </div>
  )
}