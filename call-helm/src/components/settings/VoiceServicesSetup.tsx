'use client'

import { useState, useEffect } from 'react'
import { useConfirmation } from '@/lib/hooks/useConfirmation'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Phone,
  CheckCircle,
  Settings,
  Loader2,
  Info,
  PhoneCall,
  MessageSquare,
  Voicemail,
  Shield,
  ArrowRight,
  PhoneForwarded
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/hooks/useAuth'
import { NumberVerification } from './NumberVerification'
import { NumberSelection } from './NumberSelection'

interface VoiceServicesStatus {
  enabled: boolean
  configured: boolean
  verified_number?: string
  forwarding_number?: string
  verification_status?: string
  number_type?: 'own' | 'platform'
  recording_enabled?: boolean
  voicemail_enabled?: boolean
  phone_numbers?: any[]
}

export function VoiceServicesSetup() {
  const { supabase } = useAuth()
  const confirmation = useConfirmation()
  const [status, setStatus] = useState<VoiceServicesStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [enabling, setEnabling] = useState(false)
  const [setupStep, setSetupStep] = useState<'choose' | 'verify' | 'select' | 'complete'>('choose')
  const [numberType, setNumberType] = useState<'own' | 'platform'>('own')

  useEffect(() => {
    fetchVoiceStatus()
  }, [])

  const fetchVoiceStatus = async () => {
    try {
      setLoading(true)
      
      // Get user's organization
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!member) return

      // Get voice services status
      const { data, error } = await supabase
        .rpc('get_voice_services_status', { p_org_id: member.organization_id })

      if (error) throw error

      setStatus(data)
      
      // Determine setup step based on status
      if (data.configured && data.verification_status === 'verified' && data.verified_number) {
        setSetupStep('complete')
      }
    } catch (error) {
      console.error('Error fetching voice status:', error)
      toast.error('Failed to load voice services status')
    } finally {
      setLoading(false)
    }
  }

  const handleEnableVoiceServices = async () => {
    try {
      setEnabling(true)
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!member) return

      // Enable voice services
      const { data, error } = await supabase
        .rpc('enable_voice_services', { 
          p_org_id: member.organization_id,
          p_enabled: true
        })

      if (error) throw error

      toast.success('Voice services enabled successfully')
      await fetchVoiceStatus()
    } catch (error) {
      console.error('Error enabling voice services:', error)
      toast.error('Failed to enable voice services')
    } finally {
      setEnabling(false)
    }
  }

  const handleDisableVoiceServices = async () => {
    confirmation.showConfirmation({
      title: 'Disable Voice Services',
      description: 'Are you sure you want to disable voice services? This will stop all calling functionality and may affect active calls.',
      confirmText: 'Disable Services',
      cancelText: 'Cancel',
      variant: 'destructive',
      onConfirm: async () => {
        await performDisableVoiceServices()
      }
    })
  }

  const performDisableVoiceServices = async () => {

    try {
      setEnabling(true)
      
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!member) return

      // Disable voice services
      const { data, error } = await supabase
        .rpc('enable_voice_services', { 
          p_org_id: member.organization_id,
          p_enabled: false
        })

      if (error) throw error

      toast.success('Voice services disabled')
      await fetchVoiceStatus()
    } catch (error) {
      console.error('Error disabling voice services:', error)
      toast.error('Failed to disable voice services')
    } finally {
      setEnabling(false)
    }
  }

  const handleSetupComplete = () => {
    setSetupStep('complete')
    fetchVoiceStatus()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  // If not enabled, show enable card
  if (!status?.enabled) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Voice Services</CardTitle>
              <CardDescription>Enable calling features for your organization</CardDescription>
            </div>
            <Badge variant="outline">Disabled</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4">
            <div className="flex items-start gap-3">
              <PhoneCall className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Make and Receive Calls</p>
                <p className="text-sm text-gray-600">
                  Call contacts directly from the platform with automatic recording
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Automatic Call Recording</p>
                <p className="text-sm text-gray-600">
                  All calls are recorded and stored securely for compliance
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MessageSquare className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Call Tracking & Analytics</p>
                <p className="text-sm text-gray-600">
                  Track call duration, outcomes, and performance metrics
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Voicemail className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="font-medium">Voicemail Support</p>
                <p className="text-sm text-gray-600">
                  Automated voicemail detection and message handling
                </p>
              </div>
            </div>
          </div>

          <Alert className="bg-primary/10 border-primary/20">
            <Info className="h-4 w-4 text-primary" />
            <AlertDescription className="text-gray-700">
              Voice services are billed based on usage. Calls are charged at $0.025 per minute.
            </AlertDescription>
          </Alert>

          <Button 
            onClick={handleEnableVoiceServices} 
            disabled={enabling}
            className="w-full"
          >
            {enabling ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Enabling...
              </>
            ) : (
              <>
                <Phone className="h-4 w-4 mr-2" />
                Enable Voice Services
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // If enabled but not configured, show setup flow
  if (status.enabled && (!status.configured || status.verification_status !== 'verified' || !status.verified_number)) {
    if (setupStep === 'choose') {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Set Up Your Phone Number</CardTitle>
            <CardDescription>Choose how you want to handle calls</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <RadioGroup value={numberType} onValueChange={(v) => setNumberType(v as 'own' | 'platform')}>
              <div className="space-y-4">
                <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50 data-[state=checked]:border-primary">
                  <RadioGroupItem value="own" className="mt-1" />
                  <div className="flex-1">
                    <div className="font-medium mb-1">Use My Existing Business Number</div>
                    <p className="text-sm text-gray-600">
                      Verify your current business phone number to use as caller ID. 
                      Perfect if you already have an established business number.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-4 border rounded-lg cursor-pointer hover:bg-gray-50 data-[state=checked]:border-primary">
                  <RadioGroupItem value="platform" className="mt-1" />
                  <div className="flex-1">
                    <div className="font-medium mb-1">Get a New Number</div>
                    <p className="text-sm text-gray-600">
                      Choose a new phone number from available options in your area. 
                      Incoming calls can be forwarded to your personal phone.
                    </p>
                  </div>
                </label>
              </div>
            </RadioGroup>

            <Button 
              onClick={() => setSetupStep(numberType === 'own' ? 'verify' : 'select')}
              className="w-full"
            >
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      )
    }

    if (setupStep === 'verify') {
      return <NumberVerification onComplete={handleSetupComplete} />
    }

    if (setupStep === 'select') {
      return <NumberSelection onComplete={handleSetupComplete} />
    }
  }

  // Show configured status
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Voice Services</CardTitle>
              <CardDescription>Manage your calling configuration</CardDescription>
            </div>
            <Badge className="bg-accent/20 text-accent">
              <CheckCircle className="h-3 w-3 mr-1" />
              Active
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Current Configuration */}
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Phone className="h-5 w-5 text-gray-600" />
                <div>
                  <p className="text-sm font-medium">Active Number</p>
                  <p className="text-sm text-gray-600">{status.verified_number || 'Not configured'}</p>
                </div>
              </div>
              <Badge variant="outline">
                {status.number_type === 'own' ? 'Verified' : 'Platform'}
              </Badge>
            </div>

            {status.forwarding_number && (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <PhoneForwarded className="h-5 w-5 text-gray-600" />
                  <div>
                    <p className="text-sm font-medium">Forwarding To</p>
                    <p className="text-sm text-gray-600">{status.forwarding_number}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Settings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-gray-600" />
                <Label htmlFor="recording">Call Recording</Label>
              </div>
              <Switch id="recording" checked={status.recording_enabled} disabled />
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Voicemail className="h-4 w-4 text-gray-600" />
                <Label htmlFor="voicemail">Voicemail Detection</Label>
              </div>
              <Switch id="voicemail" checked={status.voicemail_enabled} disabled />
            </div>
          </div>

          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              All calls are automatically recorded and tracked. Call recordings are stored securely and available in your call history.
            </AlertDescription>
          </Alert>

          {/* Actions */}
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setSetupStep('choose')}>
              <Settings className="h-4 w-4 mr-2" />
              Change Number
            </Button>
            <Button 
              variant="outline" 
              className="text-red-600 hover:text-red-700"
              onClick={handleDisableVoiceServices}
              disabled={enabling}
            >
              Disable Voice Services
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Usage Stats */}
      {status.phone_numbers && status.phone_numbers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Phone Numbers</CardTitle>
            <CardDescription>Your configured phone numbers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {status.phone_numbers.map((number: any) => (
                <div key={number.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-gray-600" />
                    <div>
                      <p className="font-medium">{number.number}</p>
                      <p className="text-sm text-gray-600">{number.friendly_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {number.is_primary && (
                      <Badge className="bg-primary/20 text-primary">Primary</Badge>
                    )}
                    <Badge variant="outline">{number.number_source}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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