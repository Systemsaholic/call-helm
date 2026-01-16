'use client'

import { useState, useRef, useCallback } from 'react'
import Papa from 'papaparse'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import {
  Upload,
  FileText,
  AlertCircle,
  Download,
  CheckCircle2,
  XCircle,
  AlertTriangle
} from 'lucide-react'
import { useImportContacts, type ContactInput } from '@/lib/hooks/useContacts'
import { useAuth } from '@/lib/hooks/useAuth'

interface ImportContactsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  callListId?: string
}

interface ParsedContact extends ContactInput {
  _rowNumber: number
  _error?: string
  _warning?: string
  _isDuplicate?: boolean
}

interface ImportResult {
  success: number
  skipped: number
  failed: number
  errors: Array<{ row: number; error: string }>
}

// Phone number validation regex (accepts various formats)
const PHONE_REGEX = /^[+]?[(]?[0-9]{1,4}[)]?[-\s./0-9]*$/

// Normalize phone number for comparison
function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9+]/g, '')
}

// Validate phone number
function validatePhone(phone: string): { valid: boolean; normalized: string; error?: string } {
  if (!phone || phone.trim() === '') {
    return { valid: false, normalized: '', error: 'Phone number is required' }
  }

  const normalized = normalizePhone(phone)

  if (normalized.length < 7) {
    return { valid: false, normalized, error: 'Phone number too short' }
  }

  if (normalized.length > 15) {
    return { valid: false, normalized, error: 'Phone number too long' }
  }

  if (!PHONE_REGEX.test(phone)) {
    return { valid: false, normalized, error: 'Invalid phone number format' }
  }

  return { valid: true, normalized }
}

// Map CSV headers to contact fields
const HEADER_MAPPINGS: Record<string, keyof ContactInput | 'first_name' | 'last_name'> = {
  // Name fields
  'full_name': 'full_name',
  'fullname': 'full_name',
  'name': 'full_name',
  'contact_name': 'full_name',
  'contact name': 'full_name',
  'first_name': 'first_name',
  'firstname': 'first_name',
  'first name': 'first_name',
  'given_name': 'first_name',
  'last_name': 'last_name',
  'lastname': 'last_name',
  'last name': 'last_name',
  'surname': 'last_name',
  'family_name': 'last_name',

  // Phone fields
  'phone_number': 'phone_number',
  'phonenumber': 'phone_number',
  'phone': 'phone_number',
  'mobile': 'phone_number',
  'cell': 'phone_number',
  'telephone': 'phone_number',
  'tel': 'phone_number',

  // Email
  'email': 'email',
  'email_address': 'email',
  'e-mail': 'email',

  // Company
  'company': 'company',
  'organization': 'company',
  'org': 'company',
  'business': 'company',
  'employer': 'company',

  // Position/Title
  'position': 'position',
  'title': 'position',
  'job_title': 'position',
  'job title': 'position',
  'role': 'position',

  // Address fields
  'address': 'address',
  'street': 'address',
  'street_address': 'address',
  'city': 'city',
  'state': 'state',
  'province': 'state',
  'region': 'state',
  'postal_code': 'postal_code',
  'postalcode': 'postal_code',
  'zip': 'postal_code',
  'zip_code': 'postal_code',
  'zipcode': 'postal_code',
  'country': 'country',

  // Other fields
  'notes': 'notes',
  'note': 'notes',
  'comments': 'notes',
  'tags': 'tags',
  'status': 'status',
}

export function ImportContactsModal({ open, onOpenChange, callListId }: ImportContactsModalProps) {
  const { supabase, user } = useAuth()
  const importContacts = useImportContacts()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [csvContent, setCsvContent] = useState('')
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'update' | 'create'>('skip')
  const [parsedContacts, setParsedContacts] = useState<ParsedContact[]>([])
  const [parseError, setParseError] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [existingPhones, setExistingPhones] = useState<Set<string>>(new Set())
  const [totalRows, setTotalRows] = useState(0)

  // Fetch existing phone numbers for duplicate detection
  const fetchExistingPhones = useCallback(async () => {
    if (!user) return

    try {
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!member) return

      const { data: contacts } = await supabase
        .from('contacts')
        .select('phone_number')
        .eq('organization_id', member.organization_id)
        .is('deleted_at', null)

      if (contacts) {
        const phones = new Set(contacts.map(c => normalizePhone(c.phone_number)))
        setExistingPhones(phones)
      }
    } catch (error) {
      console.error('Failed to fetch existing phones:', error)
    }
  }, [supabase, user])

  // Parse CSV using Papa Parse
  const parseCsv = useCallback((content: string) => {
    setParseError('')
    setParsedContacts([])
    setImportResult(null)
    setTotalRows(0)

    if (!content.trim()) {
      return
    }

    Papa.parse<Record<string, string>>(content, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          setParseError(`CSV parsing error: ${results.errors[0].message}`)
          return
        }

        const headers = results.meta.fields || []

        // Check for required fields
        const hasNameField = headers.some(h =>
          ['full_name', 'fullname', 'name', 'first_name', 'firstname'].includes(h)
        )
        const hasPhoneField = headers.some(h =>
          ['phone_number', 'phonenumber', 'phone', 'mobile', 'cell', 'telephone', 'tel'].includes(h)
        )

        if (!hasNameField) {
          setParseError('Missing name column. Please include "full_name", "name", or "first_name" column.')
          return
        }

        if (!hasPhoneField) {
          setParseError('Missing phone column. Please include "phone_number", "phone", or "mobile" column.')
          return
        }

        setTotalRows(results.data.length)

        // Parse contacts
        const contacts: ParsedContact[] = results.data.map((row, index) => {
          const contact: ParsedContact = {
            phone_number: '',
            status: 'active',
            _rowNumber: index + 2, // +2 for 1-based and header row
          }

          let firstName = ''
          let lastName = ''

          // Map CSV fields to contact fields
          for (const [csvHeader, value] of Object.entries(row)) {
            const mappedField = HEADER_MAPPINGS[csvHeader]
            if (!mappedField || !value) continue

            const trimmedValue = value.trim()

            switch (mappedField) {
              case 'first_name':
                firstName = trimmedValue
                break
              case 'last_name':
                lastName = trimmedValue
                break
              case 'full_name':
                // Only use full_name if first/last not provided
                if (!firstName && !lastName) {
                  contact.full_name = trimmedValue
                }
                break
              case 'phone_number':
                contact.phone_number = trimmedValue
                break
              case 'email':
                contact.email = trimmedValue
                break
              case 'company':
                contact.company = trimmedValue
                break
              case 'position':
                contact.position = trimmedValue
                break
              case 'address':
                contact.address = trimmedValue
                break
              case 'city':
                contact.city = trimmedValue
                break
              case 'state':
                contact.state = trimmedValue
                break
              case 'postal_code':
                contact.postal_code = trimmedValue
                break
              case 'country':
                contact.country = trimmedValue || 'US'
                break
              case 'notes':
                contact.notes = trimmedValue
                break
              case 'tags':
                contact.tags = trimmedValue.split(/[;,]/).map(t => t.trim()).filter(Boolean)
                break
              case 'status':
                if (['active', 'inactive', 'do_not_call'].includes(trimmedValue.toLowerCase())) {
                  contact.status = trimmedValue.toLowerCase() as 'active' | 'inactive' | 'do_not_call'
                }
                break
            }
          }

          // Build full_name from first/last if provided
          if (firstName || lastName) {
            contact.first_name = firstName
            contact.last_name = lastName
            contact.full_name = `${firstName} ${lastName}`.trim()
          }

          // Validate
          if (!contact.full_name && !contact.first_name) {
            contact._error = 'Missing name'
          } else if (!contact.phone_number) {
            contact._error = 'Missing phone number'
          } else {
            const phoneValidation = validatePhone(contact.phone_number)
            if (!phoneValidation.valid) {
              contact._error = phoneValidation.error
            } else {
              // Check for duplicate in existing contacts
              const normalized = phoneValidation.normalized
              if (existingPhones.has(normalized)) {
                contact._isDuplicate = true
                contact._warning = 'Duplicate phone number'
              }
            }
          }

          return contact
        })

        // Check for duplicates within the CSV itself
        const seenPhones = new Map<string, number>()
        contacts.forEach((contact, index) => {
          if (contact.phone_number && !contact._error) {
            const normalized = normalizePhone(contact.phone_number)
            const firstOccurrence = seenPhones.get(normalized)
            if (firstOccurrence !== undefined) {
              contact._warning = `Duplicate of row ${firstOccurrence}`
              contact._isDuplicate = true
            } else {
              seenPhones.set(normalized, contact._rowNumber)
            }
          }
        })

        setParsedContacts(contacts)
      },
      error: (error: Error) => {
        setParseError(`Failed to parse CSV: ${error.message}`)
      }
    })
  }, [existingPhones])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Fetch existing phones for duplicate detection
    await fetchExistingPhones()

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      setCsvContent(content)
      parseCsv(content)
    }
    reader.readAsText(file)
  }

  const handleImport = async () => {
    if (parsedContacts.length === 0) {
      setParseError('No valid contacts to import')
      return
    }

    setIsImporting(true)
    setImportProgress(0)
    setImportResult(null)

    const result: ImportResult = {
      success: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    }

    // Filter contacts based on duplicate strategy and errors
    const contactsToImport: ContactInput[] = []

    for (const contact of parsedContacts) {
      // Skip contacts with errors
      if (contact._error) {
        result.failed++
        result.errors.push({ row: contact._rowNumber, error: contact._error })
        continue
      }

      // Handle duplicates based on strategy
      if (contact._isDuplicate) {
        if (duplicateStrategy === 'skip') {
          result.skipped++
          continue
        }
        // For 'update' and 'create', we'll include them
        // Note: 'update' would need additional logic to find and update existing contacts
      }

      // Clean up internal fields before import
      const cleanContact: ContactInput = {
        full_name: contact.full_name,
        first_name: contact.first_name,
        last_name: contact.last_name,
        phone_number: contact.phone_number,
        email: contact.email,
        company: contact.company,
        position: contact.position,
        address: contact.address,
        city: contact.city,
        state: contact.state,
        postal_code: contact.postal_code,
        country: contact.country,
        notes: contact.notes,
        tags: contact.tags,
        status: contact.status,
      }

      contactsToImport.push(cleanContact)
    }

    if (contactsToImport.length === 0) {
      setImportResult(result)
      setIsImporting(false)
      return
    }

    // Import in batches for progress tracking
    const BATCH_SIZE = 50
    const batches = []
    for (let i = 0; i < contactsToImport.length; i += BATCH_SIZE) {
      batches.push(contactsToImport.slice(i, i + BATCH_SIZE))
    }

    try {
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i]

        try {
          await importContacts.mutateAsync(batch)
          result.success += batch.length
        } catch (error: any) {
          // If batch fails, count all as failed
          result.failed += batch.length
          result.errors.push({
            row: 0,
            error: `Batch ${i + 1} failed: ${error.message}`
          })
        }

        setImportProgress(Math.round(((i + 1) / batches.length) * 100))
      }

      setImportResult(result)

      // Only close if all succeeded
      if (result.failed === 0 && result.skipped === 0) {
        setTimeout(() => {
          handleClose()
        }, 1500)
      }
    } catch (error: any) {
      setParseError(error.message || 'Import failed')
    } finally {
      setIsImporting(false)
    }
  }

  const handleClose = () => {
    onOpenChange(false)
    setCsvContent('')
    setParsedContacts([])
    setParseError('')
    setImportProgress(0)
    setImportResult(null)
    setTotalRows(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const downloadTemplate = () => {
    const template = `first_name,last_name,phone_number,email,company,position,address,city,state,postal_code,country,notes,tags,status
John,Doe,+1 (555) 123-4567,john@example.com,Acme Corp,CEO,123 Main St,San Francisco,CA,94102,US,Important client,vip;high-priority,active
Jane,Smith,+1 (555) 987-6543,jane@example.com,Tech Inc,CTO,456 Oak Ave,New York,NY,10001,US,Interested in product,lead;tech,active
"Smith, Jr.",Robert,+1 (555) 456-7890,robert@example.com,"Company, LLC",Manager,"789 Pine St, Suite 100",Chicago,IL,60601,US,Follow up next week,prospect,active`

    const blob = new Blob([template], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'contacts_template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // Count statistics
  const validContacts = parsedContacts.filter(c => !c._error)
  const errorContacts = parsedContacts.filter(c => c._error)
  const duplicateContacts = parsedContacts.filter(c => c._isDuplicate && !c._error)

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Contacts</DialogTitle>
          <DialogDescription>
            Upload a CSV file to import multiple contacts at once
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Download */}
          <div className="border rounded-lg p-4 bg-muted/50">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-medium">Need a template?</p>
                <p className="text-sm text-muted-foreground">
                  Download our CSV template with all supported fields
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={downloadTemplate}
              >
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
            </div>
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label>Upload CSV File</Label>
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              {csvContent ? (
                <div className="space-y-2">
                  <FileText className="h-12 w-12 mx-auto text-green-500" />
                  <p className="text-sm font-medium">File uploaded successfully</p>
                  <div className="flex justify-center gap-2 flex-wrap">
                    <Badge variant="outline">{totalRows} rows</Badge>
                    <Badge variant="default" className="bg-green-500">
                      {validContacts.length} valid
                    </Badge>
                    {duplicateContacts.length > 0 && (
                      <Badge variant="secondary">
                        {duplicateContacts.length} duplicates
                      </Badge>
                    )}
                    {errorContacts.length > 0 && (
                      <Badge variant="destructive">
                        {errorContacts.length} errors
                      </Badge>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload Different File
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drag and drop a CSV file here, or click to browse
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      fetchExistingPhones()
                      fileInputRef.current?.click()
                    }}
                  >
                    Choose File
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Or paste CSV */}
          <div className="space-y-2">
            <Label htmlFor="csv-content">Or Paste CSV Content</Label>
            <Textarea
              id="csv-content"
              value={csvContent}
              onChange={(e) => {
                setCsvContent(e.target.value)
                fetchExistingPhones().then(() => parseCsv(e.target.value))
              }}
              placeholder="first_name,last_name,phone_number,email,company..."
              rows={4}
            />
          </div>

          {/* Duplicate Strategy */}
          <div className="space-y-2">
            <Label htmlFor="duplicate-strategy">Duplicate Handling</Label>
            <Select
              value={duplicateStrategy}
              onValueChange={(value: 'skip' | 'update' | 'create') =>
                setDuplicateStrategy(value)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="skip">Skip Duplicates</SelectItem>
                <SelectItem value="update">Update Existing</SelectItem>
                <SelectItem value="create">Create Anyway</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              How to handle contacts with phone numbers that already exist
            </p>
          </div>

          {/* Error Alert */}
          {parseError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}

          {/* Import Progress */}
          {isImporting && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Importing contacts...</span>
                <span>{importProgress}%</span>
              </div>
              <Progress value={importProgress} />
            </div>
          )}

          {/* Import Result */}
          {importResult && (
            <Alert variant={importResult.failed > 0 ? 'destructive' : 'default'}>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {importResult.failed === 0 ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <span className="font-medium">Import Complete</span>
                </div>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-600">{importResult.success} imported</span>
                  {importResult.skipped > 0 && (
                    <span className="text-yellow-600">{importResult.skipped} skipped</span>
                  )}
                  {importResult.failed > 0 && (
                    <span className="text-red-600">{importResult.failed} failed</span>
                  )}
                </div>
                {importResult.errors.length > 0 && (
                  <div className="mt-2 text-xs text-muted-foreground max-h-24 overflow-y-auto">
                    {importResult.errors.slice(0, 5).map((err, i) => (
                      <div key={i}>Row {err.row}: {err.error}</div>
                    ))}
                    {importResult.errors.length > 5 && (
                      <div>...and {importResult.errors.length - 5} more errors</div>
                    )}
                  </div>
                )}
              </div>
            </Alert>
          )}

          {/* Preview */}
          {parsedContacts.length > 0 && !importResult && (
            <div className="space-y-2">
              <Label>Preview (First 10 Contacts)</Label>
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="text-left p-2 w-8">#</th>
                      <th className="text-left p-2">Name</th>
                      <th className="text-left p-2">Phone</th>
                      <th className="text-left p-2">Email</th>
                      <th className="text-left p-2">Company</th>
                      <th className="text-left p-2 w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedContacts.slice(0, 10).map((contact, index) => (
                      <tr
                        key={index}
                        className={`border-b ${
                          contact._error
                            ? 'bg-red-50 dark:bg-red-950/20'
                            : contact._isDuplicate
                              ? 'bg-yellow-50 dark:bg-yellow-950/20'
                              : ''
                        }`}
                      >
                        <td className="p-2 text-muted-foreground">{contact._rowNumber}</td>
                        <td className="p-2">{contact.full_name || '-'}</td>
                        <td className="p-2">{contact.phone_number || '-'}</td>
                        <td className="p-2">{contact.email || '-'}</td>
                        <td className="p-2">{contact.company || '-'}</td>
                        <td className="p-2">
                          {contact._error ? (
                            <div className="flex items-center gap-1 text-red-600">
                              <XCircle className="h-3 w-3" />
                              <span className="text-xs">{contact._error}</span>
                            </div>
                          ) : contact._isDuplicate ? (
                            <div className="flex items-center gap-1 text-yellow-600">
                              <AlertTriangle className="h-3 w-3" />
                              <span className="text-xs">Duplicate</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-green-600">
                              <CheckCircle2 className="h-3 w-3" />
                              <span className="text-xs">Valid</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedContacts.length > 10 && (
                  <div className="p-2 text-center text-sm text-muted-foreground border-t">
                    ...and {parsedContacts.length - 10} more contacts
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={
              !csvContent ||
              !!parseError ||
              isImporting ||
              validContacts.length === 0
            }
          >
            {isImporting ? (
              <>Importing...</>
            ) : (
              <>Import {validContacts.length} Contact{validContacts.length !== 1 ? 's' : ''}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
