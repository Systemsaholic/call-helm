'use client'

import { useState, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Users,
  Upload,
  Search,
  X,
  AlertCircle,
  Phone,
  User,
  FileSpreadsheet,
} from 'lucide-react'
import Papa from 'papaparse'

interface Recipient {
  phoneNumber: string
  contactName?: string
  variables?: Record<string, string>
}

interface RecipientSelectorProps {
  recipients: Recipient[]
  onChange: (recipients: Recipient[]) => void
  templateVariables?: string[]
}

interface Contact {
  id: string
  phone_number: string
  first_name?: string
  last_name?: string
  email?: string
  company?: string
}

interface CallListContact {
  id: string
  contact: Contact | null
}

// Transform raw Supabase response (contact is returned as array) to CallListContact
function transformCallListContact(raw: { id: string; contact: Contact[] }): CallListContact {
  return {
    id: raw.id,
    contact: raw.contact?.[0] || null
  }
}

interface CallList {
  id: string
  name: string
  status: string
  total_contacts?: number
}

// Format phone number to E.164
function formatPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/\D/g, '')
  if (cleaned.length === 10) {
    return `+1${cleaned}`
  } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `+${cleaned}`
  }
  return cleaned.startsWith('+') ? phone : `+${cleaned}`
}

// Validate phone number
function isValidPhoneNumber(phone: string): boolean {
  const formatted = formatPhoneNumber(phone)
  return /^\+1\d{10}$/.test(formatted)
}

export function RecipientSelector({
  recipients,
  onChange,
  templateVariables = [],
}: RecipientSelectorProps) {
  const [activeTab, setActiveTab] = useState('contacts')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set())
  const [selectedCallListId, setSelectedCallListId] = useState<string | null>(null)
  const [csvError, setCsvError] = useState<string | null>(null)
  const [manualNumber, setManualNumber] = useState('')
  const [manualName, setManualName] = useState('')

  // Fetch contacts
  const { data: contacts, isLoading: loadingContacts } = useQuery({
    queryKey: ['contacts-for-broadcast', searchQuery],
    queryFn: async () => {
      const supabase = createClient()
      let query = supabase
        .from('contacts')
        .select('id, phone_number, first_name, last_name, email, company')
        .not('phone_number', 'is', null)
        .limit(100)

      if (searchQuery) {
        query = query.or(
          `first_name.ilike.%${searchQuery}%,last_name.ilike.%${searchQuery}%,phone_number.ilike.%${searchQuery}%`
        )
      }

      const { data, error } = await query.order('first_name')
      if (error) throw error
      return data as Contact[]
    },
  })

  // Fetch call lists
  const { data: callLists, isLoading: loadingCallLists } = useQuery({
    queryKey: ['call-lists-for-broadcast'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('call_lists')
        .select('id, name, status')
        .in('status', ['active', 'draft'])
        .order('name')

      if (error) throw error

      // Get contact counts
      const listsWithCounts = await Promise.all(
        (data || []).map(async (list) => {
          const { count } = await supabase
            .from('call_list_contacts')
            .select('*', { count: 'exact', head: true })
            .eq('call_list_id', list.id)

          return { ...list, total_contacts: count || 0 }
        })
      )

      return listsWithCounts as CallList[]
    },
  })

  // Fetch contacts from selected call list
  const { data: callListContacts, isLoading: loadingCallListContacts } = useQuery({
    queryKey: ['call-list-contacts', selectedCallListId],
    queryFn: async () => {
      if (!selectedCallListId) return []
      const supabase = createClient()
      const { data, error } = await supabase
        .from('call_list_contacts')
        .select(`
          id,
          contact:contacts (
            id,
            phone_number,
            first_name,
            last_name,
            email,
            company
          )
        `)
        .eq('call_list_id', selectedCallListId)
        .limit(1000)

      if (error) throw error
      // Transform Supabase response (contact returned as array) and filter to contacts with phone numbers
      return (data || [])
        .map(d => transformCallListContact(d as { id: string; contact: Contact[] }))
        .filter(d => d.contact?.phone_number)
    },
    enabled: !!selectedCallListId,
  })

  // Add selected contacts
  const handleAddContacts = useCallback(() => {
    const newRecipients: Recipient[] = []
    const existingNumbers = new Set(recipients.map(r => r.phoneNumber))

    contacts?.forEach(contact => {
      if (selectedContactIds.has(contact.id) && contact.phone_number) {
        const formatted = formatPhoneNumber(contact.phone_number)
        if (!existingNumbers.has(formatted) && isValidPhoneNumber(formatted)) {
          newRecipients.push({
            phoneNumber: formatted,
            contactName: [contact.first_name, contact.last_name].filter(Boolean).join(' ') || undefined,
          })
        }
      }
    })

    if (newRecipients.length > 0) {
      onChange([...recipients, ...newRecipients])
    }
    setSelectedContactIds(new Set())
  }, [contacts, selectedContactIds, recipients, onChange])

  // Add all contacts from call list
  const handleAddCallListContacts = useCallback(() => {
    if (!callListContacts) return

    const newRecipients: Recipient[] = []
    const existingNumbers = new Set(recipients.map(r => r.phoneNumber))

    callListContacts.forEach(item => {
      if (item.contact?.phone_number) {
        const formatted = formatPhoneNumber(item.contact.phone_number)
        if (!existingNumbers.has(formatted) && isValidPhoneNumber(formatted)) {
          newRecipients.push({
            phoneNumber: formatted,
            contactName: [item.contact.first_name, item.contact.last_name].filter(Boolean).join(' ') || undefined,
          })
        }
      }
    })

    if (newRecipients.length > 0) {
      onChange([...recipients, ...newRecipients])
    }
    setSelectedCallListId(null)
  }, [callListContacts, recipients, onChange])

  // Handle CSV upload
  const handleCSVUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setCsvError(null)

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const newRecipients: Recipient[] = []
        const existingNumbers = new Set(recipients.map(r => r.phoneNumber))
        const errors: string[] = []

        results.data.forEach((row: any, index: number) => {
          // Try to find phone number column
          const phone = row.phone || row.phone_number || row.Phone || row['Phone Number'] || row.mobile || row.Mobile
          const name = row.name || row.Name || row.full_name || row['Full Name'] ||
            [row.first_name || row['First Name'], row.last_name || row['Last Name']].filter(Boolean).join(' ')

          if (!phone) {
            errors.push(`Row ${index + 2}: Missing phone number`)
            return
          }

          const formatted = formatPhoneNumber(phone)
          if (!isValidPhoneNumber(formatted)) {
            errors.push(`Row ${index + 2}: Invalid phone number "${phone}"`)
            return
          }

          if (existingNumbers.has(formatted)) {
            return // Skip duplicates
          }

          existingNumbers.add(formatted)

          // Extract template variables from CSV
          const variables: Record<string, string> = {}
          templateVariables.forEach(varName => {
            const cleanVar = varName.replace(/[{}]/g, '')
            if (row[cleanVar] || row[cleanVar.toLowerCase()]) {
              variables[cleanVar] = row[cleanVar] || row[cleanVar.toLowerCase()]
            }
          })

          newRecipients.push({
            phoneNumber: formatted,
            contactName: name || undefined,
            variables: Object.keys(variables).length > 0 ? variables : undefined,
          })
        })

        if (errors.length > 0 && errors.length <= 5) {
          setCsvError(errors.join('\n'))
        } else if (errors.length > 5) {
          setCsvError(`${errors.length} rows had errors. First 5: ${errors.slice(0, 5).join('\n')}`)
        }

        if (newRecipients.length > 0) {
          onChange([...recipients, ...newRecipients])
        }
      },
      error: (error) => {
        setCsvError(`Failed to parse CSV: ${error.message}`)
      },
    })

    // Reset input
    event.target.value = ''
  }, [recipients, onChange, templateVariables])

  // Add manual number
  const handleAddManual = useCallback(() => {
    if (!manualNumber) return

    const formatted = formatPhoneNumber(manualNumber)
    if (!isValidPhoneNumber(formatted)) {
      return
    }

    const existingNumbers = new Set(recipients.map(r => r.phoneNumber))
    if (existingNumbers.has(formatted)) {
      return
    }

    onChange([
      ...recipients,
      {
        phoneNumber: formatted,
        contactName: manualName || undefined,
      },
    ])

    setManualNumber('')
    setManualName('')
  }, [manualNumber, manualName, recipients, onChange])

  // Remove recipient
  const handleRemove = useCallback((phoneNumber: string) => {
    onChange(recipients.filter(r => r.phoneNumber !== phoneNumber))
  }, [recipients, onChange])

  // Toggle contact selection
  const toggleContact = useCallback((contactId: string) => {
    const newSelected = new Set(selectedContactIds)
    if (newSelected.has(contactId)) {
      newSelected.delete(contactId)
    } else {
      newSelected.add(contactId)
    }
    setSelectedContactIds(newSelected)
  }, [selectedContactIds])

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="contacts">
            <Users className="h-4 w-4 mr-2" />
            Contacts
          </TabsTrigger>
          <TabsTrigger value="calllist">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Call Lists
          </TabsTrigger>
          <TabsTrigger value="csv">
            <Upload className="h-4 w-4 mr-2" />
            CSV Upload
          </TabsTrigger>
          <TabsTrigger value="manual">
            <Phone className="h-4 w-4 mr-2" />
            Manual
          </TabsTrigger>
        </TabsList>

        {/* Contacts Tab */}
        <TabsContent value="contacts" className="space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search contacts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Button
              onClick={handleAddContacts}
              disabled={selectedContactIds.size === 0}
            >
              Add Selected ({selectedContactIds.size})
            </Button>
          </div>

          <ScrollArea className="h-[200px] border rounded-md">
            {loadingContacts ? (
              <div className="p-4 text-center text-muted-foreground">Loading contacts...</div>
            ) : contacts?.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">No contacts found</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contacts?.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedContactIds.has(contact.id)}
                          onCheckedChange={() => toggleContact(contact.id)}
                        />
                      </TableCell>
                      <TableCell>
                        {contact.first_name || contact.last_name
                          ? `${contact.first_name || ''} ${contact.last_name || ''}`.trim()
                          : 'Unknown'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {contact.phone_number}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Call Lists Tab */}
        <TabsContent value="calllist" className="space-y-4">
          {selectedCallListId ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Button variant="ghost" onClick={() => setSelectedCallListId(null)}>
                  Back to Lists
                </Button>
                <Button
                  onClick={handleAddCallListContacts}
                  disabled={!callListContacts?.length}
                >
                  Add All ({callListContacts?.length || 0})
                </Button>
              </div>
              <ScrollArea className="h-[200px] border rounded-md">
                {loadingCallListContacts ? (
                  <div className="p-4 text-center text-muted-foreground">Loading contacts...</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {callListContacts?.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            {item.contact?.first_name || item.contact?.last_name
                              ? `${item.contact?.first_name || ''} ${item.contact?.last_name || ''}`.trim()
                              : 'Unknown'}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {item.contact?.phone_number}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </div>
          ) : (
            <div className="grid gap-3">
              {loadingCallLists ? (
                <div className="p-4 text-center text-muted-foreground">Loading call lists...</div>
              ) : callLists?.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground">No call lists found</div>
              ) : (
                callLists?.map((list) => (
                  <Card
                    key={list.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setSelectedCallListId(list.id)}
                  >
                    <CardContent className="p-4 flex items-center justify-between">
                      <div>
                        <div className="font-medium">{list.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {list.total_contacts} contacts
                        </div>
                      </div>
                      <Badge variant="secondary">{list.status}</Badge>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}
        </TabsContent>

        {/* CSV Upload Tab */}
        <TabsContent value="csv" className="space-y-4">
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <Upload className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground mb-4">
              Upload a CSV file with phone numbers. Columns: phone/phone_number, name (optional)
            </p>
            <Input
              type="file"
              accept=".csv"
              onChange={handleCSVUpload}
              className="max-w-xs mx-auto"
            />
          </div>

          {csvError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="whitespace-pre-line">{csvError}</AlertDescription>
            </Alert>
          )}

          {templateVariables.length > 0 && (
            <Alert>
              <AlertDescription>
                Include columns for template variables: {templateVariables.join(', ')}
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        {/* Manual Entry Tab */}
        <TabsContent value="manual" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="manualNumber">Phone Number</Label>
              <Input
                id="manualNumber"
                placeholder="+1 (555) 123-4567"
                value={manualNumber}
                onChange={(e) => setManualNumber(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manualName">Name (optional)</Label>
              <Input
                id="manualName"
                placeholder="John Doe"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
              />
            </div>
          </div>
          <Button
            onClick={handleAddManual}
            disabled={!manualNumber || !isValidPhoneNumber(formatPhoneNumber(manualNumber))}
          >
            Add Recipient
          </Button>
        </TabsContent>
      </Tabs>

      {/* Selected Recipients */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Selected Recipients ({recipients.length})</Label>
          {recipients.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange([])}
              className="text-red-600 hover:text-red-700"
            >
              Clear All
            </Button>
          )}
        </div>

        {recipients.length === 0 ? (
          <div className="border rounded-md p-4 text-center text-muted-foreground">
            No recipients selected yet
          </div>
        ) : (
          <ScrollArea className="h-[150px] border rounded-md p-2">
            <div className="flex flex-wrap gap-2">
              {recipients.map((recipient) => (
                <Badge
                  key={recipient.phoneNumber}
                  variant="secondary"
                  className="flex items-center gap-1 py-1 px-2"
                >
                  <User className="h-3 w-3" />
                  <span>{recipient.contactName || recipient.phoneNumber}</span>
                  <button
                    onClick={() => handleRemove(recipient.phoneNumber)}
                    className="ml-1 hover:bg-muted rounded p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
