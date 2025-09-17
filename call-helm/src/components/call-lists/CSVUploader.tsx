'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { 
  Upload, 
  FileSpreadsheet, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Download,
  Trash2
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import Papa from 'papaparse'

interface CSVUploaderProps {
  onUploadComplete: (contacts: any[]) => void
  uploadedContacts: any[]
}

export function CSVUploader({ onUploadComplete, uploadedContacts }: CSVUploaderProps) {
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<any[]>([])

  const processCSV = (file: File) => {
    setIsProcessing(true)
    setError(null)

    Papa.parse(file, {
      complete: (result) => {
        try {
          const data = result.data as any[]
          
          // Filter out empty rows
          const validRows = data.filter(row => 
            Object.values(row).some(value => value !== '' && value !== null)
          )

          if (validRows.length === 0) {
            throw new Error('No valid data found in CSV file')
          }

          // Map CSV data to contact format
          const contacts = validRows.map((row, index) => ({
            id: `csv-${Date.now()}-${index}`,
            name: row.name || row.Name || row.full_name || row['Full Name'] || '',
            email: row.email || row.Email || row['Email Address'] || '',
            phone: row.phone || row.Phone || row['Phone Number'] || '',
            company: row.company || row.Company || row.Organization || '',
            notes: row.notes || row.Notes || row.Description || '',
            tags: row.tags ? row.tags.split(',').map((t: string) => t.trim()) : [],
            imported: true
          }))

          // Validate required fields
          const invalidContacts = contacts.filter(c => !c.name && !c.email && !c.phone)
          if (invalidContacts.length === contacts.length) {
            throw new Error('CSV must contain at least name, email, or phone columns')
          }

          setPreview(contacts.slice(0, 5))
          onUploadComplete(contacts)
          setIsProcessing(false)
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to process CSV file')
          setIsProcessing(false)
        }
      },
      header: true,
      skipEmptyLines: true,
      error: (err) => {
        setError(`Failed to parse CSV: ${err.message}`)
        setIsProcessing(false)
      }
    })
  }

  const onDrop = useCallback((acceptedFiles: File[], rejectedFiles: any[]) => {
    if (rejectedFiles.length > 0) {
      setError('Please upload a valid CSV file')
      return
    }
    
    const file = acceptedFiles[0]
    if (file) {
      processCSV(file)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/csv': ['.csv'],
      'text/plain': ['.csv']
    },
    multiple: false,
    noClick: false, // Allow clicking on the dropzone
    noKeyboard: false
  })

  const downloadTemplate = () => {
    const template = 'name,email,phone,company,notes,tags\n' +
      'John Doe,john@example.com,+1234567890,Acme Corp,"Important client","vip,priority"\n' +
      'Jane Smith,jane@example.com,+0987654321,Tech Inc,"New lead","new,tech"'
    
    const blob = new Blob([template], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'contacts_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const clearUpload = () => {
    setPreview([])
    onUploadComplete([])
    setError(null)
  }

  const handleButtonClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    open()
  }

  if (uploadedContacts.length > 0) {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
              <div>
                <p className="font-medium text-green-900">
                  Successfully uploaded {uploadedContacts.length} contacts
                </p>
                <p className="text-sm text-green-700 mt-1">
                  All contacts have been validated and are ready to be added to your call list
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={clearUpload}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Preview of uploaded contacts */}
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 border-b">
            <p className="text-sm font-medium text-gray-700">Preview (showing first 5)</p>
          </div>
          <div className="divide-y">
            {preview.map((contact, index) => (
              <div key={index} className="px-4 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{contact.name || 'No name'}</span>
                    {contact.email && (
                      <span className="text-gray-600 ml-2">{contact.email}</span>
                    )}
                  </div>
                  {contact.phone && (
                    <span className="text-gray-500">{contact.phone}</span>
                  )}
                </div>
                {contact.tags && contact.tags.length > 0 && (
                  <div className="flex gap-1 mt-1">
                    {contact.tags.map((tag: string) => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Upload Area */}
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-gray-300 hover:border-gray-400'}
          ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        <input {...getInputProps()} />
        <FileSpreadsheet className="h-12 w-12 mx-auto text-gray-400 mb-4" />
        <p className="text-gray-700 font-medium mb-1">
          {isDragActive ? 'Drop your CSV file here' : 'Drag & drop your CSV file here'}
        </p>
        <p className="text-sm text-gray-500 mb-4">or click anywhere to browse</p>
        <Button 
          variant="outline" 
          size="sm" 
          disabled={isProcessing}
          type="button"
          onClick={handleButtonClick}
        >
          <Upload className="h-4 w-4 mr-2" />
          Select CSV File
        </Button>
      </div>

      {/* Template Download */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <div>
          <p className="text-sm font-medium text-gray-700">Need a template?</p>
          <p className="text-xs text-gray-500">Download our CSV template with sample data</p>
        </div>
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <Download className="h-4 w-4 mr-2" />
          Download Template
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
          <XCircle className="h-4 w-4 text-red-600 mt-0.5" />
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      {/* Processing Indicator */}
      {isProcessing && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
          <div className="text-sm text-blue-800">Processing CSV file...</div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          CSV Format Requirements
        </h4>
        <ul className="text-xs text-gray-600 space-y-1 ml-6">
          <li>• First row must contain column headers</li>
          <li>• Supported columns: name, email, phone, company, notes, tags</li>
          <li>• At least one of name, email, or phone is required</li>
          <li>• Tags should be comma-separated values</li>
          <li>• Maximum file size: 10MB</li>
        </ul>
      </div>
    </div>
  )
}