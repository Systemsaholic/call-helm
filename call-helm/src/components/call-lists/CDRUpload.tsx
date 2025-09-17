'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  Upload,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Download,
  ArrowRight,
  Info,
  Clock,
  Phone
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/hooks/useAuth'

interface CDRUploadProps {
  callListId: string
  campaignName: string
  onUploadComplete?: () => void
}

interface FieldMapping {
  phoneNumber: string
  disposition: string
  duration?: string
  callDate?: string
  agentId?: string
  notes?: string
}

const SAMPLE_CDR_TEMPLATE = `phone_number,disposition,duration_seconds,call_date,agent_name,notes
+15551234567,answered,180,2024-01-08 10:30:00,John Doe,Interested in product demo
+15559876543,voicemail,45,2024-01-08 11:15:00,Jane Smith,Left voicemail
+15555555555,no_answer,0,2024-01-08 14:00:00,John Doe,`

const DISPOSITION_OPTIONS = [
  'answered',
  'voicemail',
  'busy',
  'no_answer',
  'disconnected',
  'failed',
  'callback',
  'do_not_call',
  'sale_made',
  'appointment_set',
  'not_interested',
  'wrong_number'
]

export function CDRUpload({ callListId, campaignName, onUploadComplete }: CDRUploadProps) {
  const [showUploadDialog, setShowUploadDialog] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({
    phoneNumber: '',
    disposition: '',
    duration: '',
    callDate: '',
    agentId: '',
    notes: ''
  })
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [processedRecords, setProcessedRecords] = useState(0)
  const [totalRecords, setTotalRecords] = useState(0)
  
  const { supabase, user } = useAuth()

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file) {
      setUploadedFile(file)
      parseCSVHeaders(file)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx']
    },
    maxFiles: 1
  })

  const parseCSVHeaders = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      const firstLine = text.split('\n')[0]
      const headers = firstLine.split(',').map(h => h.trim().replace(/['"]/g, ''))
      setCsvHeaders(headers)
      
      // Auto-map common field names
      const autoMapping: FieldMapping = {
        phoneNumber: headers.find(h => 
          h.toLowerCase().includes('phone') || 
          h.toLowerCase().includes('number') ||
          h.toLowerCase().includes('contact')
        ) || '',
        disposition: headers.find(h => 
          h.toLowerCase().includes('disposition') || 
          h.toLowerCase().includes('status') ||
          h.toLowerCase().includes('result')
        ) || '',
        duration: headers.find(h => 
          h.toLowerCase().includes('duration') || 
          h.toLowerCase().includes('time')
        ) || '',
        callDate: headers.find(h => 
          h.toLowerCase().includes('date') || 
          h.toLowerCase().includes('time') ||
          h.toLowerCase().includes('called')
        ) || '',
        agentId: headers.find(h => 
          h.toLowerCase().includes('agent') || 
          h.toLowerCase().includes('user') ||
          h.toLowerCase().includes('rep')
        ) || '',
        notes: headers.find(h => 
          h.toLowerCase().includes('note') || 
          h.toLowerCase().includes('comment') ||
          h.toLowerCase().includes('description')
        ) || ''
      }
      setFieldMapping(autoMapping)
      
      // Count total records
      const lines = text.split('\n').filter(line => line.trim())
      setTotalRecords(lines.length - 1) // Subtract header row
    }
    reader.readAsText(file)
  }

  const handleUpload = async () => {
    if (!uploadedFile || !fieldMapping.phoneNumber || !fieldMapping.disposition) {
      toast.error('Please map required fields: Phone Number and Disposition')
      return
    }

    setIsProcessing(true)
    setUploadProgress(0)
    setProcessedRecords(0)

    try {
      // Get user's member ID
      const { data: member } = await supabase
        .from('organization_members')
        .select('id, organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) throw new Error('Organization member not found')

      // Upload file to storage
      const fileName = `cdr_${Date.now()}_${uploadedFile.name}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('cdr-uploads')
        .upload(fileName, uploadedFile)

      if (uploadError) throw uploadError

      // Create CDR upload record
      const { data: cdrUpload, error: cdrError } = await supabase
        .from('cdr_uploads')
        .insert({
          organization_id: member.organization_id,
          campaign_id: callListId,
          uploaded_by: member.id,
          file_name: uploadedFile.name,
          file_size: uploadedFile.size,
          file_url: uploadData.path,
          record_count: totalRecords,
          status: 'processing',
          field_mapping: fieldMapping
        })
        .select()
        .single()

      if (cdrError) throw cdrError

      // Process CSV file
      const reader = new FileReader()
      reader.onload = async (e) => {
        const text = e.target?.result as string
        const lines = text.split('\n').filter(line => line.trim())
        const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''))
        
        const phoneIndex = headers.indexOf(fieldMapping.phoneNumber)
        const dispositionIndex = headers.indexOf(fieldMapping.disposition)
        const durationIndex = fieldMapping.duration ? headers.indexOf(fieldMapping.duration) : -1
        const dateIndex = fieldMapping.callDate ? headers.indexOf(fieldMapping.callDate) : -1
        const agentIndex = fieldMapping.agentId ? headers.indexOf(fieldMapping.agentId) : -1
        const notesIndex = fieldMapping.notes ? headers.indexOf(fieldMapping.notes) : -1

        const callAttempts = []
        let processed = 0
        let matched = 0

        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',').map(v => v.trim().replace(/['"]/g, ''))
          
          if (values[phoneIndex] && values[dispositionIndex]) {
            // Try to match contact
            const { data: contact } = await supabase
              .from('contacts')
              .select('id')
              .eq('organization_id', member.organization_id)
              .eq('phone_number', values[phoneIndex])
              .single()

            // Try to match call_list_contact
            let callListContactId = null
            if (contact) {
              const { data: clc } = await supabase
                .from('call_list_contacts')
                .select('id')
                .eq('call_list_id', callListId)
                .eq('contact_id', contact.id)
                .single()
              
              if (clc) {
                callListContactId = clc.id
                matched++
              }
            }

            // Try to match agent
            let agentId = null
            if (agentIndex >= 0 && values[agentIndex]) {
              const { data: agent } = await supabase
                .from('organization_members')
                .select('id')
                .eq('organization_id', member.organization_id)
                .or(`full_name.ilike.%${values[agentIndex]}%,email.ilike.%${values[agentIndex]}%`)
                .single()
              
              if (agent) agentId = agent.id
            }

            callAttempts.push({
              organization_id: member.organization_id,
              campaign_id: callListId,
              call_list_contact_id: callListContactId,
              contact_id: contact?.id || null,
              agent_id: agentId || member.id, // Default to uploader if no agent matched
              phone_number: values[phoneIndex],
              disposition: values[dispositionIndex].toLowerCase(),
              duration_seconds: durationIndex >= 0 ? parseInt(values[durationIndex]) || 0 : null,
              start_time: dateIndex >= 0 ? new Date(values[dateIndex]).toISOString() : new Date().toISOString(),
              notes: notesIndex >= 0 ? values[notesIndex] : null,
              direction: 'outbound',
              metadata: { cdr_upload_id: cdrUpload.id }
            })
          }

          processed++
          setProcessedRecords(processed)
          setUploadProgress(Math.round((processed / totalRecords) * 100))
        }

        // Batch insert call attempts
        if (callAttempts.length > 0) {
          const { error: insertError } = await supabase
            .from('call_attempts')
            .insert(callAttempts)

          if (insertError) throw insertError

          // Update CDR upload status
          await supabase
            .from('cdr_uploads')
            .update({
              status: 'completed',
              processed_count: processed,
              matched_count: matched,
              completed_at: new Date().toISOString()
            })
            .eq('id', cdrUpload.id)

          toast.success(`Successfully imported ${callAttempts.length} call records`)
        }

        setIsProcessing(false)
        setShowUploadDialog(false)
        if (onUploadComplete) onUploadComplete()
      }

      reader.readAsText(uploadedFile)
    } catch (error: any) {
      console.error('CDR upload error:', error)
      toast.error(error.message || 'Failed to upload CDR')
      setIsProcessing(false)
    }
  }

  const downloadTemplate = () => {
    const blob = new Blob([SAMPLE_CDR_TEMPLATE], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cdr_template.csv'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => setShowUploadDialog(true)}
      >
        <Upload className="h-4 w-4 mr-2" />
        Upload CDR
      </Button>

      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Upload Call Detail Records (CDR)</DialogTitle>
            <DialogDescription>
              Upload a CSV file with call records for: {campaignName}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {!uploadedFile ? (
              <>
                {/* Dropzone */}
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                    ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'}`}
                >
                  <input {...getInputProps()} />
                  <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-gray-600 mb-2">
                    {isDragActive
                      ? 'Drop the file here...'
                      : 'Drag & drop a CSV file here, or click to select'}
                  </p>
                  <p className="text-sm text-gray-500">
                    Supported formats: CSV, XLS, XLSX
                  </p>
                </div>

                {/* Template Download */}
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    <div className="flex items-center justify-between">
                      <span>Need a template? Download our sample CDR format.</span>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={downloadTemplate}
                      >
                        <Download className="h-4 w-4 mr-1" />
                        Download Template
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              </>
            ) : (
              <>
                {/* File Info */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-gray-400" />
                      <div>
                        <p className="font-medium">{uploadedFile.name}</p>
                        <p className="text-sm text-gray-500">
                          {totalRecords} records • {(uploadedFile.size / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setUploadedFile(null)
                        setCsvHeaders([])
                        setFieldMapping({
                          phoneNumber: '',
                          disposition: '',
                          duration: '',
                          callDate: '',
                          agentId: '',
                          notes: ''
                        })
                      }}
                    >
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Field Mapping */}
                <div className="space-y-4">
                  <h4 className="font-medium">Map CSV Columns to Fields</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="phone-field">
                        Phone Number <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={fieldMapping.phoneNumber}
                        onValueChange={(value) => setFieldMapping({...fieldMapping, phoneNumber: value})}
                      >
                        <SelectTrigger id="phone-field">
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                          {csvHeaders.map(header => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="disposition-field">
                        Call Disposition <span className="text-red-500">*</span>
                      </Label>
                      <Select
                        value={fieldMapping.disposition}
                        onValueChange={(value) => setFieldMapping({...fieldMapping, disposition: value})}
                      >
                        <SelectTrigger id="disposition-field">
                          <SelectValue placeholder="Select column" />
                        </SelectTrigger>
                        <SelectContent>
                          {csvHeaders.map(header => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="duration-field">Duration (seconds)</Label>
                      <Select
                        value={fieldMapping.duration}
                        onValueChange={(value) => setFieldMapping({...fieldMapping, duration: value})}
                      >
                        <SelectTrigger id="duration-field">
                          <SelectValue placeholder="Select column (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {csvHeaders.map(header => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="date-field">Call Date/Time</Label>
                      <Select
                        value={fieldMapping.callDate}
                        onValueChange={(value) => setFieldMapping({...fieldMapping, callDate: value})}
                      >
                        <SelectTrigger id="date-field">
                          <SelectValue placeholder="Select column (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {csvHeaders.map(header => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="agent-field">Agent Name/ID</Label>
                      <Select
                        value={fieldMapping.agentId}
                        onValueChange={(value) => setFieldMapping({...fieldMapping, agentId: value})}
                      >
                        <SelectTrigger id="agent-field">
                          <SelectValue placeholder="Select column (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {csvHeaders.map(header => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="notes-field">Notes/Comments</Label>
                      <Select
                        value={fieldMapping.notes}
                        onValueChange={(value) => setFieldMapping({...fieldMapping, notes: value})}
                      >
                        <SelectTrigger id="notes-field">
                          <SelectValue placeholder="Select column (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">None</SelectItem>
                          {csvHeaders.map(header => (
                            <SelectItem key={header} value={header}>
                              {header}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Progress */}
                {isProcessing && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Processing records...</span>
                      <span>{processedRecords} / {totalRecords}</span>
                    </div>
                    <Progress value={uploadProgress} />
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowUploadDialog(false)}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            {uploadedFile && (
              <Button
                onClick={handleUpload}
                disabled={
                  isProcessing ||
                  !fieldMapping.phoneNumber ||
                  !fieldMapping.disposition
                }
              >
                {isProcessing ? 'Processing...' : 'Import Records'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}