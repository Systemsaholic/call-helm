'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import Papa from 'papaparse'
import { useAgentStore } from '@/lib/stores/agentStore'
import { useBulkCreateAgents } from '@/lib/hooks/useAgents'
import { Button } from '@/components/ui/button'
import { 
  X, 
  Upload, 
  FileText, 
  AlertCircle, 
  CheckCircle,
  Download,
  Loader2
} from 'lucide-react'

interface CSVAgent {
  full_name: string
  email: string
  phone?: string
  role?: string
  department?: string
  extension?: string
  bio?: string
}

export function ImportAgentsModal() {
  const { isImportModalOpen, setImportModalOpen } = useAgentStore()
  const bulkCreateAgents = useBulkCreateAgents()
  const [csvData, setCsvData] = useState<CSVAgent[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [previewMode, setPreviewMode] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (!file) return

    setIsProcessing(true)
    setErrors([])

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const validAgents: CSVAgent[] = []
        const parseErrors: string[] = []

        results.data.forEach((row: any, index: number) => {
          // Validate required fields
          if (!row.full_name || !row.email) {
            parseErrors.push(`Row ${index + 2}: Missing required fields (full_name, email)`)
            return
          }

          // Validate email format
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
          if (!emailRegex.test(row.email)) {
            parseErrors.push(`Row ${index + 2}: Invalid email format (${row.email})`)
            return
          }

          // Validate role if provided
          const validRoles = ['agent', 'team_lead', 'billing_admin', 'org_admin']
          if (row.role && !validRoles.includes(row.role)) {
            parseErrors.push(`Row ${index + 2}: Invalid role (${row.role})`)
            return
          }

          validAgents.push({
            full_name: row.full_name.trim(),
            email: row.email.trim().toLowerCase(),
            phone: row.phone?.trim() || undefined,
            role: row.role?.trim() || 'agent',
            department: row.department?.trim() || undefined,
            extension: row.extension?.trim() || undefined,
            bio: row.bio?.trim() || undefined,
          })
        })

        setCsvData(validAgents)
        setErrors(parseErrors)
        setPreviewMode(true)
        setIsProcessing(false)
      },
      error: (error) => {
        setErrors([`CSV parsing error: ${error.message}`])
        setIsProcessing(false)
      },
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
  })

  const handleImport = async () => {
    if (csvData.length === 0) return

    setIsProcessing(true)
    try {
      const validAgents = csvData.map(agent => ({
        ...agent,
        role: (['agent', 'org_admin', 'team_lead', 'billing_admin'].includes(agent.role || '') 
          ? agent.role 
          : 'agent') as 'agent' | 'org_admin' | 'team_lead' | 'billing_admin'
      }))
      await bulkCreateAgents.mutateAsync(validAgents)
      handleClose()
    } catch (error) {
      setErrors(['Failed to import agents. Please try again.'])
    } finally {
      setIsProcessing(false)
    }
  }

  const handleClose = () => {
    setCsvData([])
    setErrors([])
    setPreviewMode(false)
    setImportModalOpen(false)
  }

  const downloadTemplate = () => {
    const template = `full_name,email,phone,role,department,extension,bio
John Doe,john@example.com,+1 555-0100,agent,Sales,1001,Experienced sales agent
Jane Smith,jane@example.com,+1 555-0101,team_lead,Support,1002,Support team lead
Bob Johnson,bob@example.com,,agent,Sales,,New team member`

    const blob = new Blob([template], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'agent_import_template.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (!isImportModalOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-3xl max-h-[90vh] overflow-hidden">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Import Agents from CSV</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
          {!previewMode ? (
            <>
              {/* Upload Area */}
              <div
                {...getRootProps()}
                className={`
                  border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                  transition-colors duration-200
                  ${isDragActive 
                    ? 'border-primary bg-primary/5' 
                    : 'border-gray-300 hover:border-gray-400'
                  }
                `}
              >
                <input {...getInputProps()} />
                <Upload className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="text-gray-700 font-medium mb-2">
                  {isDragActive 
                    ? 'Drop the CSV file here...' 
                    : 'Drag & drop a CSV file here, or click to select'
                  }
                </p>
                <p className="text-sm text-gray-500">
                  Only CSV files are accepted
                </p>
              </div>

              {/* Template Download */}
              <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900">
                      Need a template?
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      Download our CSV template with the correct format and example data.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={downloadTemplate}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      Download Template
                    </Button>
                  </div>
                </div>
              </div>

              {/* CSV Format Info */}
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-900 mb-2">CSV Format Requirements:</h3>
                <ul className="space-y-1 text-sm text-gray-600">
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400 mt-0.5">•</span>
                    <span><strong>Required fields:</strong> full_name, email</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400 mt-0.5">•</span>
                    <span><strong>Optional fields:</strong> phone, role, department, extension, bio</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-gray-400 mt-0.5">•</span>
                    <span><strong>Valid roles:</strong> agent (default), team_lead, billing_admin, org_admin</span>
                  </li>
                </ul>
              </div>
            </>
          ) : (
            <>
              {/* Preview Section */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-900">Preview Import Data</h3>
                  <span className="text-sm text-gray-600">
                    {csvData.length} agents to import
                  </span>
                </div>

                {/* Errors */}
                {errors.length > 0 && (
                  <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-red-900 mb-2">
                          {errors.length} validation {errors.length === 1 ? 'error' : 'errors'} found:
                        </p>
                        <ul className="space-y-1">
                          {errors.map((error, index) => (
                            <li key={index} className="text-sm text-red-700">
                              {error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* Success Message */}
                {csvData.length > 0 && errors.length === 0 && (
                  <div className="mb-4 bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                      <p className="text-sm text-green-800">
                        All data validated successfully. Ready to import.
                      </p>
                    </div>
                  </div>
                )}

                {/* Data Table */}
                {csvData.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium text-gray-700">Name</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-700">Email</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-700">Role</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-700">Department</th>
                            <th className="px-4 py-2 text-left font-medium text-gray-700">Phone</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {csvData.slice(0, 10).map((agent, index) => (
                            <tr key={index} className="hover:bg-gray-50">
                              <td className="px-4 py-2">{agent.full_name}</td>
                              <td className="px-4 py-2">{agent.email}</td>
                              <td className="px-4 py-2">
                                <span className="capitalize">{agent.role || 'agent'}</span>
                              </td>
                              <td className="px-4 py-2">{agent.department || '-'}</td>
                              <td className="px-4 py-2">{agent.phone || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {csvData.length > 10 && (
                      <div className="px-4 py-2 bg-gray-50 border-t text-sm text-gray-600 text-center">
                        ... and {csvData.length - 10} more agents
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Note */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  Agents will be added to the system without sending invitation emails. 
                  You can send invitations later using bulk actions.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-white border-t px-6 py-4">
          <div className="flex gap-3 justify-end">
            {previewMode && (
              <Button
                variant="outline"
                onClick={() => {
                  setPreviewMode(false)
                  setCsvData([])
                  setErrors([])
                }}
              >
                Back
              </Button>
            )}
            <Button
              variant="outline"
              onClick={handleClose}
            >
              Cancel
            </Button>
            {previewMode && csvData.length > 0 && (
              <Button
                onClick={handleImport}
                disabled={isProcessing || bulkCreateAgents.isPending}
                className="min-w-[100px]"
              >
                {(isProcessing || bulkCreateAgents.isPending) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  `Import ${csvData.length} Agents`
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}