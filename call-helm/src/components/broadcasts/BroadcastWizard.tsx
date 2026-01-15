'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useCreateBroadcast, useSendBroadcast } from '@/lib/hooks/useBroadcasts'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  AlertCircle,
  Phone,
  Users,
  MessageSquare,
  Calendar,
  FileText,
  Shield,
  Upload,
  X,
} from 'lucide-react'
import { format } from 'date-fns'
import { RecipientSelector } from './RecipientSelector'

interface PhoneNumber {
  id: string
  number: string
  friendly_name?: string
  status: string
  phone_number_campaigns?: Array<{
    campaign_registry_campaigns: Array<{
      id: string
      campaign_name: string
      status: string
      use_case: string
    }>
  }>
}

interface BroadcastWizardProps {
  open: boolean
  onClose: () => void
}

type WizardStep = 'details' | 'message' | 'recipients' | 'phone' | 'schedule' | 'review'

const STEPS: { id: WizardStep; title: string; icon: React.ReactNode }[] = [
  { id: 'details', title: 'Details', icon: <FileText className="h-4 w-4" /> },
  { id: 'message', title: 'Message', icon: <MessageSquare className="h-4 w-4" /> },
  { id: 'recipients', title: 'Recipients', icon: <Users className="h-4 w-4" /> },
  { id: 'phone', title: 'Phone Number', icon: <Phone className="h-4 w-4" /> },
  { id: 'schedule', title: 'Schedule', icon: <Calendar className="h-4 w-4" /> },
  { id: 'review', title: 'Review', icon: <Check className="h-4 w-4" /> },
]

export function BroadcastWizard({ open, onClose }: BroadcastWizardProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState<WizardStep>('details')
  const [formData, setFormData] = useState({
    name: '',
    messageTemplate: '',
    recipients: [] as Array<{ phoneNumber: string; contactName?: string; variables?: Record<string, string> }>,
    fromPhoneNumberId: '',
    scheduleType: 'now' as 'now' | 'scheduled',
    scheduledAt: '',
  })

  const createBroadcast = useCreateBroadcast()
  const sendBroadcast = useSendBroadcast()

  // Fetch phone numbers with 10DLC campaign info
  const { data: phoneNumbers, isLoading: loadingPhones } = useQuery({
    queryKey: ['phone-numbers-for-broadcast'],
    queryFn: async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('phone_numbers')
        .select(`
          id,
          number,
          friendly_name,
          status,
          phone_number_campaigns (
            campaign_registry_campaigns (
              id,
              campaign_name,
              status,
              use_case
            )
          )
        `)
        .eq('status', 'active')
        .order('is_primary', { ascending: false })

      if (error) throw error
      return data as PhoneNumber[]
    },
  })

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep)

  const canProceed = useMemo(() => {
    switch (currentStep) {
      case 'details':
        return formData.name.trim().length >= 3
      case 'message':
        return formData.messageTemplate.trim().length >= 10
      case 'recipients':
        return formData.recipients.length > 0
      case 'phone':
        return !!formData.fromPhoneNumberId
      case 'schedule':
        return formData.scheduleType === 'now' || !!formData.scheduledAt
      case 'review':
        return true
      default:
        return false
    }
  }, [currentStep, formData])

  const selectedPhone = phoneNumbers?.find(p => p.id === formData.fromPhoneNumberId)
  const selectedCampaign = selectedPhone?.phone_number_campaigns?.[0]?.campaign_registry_campaigns?.[0]
  const has10DLCApproval = selectedCampaign?.status === 'approved'

  const handleNext = () => {
    const nextIndex = currentStepIndex + 1
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id)
    }
  }

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id)
    }
  }

  const handleSubmit = async (sendImmediately: boolean) => {
    try {
      const result = await createBroadcast.mutateAsync({
        name: formData.name,
        messageTemplate: formData.messageTemplate,
        fromPhoneNumberId: formData.fromPhoneNumberId,
        recipients: formData.recipients,
        scheduledAt: formData.scheduleType === 'scheduled' ? formData.scheduledAt : undefined,
      })

      if (sendImmediately && result.broadcast?.id) {
        await sendBroadcast.mutateAsync(result.broadcast.id)
      }

      onClose()
      router.push('/dashboard/broadcasts')
    } catch (error) {
      // Error handled by mutation
    }
  }

  // Character count and segment calculation
  const messageLength = formData.messageTemplate.length
  const segmentCount = messageLength <= 160 ? 1 : Math.ceil(messageLength / 153)

  // Template variable detection
  const templateVariables = formData.messageTemplate.match(/\{(\w+)\}/g) || []

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create SMS Broadcast</DialogTitle>
          <DialogDescription>
            Send a message to multiple recipients at once
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-6">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${
                  index <= currentStepIndex
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-muted-foreground/30 text-muted-foreground'
                }`}
              >
                {index < currentStepIndex ? (
                  <Check className="h-4 w-4" />
                ) : (
                  step.icon
                )}
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={`w-12 h-0.5 mx-1 ${
                    index < currentStepIndex ? 'bg-primary' : 'bg-muted-foreground/30'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className="min-h-[300px]">
          {/* Step 1: Details */}
          {currentStep === 'details' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Broadcast Name</Label>
                <Input
                  id="name"
                  placeholder="e.g., Holiday Sale Announcement"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  A descriptive name to identify this broadcast
                </p>
              </div>
            </div>
          )}

          {/* Step 2: Message */}
          {currentStep === 'message' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="message">Message Template</Label>
                <Textarea
                  id="message"
                  placeholder="Hi {name}, we have an exciting offer for you..."
                  value={formData.messageTemplate}
                  onChange={(e) => setFormData({ ...formData, messageTemplate: e.target.value })}
                  rows={6}
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{messageLength} characters</span>
                  <span>{segmentCount} segment{segmentCount > 1 ? 's' : ''}</span>
                </div>
              </div>

              {templateVariables.length > 0 && (
                <Alert>
                  <AlertDescription className="flex items-center gap-2 flex-wrap">
                    <span>Template variables:</span>
                    {templateVariables.map((v, i) => (
                      <Badge key={i} variant="secondary">{v}</Badge>
                    ))}
                  </AlertDescription>
                </Alert>
              )}

              <div className="text-xs text-muted-foreground space-y-1">
                <p>Supported variables: <code>{'{name}'}</code>, <code>{'{first_name}'}</code>, or custom variables</p>
                <p>SMS segments: 160 chars for first segment, 153 for additional segments</p>
              </div>
            </div>
          )}

          {/* Step 3: Recipients */}
          {currentStep === 'recipients' && (
            <RecipientSelector
              recipients={formData.recipients}
              onChange={(recipients) => setFormData({ ...formData, recipients })}
              templateVariables={templateVariables}
            />
          )}

          {/* Step 4: Phone Number */}
          {currentStep === 'phone' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Phone Number</Label>
                {loadingPhones ? (
                  <div className="text-center py-4 text-muted-foreground">Loading phone numbers...</div>
                ) : phoneNumbers?.length === 0 ? (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                      No active phone numbers available. Please add a phone number in Settings.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="grid gap-3">
                    {phoneNumbers?.map((phone) => {
                      const campaign = phone.phone_number_campaigns?.[0]?.campaign_registry_campaigns?.[0]
                      const isApproved = campaign?.status === 'approved'

                      return (
                        <Card
                          key={phone.id}
                          className={`cursor-pointer transition-colors ${
                            formData.fromPhoneNumberId === phone.id
                              ? 'border-primary bg-primary/5'
                              : 'hover:border-muted-foreground/50'
                          } ${!isApproved ? 'opacity-60' : ''}`}
                          onClick={() => isApproved && setFormData({ ...formData, fromPhoneNumberId: phone.id })}
                        >
                          <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                              <div className="space-y-1">
                                <div className="font-medium">
                                  {phone.friendly_name || phone.number}
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {phone.number}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {campaign ? (
                                  <Badge variant={isApproved ? 'default' : 'secondary'}>
                                    <Shield className="h-3 w-3 mr-1" />
                                    {campaign.status}
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive">
                                    No 10DLC Campaign
                                  </Badge>
                                )}
                                {formData.fromPhoneNumberId === phone.id && (
                                  <Check className="h-5 w-5 text-primary" />
                                )}
                              </div>
                            </div>
                            {campaign && !isApproved && (
                              <p className="text-xs text-amber-600 mt-2">
                                This number cannot be used for broadcasts until the 10DLC campaign is approved.
                              </p>
                            )}
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                )}
              </div>

              {selectedPhone && !has10DLCApproval && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    The selected phone number does not have an approved 10DLC campaign.
                    Broadcasts require 10DLC compliance. Please select a different number or
                    complete your 10DLC registration in Settings.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Step 5: Schedule */}
          {currentStep === 'schedule' && (
            <div className="space-y-4">
              <div className="space-y-4">
                <Label>When to send?</Label>
                <div className="grid grid-cols-2 gap-4">
                  <Card
                    className={`cursor-pointer transition-colors ${
                      formData.scheduleType === 'now'
                        ? 'border-primary bg-primary/5'
                        : 'hover:border-muted-foreground/50'
                    }`}
                    onClick={() => setFormData({ ...formData, scheduleType: 'now', scheduledAt: '' })}
                  >
                    <CardContent className="p-4 text-center">
                      <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <div className="font-medium">Send Now</div>
                      <p className="text-xs text-muted-foreground">Start sending immediately</p>
                    </CardContent>
                  </Card>
                  <Card
                    className={`cursor-pointer transition-colors ${
                      formData.scheduleType === 'scheduled'
                        ? 'border-primary bg-primary/5'
                        : 'hover:border-muted-foreground/50'
                    }`}
                    onClick={() => setFormData({ ...formData, scheduleType: 'scheduled' })}
                  >
                    <CardContent className="p-4 text-center">
                      <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                      <div className="font-medium">Schedule</div>
                      <p className="text-xs text-muted-foreground">Send at a specific time</p>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {formData.scheduleType === 'scheduled' && (
                <div className="space-y-2">
                  <Label htmlFor="scheduledAt">Schedule Date & Time</Label>
                  <Input
                    id="scheduledAt"
                    type="datetime-local"
                    value={formData.scheduledAt}
                    onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Step 6: Review */}
          {currentStep === 'review' && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Broadcast Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm text-muted-foreground">Name</div>
                      <div className="font-medium">{formData.name}</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Recipients</div>
                      <div className="font-medium">{formData.recipients.length} contacts</div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">From Number</div>
                      <div className="font-medium">
                        {selectedPhone?.friendly_name || selectedPhone?.number || 'Not selected'}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">Schedule</div>
                      <div className="font-medium">
                        {formData.scheduleType === 'now'
                          ? 'Send immediately'
                          : formData.scheduledAt
                            ? format(new Date(formData.scheduledAt), 'MMM d, yyyy h:mm a')
                            : 'Not set'}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Message Preview</div>
                    <div className="p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">
                      {formData.messageTemplate}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {messageLength} characters, {segmentCount} segment(s)
                    </div>
                  </div>

                  {selectedCampaign && (
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-green-600" />
                      <span className="text-sm">
                        10DLC Campaign: {selectedCampaign.campaign_name} ({selectedCampaign.status})
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Sending to {formData.recipients.length} recipients will use approximately{' '}
                  {formData.recipients.length * segmentCount} SMS segments from your plan.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {currentStepIndex > 0 && (
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {currentStep === 'review' ? (
              <>
                {formData.scheduleType === 'scheduled' ? (
                  <Button
                    onClick={() => handleSubmit(false)}
                    disabled={createBroadcast.isPending}
                  >
                    {createBroadcast.isPending ? 'Scheduling...' : 'Schedule Broadcast'}
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleSubmit(true)}
                    disabled={createBroadcast.isPending || sendBroadcast.isPending}
                  >
                    {createBroadcast.isPending || sendBroadcast.isPending
                      ? 'Creating...'
                      : 'Send Broadcast'}
                  </Button>
                )}
              </>
            ) : (
              <Button onClick={handleNext} disabled={!canProceed}>
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
