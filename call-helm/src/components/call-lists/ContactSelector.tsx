'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Search, 
  Users, 
  CheckCircle,
  Filter,
  X
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface Contact {
  id: string
  name?: string
  full_name?: string
  email?: string
  phone?: string
  phone_number?: string
  company?: string
  tags?: string[]
  status?: string
}

interface ContactSelectorProps {
  contacts: Contact[]
  selectedIds: string[]
  onSelectionChange: (ids: string[]) => void
}

export function ContactSelector({ 
  contacts, 
  selectedIds, 
  onSelectionChange 
}: ContactSelectorProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterTag, setFilterTag] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  // Extract unique tags and statuses for filtering
  const availableTags = useMemo(() => {
    const tags = new Set<string>()
    contacts.forEach(contact => {
      contact.tags?.forEach(tag => tags.add(tag))
    })
    return Array.from(tags)
  }, [contacts])

  const availableStatuses = useMemo(() => {
    const statuses = new Set<string>()
    contacts.forEach(contact => {
      if (contact.status) statuses.add(contact.status)
    })
    return Array.from(statuses)
  }, [contacts])

  // Filter contacts based on search and filters
  const filteredContacts = useMemo(() => {
    return contacts.filter(contact => {
      // Search filter
      const searchLower = searchTerm.toLowerCase()
      const matchesSearch = !searchTerm || 
        contact.name?.toLowerCase().includes(searchLower) ||
        contact.full_name?.toLowerCase().includes(searchLower) ||
        contact.email?.toLowerCase().includes(searchLower) ||
        contact.phone?.toLowerCase().includes(searchLower) ||
        contact.phone_number?.toLowerCase().includes(searchLower) ||
        contact.company?.toLowerCase().includes(searchLower)

      // Tag filter
      const matchesTag = filterTag === 'all' || 
        contact.tags?.includes(filterTag)

      // Status filter
      const matchesStatus = filterStatus === 'all' || 
        contact.status === filterStatus

      return matchesSearch && matchesTag && matchesStatus
    })
  }, [contacts, searchTerm, filterTag, filterStatus])

  const handleSelectAll = () => {
    if (selectedIds.length === filteredContacts.length) {
      // Deselect all
      onSelectionChange([])
    } else {
      // Select all filtered
      onSelectionChange(filteredContacts.map(c => c.id))
    }
  }

  const handleToggleContact = (contactId: string) => {
    if (selectedIds.includes(contactId)) {
      onSelectionChange(selectedIds.filter(id => id !== contactId))
    } else {
      onSelectionChange([...selectedIds, contactId])
    }
  }

  const isAllSelected = filteredContacts.length > 0 && 
    filteredContacts.every(c => selectedIds.includes(c.id))

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search contacts by name, email, phone, or company..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex gap-2">
          {availableTags.length > 0 && (
            <Select value={filterTag} onValueChange={setFilterTag}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {availableTags.map(tag => (
                  <SelectItem key={tag} value={tag}>{tag}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {availableStatuses.length > 0 && (
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {availableStatuses.map(status => (
                  <SelectItem key={status} value={status}>
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {(filterTag !== 'all' || filterStatus !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFilterTag('all')
                setFilterStatus('all')
              }}
            >
              <X className="h-4 w-4 mr-1" />
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Selection Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-blue-600" />
          <span className="text-sm text-blue-900">
            {selectedIds.length} of {contacts.length} contacts selected
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSelectAll}
        >
          {isAllSelected ? 'Deselect All' : 'Select All'}
        </Button>
      </div>

      {/* Contact List */}
      <div className="border rounded-lg divide-y max-h-96 overflow-y-auto">
        {filteredContacts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {searchTerm || filterTag !== 'all' || filterStatus !== 'all' 
              ? 'No contacts match your filters' 
              : 'No contacts available'}
          </div>
        ) : (
          filteredContacts.map(contact => (
            <div
              key={contact.id}
              className={`p-3 hover:bg-gray-50 transition-colors ${
                selectedIds.includes(contact.id) ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={selectedIds.includes(contact.id)}
                  onCheckedChange={() => handleToggleContact(contact.id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {contact.name || contact.full_name || 'Unknown'}
                    </span>
                    {selectedIds.includes(contact.id) && (
                      <CheckCircle className="h-4 w-4 text-blue-600" />
                    )}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {contact.email && (
                      <span className="mr-3">{contact.email}</span>
                    )}
                    {(contact.phone || contact.phone_number) && (
                      <span className="mr-3">{contact.phone || contact.phone_number}</span>
                    )}
                    {contact.company && (
                      <span className="text-gray-500">• {contact.company}</span>
                    )}
                  </div>
                  {contact.tags && contact.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {contact.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}