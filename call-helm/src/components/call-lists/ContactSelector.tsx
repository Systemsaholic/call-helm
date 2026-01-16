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
  X,
  Tag,
  ChevronDown,
  ChevronUp
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'

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
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [tagFilterMode, setTagFilterMode] = useState<'any' | 'all'>('any')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showTagFilter, setShowTagFilter] = useState(true)

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
      // Search filter - also search in tags
      const searchLower = searchTerm.toLowerCase()
      const matchesSearch = !searchTerm ||
        contact.name?.toLowerCase().includes(searchLower) ||
        contact.full_name?.toLowerCase().includes(searchLower) ||
        contact.email?.toLowerCase().includes(searchLower) ||
        contact.phone?.toLowerCase().includes(searchLower) ||
        contact.phone_number?.toLowerCase().includes(searchLower) ||
        contact.company?.toLowerCase().includes(searchLower) ||
        contact.tags?.some(tag => tag.toLowerCase().includes(searchLower))

      // Multi-tag filter
      let matchesTag = true
      if (selectedTags.length > 0) {
        if (tagFilterMode === 'any') {
          // Contact must have at least one of the selected tags
          matchesTag = selectedTags.some(tag => contact.tags?.includes(tag))
        } else {
          // Contact must have ALL selected tags
          matchesTag = selectedTags.every(tag => contact.tags?.includes(tag))
        }
      }

      // Status filter
      const matchesStatus = filterStatus === 'all' ||
        contact.status === filterStatus

      return matchesSearch && matchesTag && matchesStatus
    })
  }, [contacts, searchTerm, selectedTags, tagFilterMode, filterStatus])

  // Toggle a tag in the filter
  const toggleTagFilter = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag)
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    )
  }

  // Clear all tag filters
  const clearTagFilters = () => {
    setSelectedTags([])
  }

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
        </div>
      </div>

      {/* Tag Filter Section */}
      <Collapsible open={showTagFilter} onOpenChange={setShowTagFilter}>
        <div className="border rounded-lg">
          <CollapsibleTrigger asChild>
            <button className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Filter by Tags</span>
                {selectedTags.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {selectedTags.length} selected
                  </Badge>
                )}
              </div>
              {showTagFilter ? (
                <ChevronUp className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronDown className="h-4 w-4 text-gray-500" />
              )}
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 pt-2 border-t">
              {availableTags.length > 0 ? (
                <>
                  {/* Tag filter mode toggle */}
                  <div className="flex items-center gap-4 mb-3">
                    <span className="text-xs text-gray-500">Match:</span>
                    <div className="flex gap-2">
                      <Button
                        variant={tagFilterMode === 'any' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setTagFilterMode('any')}
                      >
                        Any tag
                      </Button>
                      <Button
                        variant={tagFilterMode === 'all' ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setTagFilterMode('all')}
                      >
                        All tags
                      </Button>
                    </div>
                    {selectedTags.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs ml-auto"
                        onClick={clearTagFilters}
                      >
                        <X className="h-3 w-3 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>
                  {/* Tag badges */}
                  <div className="flex flex-wrap gap-2">
                    {availableTags.map(tag => (
                      <Badge
                        key={tag}
                        variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                        className={`cursor-pointer transition-all ${
                          selectedTags.includes(tag)
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'hover:bg-gray-100'
                        }`}
                        onClick={() => toggleTagFilter(tag)}
                      >
                        {tag}
                        {selectedTags.includes(tag) && (
                          <X className="h-3 w-3 ml-1" />
                        )}
                      </Badge>
                    ))}
                  </div>
                  {selectedTags.length > 0 && (
                    <p className="text-xs text-gray-500 mt-2">
                      Showing contacts with {tagFilterMode === 'any' ? 'any of' : 'all of'} the selected tags
                    </p>
                  )}
                </>
              ) : (
                <div className="text-center py-4">
                  <Tag className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No tags found</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Add tags to your contacts to filter them here
                  </p>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </div>
      </Collapsible>

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
            {searchTerm || selectedTags.length > 0 || filterStatus !== 'all'
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