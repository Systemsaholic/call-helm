'use client'

import { useState } from 'react'
import { useConfirmation } from '@/lib/hooks/useConfirmation'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Phone,
  Mail,
  Building,
  MapPin,
  MoreHorizontal,
  Search,
  Filter,
  Download,
  Upload,
  UserPlus,
  Trash2,
  Edit,
  Eye,
  Tag,
  PhoneOff,
  History,
  User,
} from 'lucide-react'
import { useContacts, useDeleteContacts, type Contact, type ContactFilters } from '@/lib/hooks/useContacts'
import { AddContactModal } from './modals/AddContactModal'
import { EditContactModal } from './modals/EditContactModal'
import { ImportContactsModal } from './modals/ImportContactsModal'
import { ContactsTableSkeleton } from './ContactsTableSkeleton'
import { useRouter } from 'next/navigation'
import { SimpleCallButton } from '@/components/calls/SimpleCallButton'
import { CallDetailsSlideout } from '@/components/calls/CallDetailsSlideout'
import { formatPhoneNumber } from '@/lib/utils'

export function ContactsTable() {
  const [filters, setFilters] = useState<ContactFilters>({})
  const [selectedContacts, setSelectedContacts] = useState<string[]>([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const [selectedCallId, setSelectedCallId] = useState<string | null>(null)
  const router = useRouter()

  const { data: contacts, isLoading } = useContacts(filters)
  const deleteContacts = useDeleteContacts()
  const confirmation = useConfirmation()
  
  const handleViewCallHistory = async (contactId: string) => {
    // Get the most recent call for this contact
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    
    const { data: call, error } = await supabase
      .from('calls')
      .select('id')
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    
    if (call) {
      setSelectedCallId(call.id)
    } else {
      // Create a toast notification if no calls found
      const { toast } = await import('sonner')
      toast.info('No call history found for this contact')
    }
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked && contacts) {
      setSelectedContacts(contacts.map(c => c.id))
    } else {
      setSelectedContacts([])
    }
  }

  const handleSelectContact = (contactId: string, checked: boolean) => {
    if (checked) {
      setSelectedContacts([...selectedContacts, contactId])
    } else {
      setSelectedContacts(selectedContacts.filter(id => id !== contactId))
    }
  }

  const handleDeleteSelected = () => {
    if (selectedContacts.length > 0) {
      confirmation.showConfirmation({
        title: 'Delete Contacts',
        description: `Are you sure you want to delete ${selectedContacts.length} contact(s)? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        variant: 'destructive',
        onConfirm: async () => {
          deleteContacts.mutate(selectedContacts, {
            onSuccess: () => setSelectedContacts([])
          })
        }
      })
    }
  }

  const handleExportContacts = () => {
    if (!contacts) return

    const csv = [
      ['Name', 'Phone', 'Email', 'Company', 'Position', 'City', 'State', 'Status', 'Tags'].join(','),
      ...contacts.map(c => [
        c.full_name,
        c.phone_number,
        c.email || '',
        c.company || '',
        c.position || '',
        c.city || '',
        c.state || '',
        c.status,
        (c.tags || []).join(';')
      ].map(v => `"${v}"`).join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contacts-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800'
      case 'inactive':
        return 'bg-gray-100 text-gray-800'
      case 'do_not_call':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="space-y-4">
      {/* Filters and Actions */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search contacts..."
              value={filters.searchTerm || ''}
              onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
              className="pl-10"
            />
          </div>
          <Select
            value={filters.status || 'all'}
            onValueChange={(value) => setFilters({ ...filters, status: value === 'all' ? undefined : value })}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
              <SelectItem value="do_not_call">Do Not Call</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          {selectedContacts.length > 0 && (
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteSelected}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete ({selectedContacts.length})
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportContacts}
            disabled={!contacts || contacts.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowImportModal(true)}
          >
            <Upload className="h-4 w-4 mr-2" />
            Import
          </Button>
          <Button
            onClick={() => setShowAddModal(true)}
            size="sm"
          >
            <UserPlus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <ContactsTableSkeleton rows={8} />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">
                  <Checkbox
                    checked={!!contacts && contacts.length > 0 && selectedContacts.length === contacts.length}
                    onCheckedChange={handleSelectAll}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contacts && contacts.length > 0 ? (
              contacts.map((contact) => (
                <TableRow key={contact.id}>
                  <TableCell>
                    <Checkbox
                      checked={selectedContacts.includes(contact.id)}
                      onCheckedChange={(checked) => handleSelectContact(contact.id, checked as boolean)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <button
                      className="text-left hover:underline focus:outline-none focus:underline"
                      onClick={() => router.push(`/dashboard/contacts/${contact.id}`)}
                    >
                      {contact.full_name}
                    </button>
                    {contact.position && (
                      <div className="text-xs text-muted-foreground">{contact.position}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {contact.status === 'do_not_call' && (
                        <PhoneOff className="h-3 w-3 text-red-500" />
                      )}
                      <span className="text-sm">{formatPhoneNumber(contact.phone_number)}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {contact.email && (
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{contact.email}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {contact.company && (
                      <div className="flex items-center gap-1">
                        <Building className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">{contact.company}</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    {(contact.city || contact.state) && (
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-muted-foreground" />
                        <span className="text-sm">
                          {[contact.city, contact.state].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={getStatusColor(contact.status)}>
                      {contact.status.replace('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {contact.tags && contact.tags.length > 0 && (
                      <div className="flex gap-1 flex-wrap">
                        {contact.tags.slice(0, 2).map((tag, i) => (
                          <Badge key={i} variant="outline" className="text-xs">
                            <Tag className="h-2 w-2 mr-1" />
                            {tag}
                          </Badge>
                        ))}
                        {contact.tags.length > 2 && (
                          <Badge variant="outline" className="text-xs">
                            +{contact.tags.length - 2}
                          </Badge>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <SimpleCallButton
                        phoneNumber={contact.phone_number}
                        contactId={contact.id}
                        contactName={contact.full_name}
                        contactStatus={contact.status}
                        size="icon"
                        variant="ghost"
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuItem 
                            onClick={(e) => {
                              e.preventDefault()
                              // The click-to-call button will handle this
                            }}
                            asChild
                          >
                            <div className="px-2 py-1.5">
                              <SimpleCallButton
                                phoneNumber={contact.phone_number}
                                contactId={contact.id}
                                contactName={contact.full_name}
                                contactStatus={contact.status}
                                size="sm"
                                variant="ghost"
                                className="w-full justify-start h-auto p-0"
                              />
                            </div>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => router.push(`/dashboard/contacts/${contact.id}`)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewCallHistory(contact.id)}>
                            <History className="mr-2 h-4 w-4" />
                            Call History
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingContact(contact)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => {
                              confirmation.showConfirmation({
                                title: 'Delete Contact',
                                description: `Are you sure you want to delete ${contact.full_name}? This action cannot be undone.`,
                                confirmText: 'Delete',
                                cancelText: 'Cancel',
                                variant: 'destructive',
                                onConfirm: async () => {
                                  deleteContacts.mutate([contact.id])
                                }
                              })
                            }}
                            className="text-red-600"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              ))
              ) : (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-12">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <User className="h-12 w-12" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">No contacts found</p>
                        <p className="text-xs">
                          {filters.searchTerm || filters.status ? 
                            'Try adjusting your filters to see more contacts.' :
                            'Get started by adding your first contact.'
                          }
                        </p>
                      </div>
                      {!filters.searchTerm && !filters.status && (
                        <Button size="sm" onClick={() => setShowAddModal(true)}>
                          <UserPlus className="h-4 w-4 mr-2" />
                          Add Contact
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Modals */}
      <AddContactModal
        open={showAddModal}
        onOpenChange={setShowAddModal}
      />
      
      <ImportContactsModal
        open={showImportModal}
        onOpenChange={setShowImportModal}
      />

      {editingContact && (
        <EditContactModal
          contact={editingContact}
          open={!!editingContact}
          onOpenChange={(open) => !open && setEditingContact(null)}
        />
      )}

      {selectedCallId && (
        <CallDetailsSlideout
          callId={selectedCallId}
          isOpen={!!selectedCallId}
          onClose={() => setSelectedCallId(null)}
        />
      )}

      {/* Confirmation Dialog */}
      <ConfirmationDialog
        isOpen={confirmation.isOpen}
        onClose={confirmation.hideConfirmation}
        onConfirm={confirmation.handleConfirm}
        title={confirmation.title}
        description={confirmation.description}
        confirmText={confirmation.confirmText}
        cancelText={confirmation.cancelText}
        variant={confirmation.variant}
        isLoading={confirmation.isLoading}
      />
    </div>
  )
}