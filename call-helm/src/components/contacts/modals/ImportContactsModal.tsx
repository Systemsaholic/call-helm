'use client'

import { useState, useRef } from 'react'
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
import { Upload, FileText, AlertCircle, Download } from 'lucide-react'
import { useImportContacts, type ContactInput } from '@/lib/hooks/useContacts'

interface ImportContactsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  callListId?: string
}

export function ImportContactsModal({ open, onOpenChange, callListId }: ImportContactsModalProps) {
  const importContacts = useImportContacts()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [csvContent, setCsvContent] = useState('')
  const [duplicateStrategy, setDuplicateStrategy] = useState<'skip' | 'update' | 'create'>('skip')
  const [previewData, setPreviewData] = useState<ContactInput[]>([])
  const [parseError, setParseError] = useState('')

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      setCsvContent(content)
      parseCsv(content)
    }
    reader.readAsText(file)
  }

  const parseCsv = (content: string) => {
    try {
      setParseError('')
      const lines = content.trim().split('\n')
      if (lines.length < 2) {
        setParseError('CSV file must have headers and at least one data row')
        return
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
      const requiredHeaders = ['full_name', 'phone_number']
      
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h))
      if (missingHeaders.length > 0) {
        setParseError(`Missing required columns: ${missingHeaders.join(', ')}`)
        return
      }

      const contacts: ContactInput[] = []
      for (let i = 1; i < Math.min(lines.length, 6); i++) { // Preview first 5 rows
        const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
        const contact: ContactInput = {
          full_name: '',
          phone_number: '',
          status: 'active',
        }

        headers.forEach((header, index) => {
          const value = values[index] || ''
          switch (header) {
            case 'full_name':
            case 'name':
              contact.full_name = value
              break
            case 'phone_number':
            case 'phone':
              contact.phone_number = value
              break
            case 'email':
              contact.email = value
              break
            case 'company':
              contact.company = value
              break
            case 'position':
            case 'title':
              contact.position = value
              break
            case 'address':
              contact.address = value
              break
            case 'city':
              contact.city = value
              break
            case 'state':
              contact.state = value
              break
            case 'postal_code':
            case 'zip':
              contact.postal_code = value
              break
            case 'country':
              contact.country = value || 'US'
              break
            case 'notes':
              contact.notes = value
              break
            case 'tags':
              contact.tags = value.split(';').map(t => t.trim()).filter(Boolean)
              break
            case 'status':
              if (['active', 'inactive', 'do_not_call'].includes(value)) {
                contact.status = value as 'active' | 'inactive' | 'do_not_call'
              }
              break
          }
        })

        if (contact.full_name && contact.phone_number) {
          contacts.push(contact)
        }
      }

      setPreviewData(contacts)
    } catch (error: any) {
      setParseError(error.message || 'Failed to parse CSV')
    }
  }

  const handleImport = () => {
    if (!csvContent) {
      setParseError('Please upload a CSV file')
      return
    }

    // Parse all rows from CSV
    const lines = csvContent.trim().split('\n')
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
    
    const contacts: ContactInput[] = []
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim().replace(/"/g, ''))
      const contact: ContactInput = {
        full_name: '',
        phone_number: '',
        status: 'active',
      }

      headers.forEach((header, index) => {
        const value = values[index] || ''
        switch (header) {
          case 'full_name':
          case 'name':
            contact.full_name = value
            break
          case 'phone_number':
          case 'phone':
            contact.phone_number = value
            break
          case 'email':
            contact.email = value
            break
          case 'company':
            contact.company = value
            break
          case 'position':
          case 'title':
            contact.position = value
            break
          case 'address':
            contact.address = value
            break
          case 'city':
            contact.city = value
            break
          case 'state':
            contact.state = value
            break
          case 'postal_code':
          case 'zip':
            contact.postal_code = value
            break
          case 'country':
            contact.country = value || 'US'
            break
          case 'notes':
            contact.notes = value
            break
          case 'tags':
            contact.tags = value.split(';').map(t => t.trim()).filter(Boolean)
            break
          case 'status':
            if (['active', 'inactive', 'do_not_call'].includes(value)) {
              contact.status = value as 'active' | 'inactive' | 'do_not_call'
            }
            break
        }
      })

      if (contact.full_name && contact.phone_number) {
        contacts.push(contact)
      }
    }

    importContacts.mutate(contacts, {
      onSuccess: () => {
        onOpenChange(false)
        setCsvContent('')
        setPreviewData([])
        setParseError('')
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
      },
    })
  }

  const downloadTemplate = () => {
    const template = `full_name,phone_number,email,company,position,address,city,state,postal_code,country,notes,tags,status
John Doe,+1 (555) 123-4567,john@example.com,Acme Corp,CEO,123 Main St,San Francisco,CA,94102,US,Important client,vip;high-priority,active
Jane Smith,+1 (555) 987-6543,jane@example.com,Tech Inc,CTO,456 Oak Ave,New York,NY,10001,US,Interested in product,lead;tech,active`

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
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
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              {csvContent ? (
                <div className="space-y-2">
                  <FileText className="h-12 w-12 mx-auto text-green-500" />
                  <p className="text-sm font-medium">File uploaded successfully</p>
                  <p className="text-xs text-muted-foreground">
                    {previewData.length} contacts ready to import
                  </p>
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
                    onClick={() => fileInputRef.current?.click()}
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
                parseCsv(e.target.value)
              }}
              placeholder="full_name,phone_number,email,company..."
              rows={5}
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

          {/* Preview */}
          {previewData.length > 0 && (
            <div className="space-y-2">
              <Label>Preview (First 5 Contacts)</Label>
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="text-left p-2">Name</th>
                      <th className="text-left p-2">Phone</th>
                      <th className="text-left p-2">Email</th>
                      <th className="text-left p-2">Company</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.map((contact, index) => (
                      <tr key={index} className="border-b">
                        <td className="p-2">{contact.full_name}</td>
                        <td className="p-2">{contact.phone_number}</td>
                        <td className="p-2">{contact.email || '-'}</td>
                        <td className="p-2">{contact.company || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleImport} 
            disabled={!csvContent || !!parseError || importContacts.isPending}
          >
            {importContacts.isPending ? 'Importing...' : 'Import Contacts'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}