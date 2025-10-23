'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  MessageSquare,
  Plus,
  Loader2,
  CheckCircle,
  Clock,
  AlertTriangle,
  Info,
  Shield,
  Building
} from 'lucide-react'
import { toast } from 'sonner'

interface SMSCampaign {
  id: string
  campaignName: string
  brandId: string
  brandName: string
  useCase: string
  useCaseDescription: string
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'suspended'
  signalwireCampaignId?: string
  approvalDate?: string
  monthlyMessageVolume: number
  createdAt: string
  estimatedApprovalTime: string
  nextSteps: string[]
}

interface SMSBrand {
  id: string
  brandName: string
  status: string
}

const USE_CASES = [
  { value: 'customer_care', label: 'Customer Care', description: 'Customer support and service messages' },
  { value: 'account_notifications', label: 'Account Notifications', description: 'Account updates and alerts' },
  { value: 'delivery_notifications', label: 'Delivery Notifications', description: 'Shipping and delivery updates' },
  { value: 'appointment_reminders', label: 'Appointment Reminders', description: 'Appointment confirmations and reminders' },
  { value: 'marketing', label: 'Marketing', description: 'Promotional and marketing messages' },
  { value: 'two_factor_auth', label: 'Two-Factor Authentication', description: 'Security verification codes' },
  { value: 'alerts_notifications', label: 'Alerts & Notifications', description: 'System alerts and notifications' },
  { value: 'surveys_polls', label: 'Surveys & Polls', description: 'Customer feedback and surveys' },
  { value: 'mixed', label: 'Mixed', description: 'Multiple use cases combined' },
  { value: 'other', label: 'Other', description: 'Other business communications' }
]

const OPT_IN_FLOWS = [
  { value: 'web_form', label: 'Web Form', description: 'Users opt in via website form' },
  { value: 'mobile_app', label: 'Mobile App', description: 'Users opt in via mobile application' },
  { value: 'pos', label: 'Point of Sale', description: 'Users opt in at physical location' },
  { value: 'paper_form', label: 'Paper Form', description: 'Users fill out paper form' },
  { value: 'phone_call', label: 'Phone Call', description: 'Users opt in during phone conversation' },
  { value: 'retail_store', label: 'Retail Store', description: 'Users opt in at retail location' },
  { value: 'other', label: 'Other', description: 'Other opt-in method' }
]

export function SMSCampaignManagement() {
  const [campaigns, setCampaigns] = useState<SMSCampaign[]>([])
  const [brands, setBrands] = useState<SMSBrand[]>([])
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const [campaignData, setCampaignData] = useState({
    brandId: '',
    campaignName: '',
    useCase: '',
    useCaseDescription: '',
    messageSamples: ['', '', ''],
    optInKeywords: ['START', 'YES', 'JOIN'],
    optOutKeywords: ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'],
    helpKeywords: ['HELP', 'INFO'],
    helpMessage: 'Reply STOP to opt out, HELP for help',
    optInMessage: '',
    optOutMessage: 'You have been unsubscribed. No more messages will be sent.',
    monthlyMessageVolume: 1000,
    subscriberOptinFlow: '',
    subscriberOptinFlowDescription: '',
    ageGating: false,
    directLending: false,
    embeddedLink: false,
    embeddedPhone: false,
    affiliateMarketing: false
  })

  useEffect(() => {
    fetchCampaigns()
    fetchBrands()
  }, [])

  const fetchCampaigns = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/sms/campaigns')
      const data = await response.json()

      if (data.success) {
        setCampaigns(data.campaigns || [])
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      console.error('Error fetching SMS campaigns:', error)
      toast.error('Failed to load SMS campaigns')
    } finally {
      setLoading(false)
    }
  }

  const fetchBrands = async () => {
    try {
      const response = await fetch('/api/sms/brands')
      const data = await response.json()

      if (data.success) {
        // Only show approved brands
        const approvedBrands = data.brands?.filter((brand: SMSBrand) => brand.status === 'approved') || []
        setBrands(approvedBrands)
      }
    } catch (error) {
      console.error('Error fetching SMS brands:', error)
    }
  }

  const createCampaign = async () => {
    // Validate required fields
    if (!campaignData.brandId || !campaignData.campaignName || !campaignData.useCase ||
        !campaignData.useCaseDescription || !campaignData.subscriberOptinFlow ||
        !campaignData.subscriberOptinFlowDescription) {
      toast.error('Please fill in all required fields')
      return
    }

    // Validate message samples
    const validSamples = campaignData.messageSamples.filter(sample => sample.trim().length > 0)
    if (validSamples.length < 1) {
      toast.error('Please provide at least one message sample')
      return
    }

    try {
      setCreating(true)

      const response = await fetch('/api/sms/campaigns/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          ...campaignData,
          messageSamples: validSamples
        })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to create campaign')
      }

      toast.success(`SMS campaign "${campaignData.campaignName}" created successfully`)
      setCreateDialogOpen(false)
      await fetchCampaigns()
      
      // Reset form
      setCampaignData({
        brandId: '',
        campaignName: '',
        useCase: '',
        useCaseDescription: '',
        messageSamples: ['', '', ''],
        optInKeywords: ['START', 'YES', 'JOIN'],
        optOutKeywords: ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'],
        helpKeywords: ['HELP', 'INFO'],
        helpMessage: 'Reply STOP to opt out, HELP for help',
        optInMessage: '',
        optOutMessage: 'You have been unsubscribed. No more messages will be sent.',
        monthlyMessageVolume: 1000,
        subscriberOptinFlow: '',
        subscriberOptinFlowDescription: '',
        ageGating: false,
        directLending: false,
        embeddedLink: false,
        embeddedPhone: false,
        affiliateMarketing: false
      })
    } catch (error) {
      console.error('Error creating SMS campaign:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create SMS campaign')
    } finally {
      setCreating(false)
    }
  }

  const getStatusBadge = (campaign: SMSCampaign) => {
    switch (campaign.status) {
      case 'pending':
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-300">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        )
      case 'submitted':
        return (
          <Badge variant="outline" className="text-blue-600 border-blue-300">
            <Clock className="w-3 h-3 mr-1" />
            Under Review
          </Badge>
        )
      case 'approved':
        return (
          <Badge className="bg-green-100 text-green-700 border-green-300">
            <CheckCircle className="w-3 h-3 mr-1" />
            Approved
          </Badge>
        )
      case 'rejected':
        return (
          <Badge variant="outline" className="text-red-600 border-red-300">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Rejected
          </Badge>
        )
      case 'suspended':
        return (
          <Badge variant="outline" className="text-orange-600 border-orange-300">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Suspended
          </Badge>
        )
      default:
        return null
    }
  }

  const updateMessageSample = (index: number, value: string) => {
    const newSamples = [...campaignData.messageSamples]
    newSamples[index] = value
    setCampaignData({ ...campaignData, messageSamples: newSamples })
  }

  const addMessageSample = () => {
    if (campaignData.messageSamples.length < 5) {
      setCampaignData({ 
        ...campaignData, 
        messageSamples: [...campaignData.messageSamples, ''] 
      })
    }
  }

  const removeMessageSample = (index: number) => {
    if (campaignData.messageSamples.length > 1) {
      const newSamples = campaignData.messageSamples.filter((_, i) => i !== index)
      setCampaignData({ ...campaignData, messageSamples: newSamples })
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
      {/* Main Content */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>SMS Campaigns</CardTitle>
            <CardDescription>
              Create and manage SMS campaigns for your approved brands. Campaigns must be approved before sending messages.
            </CardDescription>
          </div>
          <Button 
            onClick={() => setCreateDialogOpen(true)}
            disabled={brands.length === 0}
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Campaign
          </Button>
        </CardHeader>
        <CardContent>
          {brands.length === 0 ? (
            <div className="text-center py-12">
              <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No approved brands</h3>
              <p className="text-gray-600 mb-4">
                You need at least one approved brand before creating SMS campaigns.
              </p>
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Create and get your brand approved first, then return here to create campaigns.
                </AlertDescription>
              </Alert>
            </div>
          ) : campaigns.length === 0 ? (
            <div className="text-center py-12">
              <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No SMS campaigns yet</h3>
              <p className="text-gray-600 mb-4">
                Create your first SMS campaign to start sending compliant messages.
              </p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Campaign
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {campaigns.map((campaign) => (
                <div key={campaign.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <MessageSquare className="h-8 w-8 text-gray-600" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{campaign.campaignName}</h3>
                          {getStatusBadge(campaign)}
                        </div>
                        <p className="text-sm text-gray-600">{campaign.brandName}</p>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                          <span>{USE_CASES.find(uc => uc.value === campaign.useCase)?.label}</span>
                          <span>•</span>
                          <span>{campaign.monthlyMessageVolume.toLocaleString()} msgs/month</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{campaign.estimatedApprovalTime}</div>
                      <div className="text-xs text-gray-600">
                        Created {new Date(campaign.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  
                  {campaign.nextSteps.length > 0 && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-md">
                      <h4 className="text-sm font-medium text-blue-900 mb-2">Next Steps:</h4>
                      <ul className="text-sm text-blue-800 space-y-1">
                        {campaign.nextSteps.map((step, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="text-blue-600 mt-0.5">•</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Campaign Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create SMS Campaign</DialogTitle>
            <DialogDescription>
              Create a new SMS campaign for 10DLC compliance. All campaigns must be approved before sending messages.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                Campaign information must accurately describe your messaging use case. 
                Misrepresentation may result in permanent rejection.
              </AlertDescription>
            </Alert>

            {/* Basic Information */}
            <div className="space-y-4">
              <h4 className="font-medium">Campaign Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="brandId">Select Brand *</Label>
                  <Select
                    value={campaignData.brandId}
                    onValueChange={(value) => setCampaignData({ ...campaignData, brandId: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select an approved brand" />
                    </SelectTrigger>
                    <SelectContent>
                      {brands.map((brand) => (
                        <SelectItem key={brand.id} value={brand.id}>
                          {brand.brandName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="campaignName">Campaign Name *</Label>
                  <Input
                    id="campaignName"
                    placeholder="e.g., Customer Support"
                    value={campaignData.campaignName}
                    onChange={(e) => setCampaignData({ ...campaignData, campaignName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="useCase">Use Case *</Label>
                  <Select
                    value={campaignData.useCase}
                    onValueChange={(value) => setCampaignData({ ...campaignData, useCase: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select use case" />
                    </SelectTrigger>
                    <SelectContent>
                      {USE_CASES.map((useCase) => (
                        <SelectItem key={useCase.value} value={useCase.value}>
                          <div>
                            <div className="font-medium">{useCase.label}</div>
                            <div className="text-xs text-gray-500">{useCase.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="monthlyVolume">Monthly Message Volume *</Label>
                  <Select
                    value={campaignData.monthlyMessageVolume.toString()}
                    onValueChange={(value) => setCampaignData({ ...campaignData, monthlyMessageVolume: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1000">1,000 messages/month</SelectItem>
                      <SelectItem value="5000">5,000 messages/month</SelectItem>
                      <SelectItem value="10000">10,000 messages/month</SelectItem>
                      <SelectItem value="25000">25,000 messages/month</SelectItem>
                      <SelectItem value="50000">50,000 messages/month</SelectItem>
                      <SelectItem value="100000">100,000 messages/month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="useCaseDescription">Use Case Description *</Label>
                <Textarea
                  id="useCaseDescription"
                  placeholder="Describe how you will use SMS messaging..."
                  value={campaignData.useCaseDescription}
                  onChange={(e) => setCampaignData({ ...campaignData, useCaseDescription: e.target.value })}
                  rows={3}
                />
              </div>
            </div>

            {/* Message Samples */}
            <div className="space-y-4">
              <h4 className="font-medium">Message Samples *</h4>
              <p className="text-sm text-gray-600">
                Provide 1-5 sample messages that represent the types of messages you will send.
              </p>
              {campaignData.messageSamples.map((sample, index) => (
                <div key={index} className="flex gap-2">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor={`sample-${index}`}>Sample {index + 1}</Label>
                    <Textarea
                      id={`sample-${index}`}
                      placeholder={`Message sample ${index + 1}...`}
                      value={sample}
                      onChange={(e) => updateMessageSample(index, e.target.value)}
                      rows={2}
                    />
                  </div>
                  {campaignData.messageSamples.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeMessageSample(index)}
                      className="mt-7"
                    >
                      Remove
                    </Button>
                  )}
                </div>
              ))}
              {campaignData.messageSamples.length < 5 && (
                <Button variant="outline" onClick={addMessageSample}>
                  Add Another Sample
                </Button>
              )}
            </div>

            {/* Opt-in/Opt-out Configuration */}
            <div className="space-y-4">
              <h4 className="font-medium">Subscriber Opt-in Process *</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="optinFlow">Opt-in Method *</Label>
                  <Select
                    value={campaignData.subscriberOptinFlow}
                    onValueChange={(value) => setCampaignData({ ...campaignData, subscriberOptinFlow: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select opt-in method" />
                    </SelectTrigger>
                    <SelectContent>
                      {OPT_IN_FLOWS.map((flow) => (
                        <SelectItem key={flow.value} value={flow.value}>
                          <div>
                            <div className="font-medium">{flow.label}</div>
                            <div className="text-xs text-gray-500">{flow.description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="optinMessage">Opt-in Confirmation Message</Label>
                  <Input
                    id="optinMessage"
                    placeholder="Welcome! Reply STOP to opt out."
                    value={campaignData.optInMessage}
                    onChange={(e) => setCampaignData({ ...campaignData, optInMessage: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="optinDescription">Opt-in Process Description *</Label>
                <Textarea
                  id="optinDescription"
                  placeholder="Describe how users will opt into receiving messages..."
                  value={campaignData.subscriberOptinFlowDescription}
                  onChange={(e) => setCampaignData({ ...campaignData, subscriberOptinFlowDescription: e.target.value })}
                  rows={2}
                />
              </div>
            </div>

            {/* Compliance Options */}
            <div className="space-y-4">
              <h4 className="font-medium">Compliance Settings</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="ageGating"
                      checked={campaignData.ageGating}
                      onCheckedChange={(checked) => setCampaignData({ ...campaignData, ageGating: !!checked })}
                    />
                    <Label htmlFor="ageGating">Age Gating (18+ verification)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="directLending"
                      checked={campaignData.directLending}
                      onCheckedChange={(checked) => setCampaignData({ ...campaignData, directLending: !!checked })}
                    />
                    <Label htmlFor="directLending">Direct Lending/Loans</Label>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="embeddedLink"
                      checked={campaignData.embeddedLink}
                      onCheckedChange={(checked) => setCampaignData({ ...campaignData, embeddedLink: !!checked })}
                    />
                    <Label htmlFor="embeddedLink">Messages contain links</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="embeddedPhone"
                      checked={campaignData.embeddedPhone}
                      onCheckedChange={(checked) => setCampaignData({ ...campaignData, embeddedPhone: !!checked })}
                    />
                    <Label htmlFor="embeddedPhone">Messages contain phone numbers</Label>
                  </div>
                </div>
              </div>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Review Process:</strong> Campaign approval times vary by use case. 
                Marketing campaigns typically take longer (5-10 business days) while customer care 
                campaigns are usually approved faster (1-3 business days).
              </AlertDescription>
            </Alert>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={createCampaign} disabled={creating}>
                {creating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <MessageSquare className="w-4 h-4 mr-2" />
                )}
                Create Campaign
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}