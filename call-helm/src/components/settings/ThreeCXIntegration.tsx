'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'
import { useProfile } from '@/lib/hooks/useProfile'
import { Button } from '@/components/ui/button'
import {
  Phone,
  Key,
  Download,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle
} from 'lucide-react'

interface ThreeCXIntegrationData {
  enabled: boolean
  configured: boolean
  apiKey?: string
  crmUrl?: string
  threeCxServerUrl?: string
  settings?: {
    call_journaling_enabled?: boolean
    contact_creation_enabled?: boolean
    auto_create_contacts?: boolean
  }
}

interface IntegrationStats {
  total_events: number
  lookups: number
  journals: number
  contacts_created: number
  searches: number
}

interface AgentMapping {
  id: string
  three_cx_extension: string
  agent_email?: string
  agent_first_name?: string
  agent_last_name?: string
}

export function ThreeCXIntegration() {
  const { user } = useAuth()
  const { profile } = useProfile()
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [integration, setIntegration] = useState<ThreeCXIntegrationData | null>(null)
  const [stats, setStats] = useState<IntegrationStats | null>(null)
  const [agentMappings, setAgentMappings] = useState<AgentMapping[]>([])
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeStep, setActiveStep] = useState<number | null>(null)

  // New agent mapping form
  const [newMapping, setNewMapping] = useState({
    extension: '',
    email: '',
    firstName: '',
    lastName: ''
  })

  useEffect(() => {
    const orgId = profile?.organization_id || user?.user_metadata?.organization_id
    if (orgId) {
      fetchIntegrationStatus()
      fetchStats()
      fetchAgentMappings()
    }
  }, [profile?.organization_id, user?.user_metadata?.organization_id])

  const fetchIntegrationStatus = async () => {
    try {
      const orgId = profile?.organization_id || user?.user_metadata?.organization_id
      if (!orgId) {
        setError('Organization ID not found. Please ensure you are part of an organization.')
        setLoading(false)
        return
      }

      const response = await fetch(`/api/3cx/setup?organizationId=${orgId}`)
      const data = await response.json()
      setIntegration(data)
    } catch (err) {
      console.error('Error fetching integration status:', err)
      setError('Failed to load integration status')
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const orgId = profile?.organization_id || user?.user_metadata?.organization_id
      if (!orgId) return

      const response = await fetch(`/api/3cx/stats?organizationId=${orgId}`)
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      }
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }

  const fetchAgentMappings = async () => {
    try {
      const orgId = profile?.organization_id || user?.user_metadata?.organization_id
      if (!orgId) return

      const response = await fetch(`/api/3cx/agents?organizationId=${orgId}`)
      if (response.ok) {
        const data = await response.json()
        setAgentMappings(data.mappings || [])
      }
    } catch (err) {
      console.error('Error fetching agent mappings:', err)
    }
  }

  const generateApiKey = async () => {
    setGenerating(true)
    setError(null)

    try {
      const orgId = profile?.organization_id || user?.user_metadata?.organization_id
      if (!orgId) {
        setError('Organization ID not found. Please ensure you are part of an organization.')
        setGenerating(false)
        return
      }

      const response = await fetch('/api/3cx/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: orgId })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to generate API key')
      }

      const data = await response.json()
      setIntegration({
        enabled: true,
        configured: true,
        apiKey: data.apiKey,
        crmUrl: data.crmUrl
      })
    } catch (err) {
      console.error('Error generating API key:', err)
      setError(err instanceof Error ? err.message : 'Failed to generate API key. Please try again.')
    } finally {
      setGenerating(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const downloadXmlTemplate = async () => {
    if (!integration?.apiKey) return

    try {
      // Use relative URL to avoid CORS issues
      const downloadUrl = `/api/3cx/template?apiKey=${integration.apiKey}`

      // Fetch with ngrok bypass header
      const response = await fetch(downloadUrl, {
        headers: {
          'ngrok-skip-browser-warning': '1'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to download template')
      }

      // Get the XML content
      const xmlContent = await response.text()

      // Create blob and trigger download
      const blob = new Blob([xmlContent], { type: 'application/xml' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'callhelm.xml'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error downloading XML template:', err)
      setError('Failed to download XML template. Please try again.')
    }
  }

  const addAgentMapping = async () => {
    try {
      const orgId = profile?.organization_id || user?.user_metadata?.organization_id
      if (!orgId) return

      const response = await fetch('/api/3cx/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: orgId,
          extension: newMapping.extension,
          agentEmail: newMapping.email,
          agentFirstName: newMapping.firstName,
          agentLastName: newMapping.lastName
        })
      })

      if (response.ok) {
        await fetchAgentMappings()
        setNewMapping({ extension: '', email: '', firstName: '', lastName: '' })
      }
    } catch (err) {
      console.error('Error adding agent mapping:', err)
    }
  }

  const deleteAgentMapping = async (mappingId: string) => {
    try {
      const response = await fetch(`/api/3cx/agents/${mappingId}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        await fetchAgentMappings()
      }
    } catch (err) {
      console.error('Error deleting agent mapping:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Phone className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">3CX Integration</h2>
              <p className="text-sm text-gray-600">Connect your 3CX PBX to Call-Helm</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {integration?.enabled ? (
            <div className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">Active</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1 bg-gray-100 text-gray-700 rounded-full">
              <XCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Not Configured</span>
            </div>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Integration Statistics */}
      {stats && integration?.configured && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{stats.total_events}</div>
            <div className="text-sm text-gray-600">Total Events</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{stats.lookups}</div>
            <div className="text-sm text-gray-600">Contact Lookups</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{stats.journals}</div>
            <div className="text-sm text-gray-600">Calls Journaled</div>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-900">{stats.contacts_created}</div>
            <div className="text-sm text-gray-600">Contacts Created</div>
          </div>
        </div>
      )}

      {/* Setup Steps */}
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Setup Instructions</h3>

        <div className="space-y-6">
          {/* Step 1: Generate API Key */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                integration?.configured ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
              }`}>
                {integration?.configured ? <Check className="h-5 w-5" /> : '1'}
              </div>
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 mb-2">Generate API Key</h4>
              <p className="text-sm text-gray-600 mb-3">
                Create a secure API key that 3CX will use to communicate with Call-Helm.
              </p>

              {!integration?.configured ? (
                <Button onClick={generateApiKey} disabled={generating}>
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Key className="h-4 w-4 mr-2" />
                      Generate API Key
                    </>
                  )}
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-gray-100 rounded text-xs font-mono break-all">
                      {integration.apiKey}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(integration.apiKey!)}
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4 mr-1" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4 mr-1" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={generateApiKey}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Regenerate Key
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Download XML Template */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold ${
                integration?.configured ? 'bg-primary text-primary-foreground' : 'bg-gray-100 text-gray-700'
              }`}>
                2
              </div>
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 mb-2">Download XML Template</h4>
              <p className="text-sm text-gray-600 mb-3">
                Download the CRM integration template file that you'll upload to 3CX.
              </p>

              <Button
                onClick={downloadXmlTemplate}
                disabled={!integration?.configured}
                variant={integration?.configured ? 'default' : 'outline'}
              >
                <Download className="h-4 w-4 mr-2" />
                Download callhelm.xml
              </Button>
            </div>
          </div>

          {/* Step 3: Configure 3CX */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="h-8 w-8 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-sm font-bold">
                3
              </div>
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 mb-2">Configure 3CX</h4>
              <div className="text-sm text-gray-600 space-y-2">
                <ol className="list-decimal list-inside space-y-1">
                  <li>Log into your 3CX Management Console</li>
                  <li>Go to <strong>Settings → CRM Integration</strong></li>
                  <li>Click <strong>"+ Add CRM Template"</strong></li>
                  <li>Upload the <code>call-helm-3cx.xml</code> file</li>
                  <li>Select <strong>"Call-Helm"</strong> from the CRM dropdown</li>
                  <li>Verify the API Key and Call-Helm URL are pre-filled</li>
                  <li>Enable <strong>"Call Journaling"</strong> to automatically log calls</li>
                  <li>Enable <strong>"Allow contact creation"</strong> to create contacts from 3CX</li>
                  <li>Click <strong>"Test"</strong> to verify the connection</li>
                  <li>Click <strong>"Save"</strong> when the test succeeds</li>
                </ol>
              </div>
            </div>
          </div>

          {/* Step 4: Map Agent Extensions */}
          <div className="flex gap-4">
            <div className="flex-shrink-0">
              <div className="h-8 w-8 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center text-sm font-bold">
                4
              </div>
            </div>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 mb-2">Map Agent Extensions (Optional)</h4>
              <p className="text-sm text-gray-600 mb-3">
                Link 3CX extension numbers to Call-Helm users so calls are attributed correctly.
              </p>
              <Button
                variant="outline"
                onClick={() => setActiveStep(activeStep === 4 ? null : 4)}
              >
                {activeStep === 4 ? 'Hide' : 'Show'} Agent Mappings
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Agent Extension Mapping */}
      {activeStep === 4 && (
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Agent Extension Mappings</h3>

          {/* Add New Mapping Form */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-900 mb-3">Add New Mapping</h4>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                type="text"
                placeholder="Extension (e.g., 101)"
                value={newMapping.extension}
                onChange={(e) => setNewMapping({ ...newMapping, extension: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="email"
                placeholder="Agent Email"
                value={newMapping.email}
                onChange={(e) => setNewMapping({ ...newMapping, email: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="First Name"
                value={newMapping.firstName}
                onChange={(e) => setNewMapping({ ...newMapping, firstName: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
              <input
                type="text"
                placeholder="Last Name"
                value={newMapping.lastName}
                onChange={(e) => setNewMapping({ ...newMapping, lastName: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <Button
              onClick={addAgentMapping}
              disabled={!newMapping.extension || !newMapping.email}
              className="mt-3"
              size="sm"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Mapping
            </Button>
          </div>

          {/* Existing Mappings Table */}
          {agentMappings.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">Extension</th>
                    <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">Agent Email</th>
                    <th className="text-left py-2 px-3 text-sm font-medium text-gray-700">Name</th>
                    <th className="text-right py-2 px-3 text-sm font-medium text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {agentMappings.map((mapping) => (
                    <tr key={mapping.id} className="border-b border-gray-100">
                      <td className="py-2 px-3 text-sm text-gray-900">{mapping.three_cx_extension}</td>
                      <td className="py-2 px-3 text-sm text-gray-600">{mapping.agent_email}</td>
                      <td className="py-2 px-3 text-sm text-gray-600">
                        {mapping.agent_first_name} {mapping.agent_last_name}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteAgentMapping(mapping.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500 text-sm">
              No agent mappings configured yet. Add your first mapping above.
            </div>
          )}
        </div>
      )}

      {/* Documentation Link */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-blue-800 mb-2">
              For detailed setup instructions, troubleshooting tips, and API reference, see the full documentation.
            </p>
            <Button
              variant="link"
              size="sm"
              className="text-blue-600 hover:text-blue-700 p-0 h-auto"
              onClick={() => window.open('/docs/3CX_INTEGRATION_GUIDE.md', '_blank')}
            >
              View 3CX Integration Guide
              <ExternalLink className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
