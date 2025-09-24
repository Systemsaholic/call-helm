'use client'

import { useState, useEffect } from 'react'
import { useConfirmation } from '@/lib/hooks/useConfirmation'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Phone,
  Plus,
  Settings,
  Trash2,
  AlertCircle,
  CheckCircle,
  Loader2,
  Info,
  PhoneCall,
  MessageSquare,
  Voicemail,
  ExternalLink
} from 'lucide-react'
import { toast } from 'sonner'
import { usePhoneNumbers } from '@/lib/hooks/usePhoneNumbers'

export function PhoneNumberConfiguration() {
  const confirmation = useConfirmation()
  const {
    phoneNumbers,
    voiceIntegration,
    loading,
    error,
    addPhoneNumber,
    updatePhoneNumber,
    deletePhoneNumber,
    configureVoiceIntegration
  } = usePhoneNumbers()
  
  const [saving, setSaving] = useState(false)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [showConfigDialog, setShowConfigDialog] = useState(false)
  const [selectedNumber, setSelectedNumber] = useState<any>(null)
  
  // Form state for adding/configuring
  const [newNumber, setNewNumber] = useState('')
  const [friendlyName, setFriendlyName] = useState('')
  const [capabilities, setCapabilities] = useState({
    voice: true,
    sms: false,
    voicemail: true
  })
  
  // SignalWire configuration
  const [signalWireConfig, setSignalWireConfig] = useState({
    spaceUrl: '',
    projectId: '',
    apiToken: ''
  })

  useEffect(() => {
    if (voiceIntegration?.space_url) {
      setSignalWireConfig(prev => ({
        ...prev,
        spaceUrl: voiceIntegration.space_url || '',
        projectId: voiceIntegration.project_id || '',
        apiToken: '' // Don't expose the API token
      }))
    }
  }, [voiceIntegration])

  const handleSaveSignalWireConfig = async () => {
    if (!signalWireConfig.spaceUrl || !signalWireConfig.projectId || !signalWireConfig.apiToken) {
      toast.error('Please fill in all SignalWire configuration fields')
      return
    }

    setSaving(true)
    try {
      await configureVoiceIntegration(signalWireConfig)
      setShowConfigDialog(false)
    } catch (error) {
      // Error is already handled in the hook
    } finally {
      setSaving(false)
    }
  }

  const handleAddPhoneNumber = async () => {
    if (!newNumber || !friendlyName) {
      toast.error('Please provide both phone number and friendly name')
      return
    }

    setSaving(true)
    try {
      await addPhoneNumber({
        number: newNumber,
        friendly_name: friendlyName,
        capabilities: {
          voice: capabilities.voice,
          sms: capabilities.sms,
          mms: false,
          fax: false
        },
        status: 'active',
        is_primary: phoneNumbers.length === 0,
        provider: 'signalwire',
        provider_id: undefined
      })
      
      setShowAddDialog(false)
      
      // Reset form
      setNewNumber('')
      setFriendlyName('')
      setCapabilities({ voice: true, sms: false, voicemail: true })
    } catch (error) {
      // Error is already handled in the hook
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteNumber = async (numberId: string) => {
    const number = phoneNumbers?.find(n => n.id === numberId)
    confirmation.showConfirmation({
      title: 'Remove Phone Number',
      description: `Are you sure you want to remove ${number?.number || 'this phone number'}? This action cannot be undone.`,
      confirmText: 'Remove',
      cancelText: 'Cancel',
      variant: 'destructive',
      onConfirm: async () => {
        try {
          await deletePhoneNumber(numberId)
        } catch (error) {
          // Error is already handled in the hook
        }
      }
    })
  }

  const handleSetPrimary = async (numberId: string) => {
    try {
      await updatePhoneNumber(numberId, { is_primary: true })
    } catch (error) {
      // Error is already handled in the hook
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
      {/* Voice Provider Configuration */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Voice Provider</h3>
            <p className="text-sm text-gray-600 mt-1">Configure your telephony provider for calls and SMS</p>
          </div>
          {voiceIntegration?.is_active ? (
            <Badge className="bg-accent/20 text-accent">
              <CheckCircle className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          ) : (
            <Badge variant="outline">Not Configured</Badge>
          )}
        </div>

        {!voiceIntegration?.is_active ? (
          <Alert className="mb-4 border-amber-200 bg-amber-50">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              You need to configure your voice provider before you can add phone numbers.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex gap-3">
          <Button 
            onClick={() => setShowConfigDialog(true)}
            variant={voiceIntegration?.is_active ? "outline" : "default"}
          >
            <Settings className="h-4 w-4 mr-2" />
            {voiceIntegration?.is_active ? 'Update Configuration' : 'Configure Provider'}
          </Button>
          {voiceIntegration?.is_active && (
            <Button variant="outline" asChild>
              <a 
                href="https://signalwire.com" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center"
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                SignalWire Dashboard
              </a>
            </Button>
          )}
        </div>
      </div>

      {/* Phone Numbers List */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Phone Numbers</h3>
            <p className="text-sm text-gray-600 mt-1">Manage your organization's phone numbers</p>
          </div>
          <Button 
            onClick={() => setShowAddDialog(true)}
            disabled={!voiceIntegration?.is_active}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Number
          </Button>
        </div>

        {phoneNumbers.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed border-gray-200 rounded-lg">
            <Phone className="h-12 w-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No phone numbers configured</p>
            <p className="text-sm text-gray-500 mt-1">Add a phone number to start making calls</p>
            <Button 
              className="mt-4" 
              onClick={() => setShowAddDialog(true)}
              disabled={!voiceIntegration?.is_active}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Number
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {phoneNumbers.map((number) => (
              <div 
                key={number.id} 
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <Phone className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{number.number}</p>
                        {number.is_primary && (
                          <Badge className="bg-primary/20 text-primary text-xs">Primary</Badge>
                        )}
                        <Badge 
                          variant={number.status === 'active' ? 'default' : 'outline'}
                          className={number.status === 'active' ? 'bg-accent/20 text-accent' : ''}
                        >
                          {number.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-600">{number.friendly_name}</p>
                      <div className="flex items-center gap-3 mt-1">
                        {number.capabilities.voice && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <PhoneCall className="h-3 w-3" />
                            Voice
                          </span>
                        )}
                        {number.capabilities.sms && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <MessageSquare className="h-3 w-3" />
                            SMS
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!number.is_primary && (
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleSetPrimary(number.id)}
                      >
                        Set as Primary
                      </Button>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                      onClick={() => handleDeleteNumber(number.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {phoneNumbers.length > 0 && (
          <Alert className="mt-4 bg-primary/10 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="text-gray-700">
              Your primary number will be used for outbound calls. SMS capabilities depend on your provider settings.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* SignalWire Configuration Dialog */}
      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configure SignalWire</DialogTitle>
            <DialogDescription>
              Enter your SignalWire credentials to enable voice calling
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="space-url">Space URL</Label>
              <Input
                id="space-url"
                placeholder="your-space.signalwire.com"
                value={signalWireConfig.spaceUrl}
                onChange={(e) => setSignalWireConfig({ ...signalWireConfig, spaceUrl: e.target.value })}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">Found in your SignalWire dashboard</p>
            </div>

            <div>
              <Label htmlFor="project-id">Project ID</Label>
              <Input
                id="project-id"
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                value={signalWireConfig.projectId}
                onChange={(e) => setSignalWireConfig({ ...signalWireConfig, projectId: e.target.value })}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="api-token">API Token</Label>
              <Input
                id="api-token"
                type="password"
                placeholder="Your API token"
                value={signalWireConfig.apiToken}
                onChange={(e) => setSignalWireConfig({ ...signalWireConfig, apiToken: e.target.value })}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">Keep this secure and never share it</p>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                You can find these credentials in your SignalWire Space under API → Credentials
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfigDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSignalWireConfig} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Configuration'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Phone Number Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Phone Number</DialogTitle>
            <DialogDescription>
              Add a new phone number to your organization
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="phone-number">Phone Number</Label>
              <Input
                id="phone-number"
                placeholder="+1 (555) 000-0000"
                value={newNumber}
                onChange={(e) => setNewNumber(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-gray-500 mt-1">Include country code</p>
            </div>

            <div>
              <Label htmlFor="friendly-name">Friendly Name</Label>
              <Input
                id="friendly-name"
                placeholder="e.g., Main Business Line"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label className="mb-3">Capabilities</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <Checkbox 
                    checked={capabilities.voice}
                    onCheckedChange={(checked) => setCapabilities({ ...capabilities, voice: checked as boolean })}
                  />
                  <span className="text-sm">Voice Calls</span>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox 
                    checked={capabilities.sms}
                    onCheckedChange={(checked) => setCapabilities({ ...capabilities, sms: checked as boolean })}
                  />
                  <span className="text-sm">SMS Messaging</span>
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox 
                    checked={capabilities.voicemail}
                    onCheckedChange={(checked) => setCapabilities({ ...capabilities, voicemail: checked as boolean })}
                  />
                  <span className="text-sm">Voicemail</span>
                </label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddPhoneNumber} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Number'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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