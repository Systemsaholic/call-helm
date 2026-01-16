'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import {
  Phone,
  Plus,
  Search,
  Settings,
  CheckCircle,
  Clock,
  AlertTriangle,
  Loader2,
  ArrowRight,
  DollarSign,
  MessageSquare,
  Shield,
  Webhook,
  Edit,
  Save,
  X,
  Lock,
  Timer,
  Zap
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/hooks/useAuth'
import { useBilling } from '@/lib/hooks/useBilling'
import { validatePhone } from '@/lib/utils/phone'
import { NumberSearchDialog } from './NumberSearchDialog'
import { NumberPortingDialog } from './NumberPortingDialog'
import { NumberVerification } from './NumberVerification'
import { SMSBrandManagement } from './SMSBrandManagement'
import { SMSCampaignManagement } from './SMSCampaignManagement'

interface PhoneNumber {
  id: string
  number: string
  friendlyName: string
  capabilities: {
    voice: boolean
    sms: boolean
    mms: boolean
  }
  status: 'active' | 'pending' | 'inactive' | 'grace_period' | 'released'
  numberType: 'purchased' | 'ported' | 'trial' | 'verified_caller_id'
  numberSource: 'platform' | 'verified' | 'imported'
  acquisitionMethod: 'platform' | 'ported' | 'verified'
  verificationStatus: 'pending' | 'verified' | 'failed'
  portingStatus?: string
  webhookConfigured: boolean
  monthlyCost: number
  setupCost?: number
  campaignCount?: number
  isPrimary: boolean
  forwardingEnabled?: boolean
  forwardingDestination?: string
  gracePeriodEndsAt?: string
}

interface WebhookStatus {
  total: number
  configured: number
  needsConfiguration: number
  missingSignalWireSid: number
}

export function PhoneNumberManagement() {
  const { supabase } = useAuth()
  const { limits } = useBilling()

  // Trial users can only authenticate/verify existing numbers they own
  // Paid users can port numbers or purchase new ones from the platform
  const isPaidSubscription = limits?.subscription_status === 'active' || limits?.subscription_status === 'past_due'
  const [verifyDialogOpen, setVerifyDialogOpen] = useState(false)
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([])
  const [webhookStatus, setWebhookStatus] = useState<WebhookStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [configuring, setConfiguring] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [searchDialogOpen, setSearchDialogOpen] = useState(false)
  const [portingDialogOpen, setPortingDialogOpen] = useState(false)
  const [editingForwarding, setEditingForwarding] = useState<string | null>(null)
  const [forwardingValues, setForwardingValues] = useState<Record<string, string>>({})

  useEffect(() => {
    fetchPhoneNumbers()
    fetchWebhookStatus()
  }, [])

  const fetchPhoneNumbers = async () => {
    try {
      // Get user's organization
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!member) return

      // Get organization phone numbers directly from table
      const { data, error } = await supabase
        .from('phone_numbers')
        .select(`
          id,
          number,
          friendly_name,
          capabilities,
          status,
          number_type,
          number_source,
          acquisition_method,
          verification_status,
          porting_status,
          webhook_configured,
          is_primary,
          created_at,
          updated_at,
          forwarding_enabled,
          forwarding_destination,
          monthly_cost,
          setup_cost,
          grace_period_ends_at
        `)
        .eq('organization_id', member.organization_id)
        .neq('status', 'released') // Don't show released numbers
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) throw error

      // Transform data to match interface
      const transformedData: PhoneNumber[] = (data || []).map(row => {
        // Verified/imported numbers (user-owned) have no platform fee
        const isUserOwned = row.number_source === 'verified' || row.number_source === 'imported'
        const monthlyCost = isUserOwned ? 0 : (row.monthly_cost ?? 1.50)

        return {
          id: row.id,
          number: row.number,
          friendlyName: row.friendly_name || row.number,
          capabilities: row.capabilities || { voice: true, sms: true, mms: false },
          status: row.status as PhoneNumber['status'],
          numberType: row.number_type || 'purchased',
          numberSource: row.number_source || 'platform',
          acquisitionMethod: row.acquisition_method || 'platform',
          verificationStatus: row.verification_status || 'verified',
          portingStatus: row.porting_status,
          webhookConfigured: row.webhook_configured || false,
          monthlyCost,
          setupCost: row.setup_cost || 0,
          campaignCount: 0, // Will need to fetch separately if needed
          isPrimary: row.is_primary || false,
          forwardingEnabled: row.forwarding_enabled || false,
          forwardingDestination: row.forwarding_destination,
          gracePeriodEndsAt: row.grace_period_ends_at
        }
      })

      setPhoneNumbers(transformedData)
    } catch (error) {
      console.error('Error fetching phone numbers:', error)
      toast.error('Failed to load phone numbers')
    } finally {
      setLoading(false)
    }
  }

  const fetchWebhookStatus = async () => {
    try {
      const response = await fetch('/api/voice/numbers/configure-webhooks')
      const data = await response.json()
      
      if (data.success) {
        setWebhookStatus(data.summary)
      }
    } catch (error) {
      console.error('Error fetching webhook status:', error)
    }
  }

  const configureAllWebhooks = async () => {
    try {
      setConfiguring(true)
      
      const numberIds = phoneNumbers
        .filter(n => !n.webhookConfigured && n.acquisitionMethod !== 'verified')
        .map(n => n.id)

      if (numberIds.length === 0) {
        toast.info('All eligible numbers already have webhooks configured')
        return
      }

      const response = await fetch('/api/voice/numbers/configure-webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numberIds })
      })

      const data = await response.json()

      if (data.success) {
        if (data.successful > 0) {
          toast.success(`Configured webhooks for ${data.successful} numbers`)
        }
        if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
          console.error('Webhook configuration errors:', data.errors)
          const missingSignalWireErrors = data.errors.filter((e: any) => 
            e.error && e.error.includes('not found or not configured with SignalWire')
          )
          
          if (missingSignalWireErrors.length > 0) {
            toast.error(`${missingSignalWireErrors.length} numbers are missing SignalWire integration. They need to be purchased or re-synchronized with SignalWire.`)
          } else {
            toast.warning(`${data.failed} numbers had configuration errors`)
          }
        }
        
        if (data.successful === 0 && data.errors && data.errors.length > 0) {
          toast.error('No webhooks were configured. Check that numbers are properly integrated with SignalWire.')
        }
        
        await fetchPhoneNumbers()
        await fetchWebhookStatus()
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      console.error('Error configuring webhooks:', error)
      toast.error('Failed to configure webhooks')
    } finally {
      setConfiguring(false)
    }
  }

  const syncWithSignalWire = async () => {
    try {
      setSyncing(true)
      
      const response = await fetch('/api/voice/numbers/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      })

      const data = await response.json()

      if (data.success) {
        if (data.successful > 0) {
          toast.success(`Synchronized ${data.successful} phone numbers with SignalWire`)
        } else {
          toast.info(data.message || 'No phone numbers needed synchronization')
        }
        
        if (data.errors.length > 0) {
          console.error('Sync errors:', data.errors)
          toast.warning(`${data.failed} numbers could not be synchronized`)
        }
        
        await fetchPhoneNumbers()
        await fetchWebhookStatus()
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      console.error('Error syncing with SignalWire:', error)
      toast.error('Failed to sync with SignalWire')
    } finally {
      setSyncing(false)
    }
  }

  // Helper function to calculate days remaining until grace period ends
  const getDaysRemaining = (gracePeriodEndsAt: string): number => {
    const endDate = new Date(gracePeriodEndsAt)
    const now = new Date()
    const diffTime = endDate.getTime() - now.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return Math.max(0, diffDays)
  }

  const getStatusBadge = (phoneNumber: PhoneNumber) => {
    // Grace period status - highest priority
    if (phoneNumber.status === 'grace_period') {
      const daysRemaining = phoneNumber.gracePeriodEndsAt
        ? getDaysRemaining(phoneNumber.gracePeriodEndsAt)
        : 0
      return (
        <Badge className="bg-amber-100 text-amber-700 border-amber-300">
          <Timer className="w-3 h-3 mr-1" />
          {daysRemaining <= 7
            ? `${daysRemaining} days left`
            : 'Grace Period'}
        </Badge>
      )
    }

    if (phoneNumber.status === 'pending') {
      return (
        <Badge variant="outline" className="text-yellow-600 border-yellow-300">
          <Clock className="w-3 h-3 mr-1" />
          {phoneNumber.acquisitionMethod === 'ported' ? 'Porting' : 'Pending'}
        </Badge>
      )
    }

    if (phoneNumber.status === 'active' && phoneNumber.verificationStatus === 'verified') {
      return (
        <Badge className="bg-green-100 text-green-700 border-green-300">
          <CheckCircle className="w-3 h-3 mr-1" />
          Active
        </Badge>
      )
    }

    return (
      <Badge variant="outline" className="text-red-600 border-red-300">
        <AlertTriangle className="w-3 h-3 mr-1" />
        Needs Setup
      </Badge>
    )
  }

  const getNumberTypeBadge = (numberType: PhoneNumber['numberType']) => {
    switch (numberType) {
      case 'trial':
        return (
          <Badge variant="outline" className="text-purple-600 border-purple-300 text-xs">
            <Zap className="w-3 h-3 mr-1" />
            Trial
          </Badge>
        )
      case 'verified_caller_id':
        return (
          <Badge variant="outline" className="text-blue-600 border-blue-300 text-xs">
            <Shield className="w-3 h-3 mr-1" />
            Caller ID Only
          </Badge>
        )
      case 'ported':
        return (
          <Badge variant="outline" className="text-green-600 border-green-300 text-xs">
            Ported
          </Badge>
        )
      default:
        return null
    }
  }

  const getCapabilityBadges = (capabilities: PhoneNumber['capabilities']) => {
    const badges = []
    if (capabilities.voice) badges.push('Voice')
    if (capabilities.sms) badges.push('SMS')
    if (capabilities.mms) badges.push('MMS')
    return badges
  }

  // Calculate billable phone numbers and costs
  const platformNumbers = phoneNumbers.filter(n => n.numberSource === 'platform')
  const userOwnedNumbers = phoneNumbers.filter(n => n.numberSource === 'verified' || n.numberSource === 'imported')
  const includedInPlan = limits?.max_phone_numbers || 0
  const billableCount = Math.max(0, platformNumbers.length - includedInPlan)
  const totalMonthlyCost = billableCount * 1.50 // Only charge for numbers beyond plan limit

  // Helper to check if a specific platform number is billable
  const isNumberBillable = (number: PhoneNumber, index: number): boolean => {
    if (number.numberSource !== 'platform') return false
    return index >= includedInPlan
  }

  const handleEditForwarding = (phoneNumberId: string, currentDestination: string) => {
    setEditingForwarding(phoneNumberId)
    setForwardingValues({ 
      ...forwardingValues, 
      [phoneNumberId]: currentDestination || '' 
    })
  }

  const handleCancelEditForwarding = () => {
    setEditingForwarding(null)
    setForwardingValues({})
  }

  const handleSaveForwarding = async (phoneNumberId: string) => {
    const newDestination = forwardingValues[phoneNumberId]
    
    if (!newDestination?.trim()) {
      toast.error('Please enter a valid forwarding destination')
      return
    }

    // Validate the phone number format
    const validation = validatePhone(newDestination.trim())
    if (!validation.isValid) {
      toast.error(validation.errors.join(', '))
      return
    }

    try {
      const response = await fetch('/api/voice/numbers/update-forwarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumberId,
          forwardingDestination: newDestination.trim(),
          forwardingEnabled: true
        })
      })

      const data = await response.json()

      if (data.success) {
        toast.success('Forwarding destination updated successfully')
        setEditingForwarding(null)
        setForwardingValues({})
        await fetchPhoneNumbers()
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      console.error('Error updating forwarding destination:', error)
      toast.error('Failed to update forwarding destination')
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
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Total Numbers</span>
            </div>
            <div className="text-2xl font-bold mt-1">{phoneNumbers.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Active Numbers</span>
            </div>
            <div className="text-2xl font-bold mt-1">
              {phoneNumbers.filter(n => n.status === 'active').length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-600" />
              <span className="text-sm font-medium">Monthly Cost</span>
            </div>
            <div className="text-2xl font-bold mt-1">
              {totalMonthlyCost > 0 ? `$${totalMonthlyCost.toFixed(2)}` : '$0.00'}
            </div>
            <div className="text-xs text-gray-500 mt-1 space-y-0.5">
              {includedInPlan > 0 && platformNumbers.length > 0 && (
                <div>{Math.min(platformNumbers.length, includedInPlan)} number(s) included in plan</div>
              )}
              {billableCount > 0 && (
                <div>{billableCount} additional @ $1.50/mo</div>
              )}
              {userOwnedNumbers.length > 0 && (
                <div>{userOwnedNumbers.length} your own number(s)</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-blue-600" />
              <span className="text-sm font-medium">Configured</span>
            </div>
            <div className="text-2xl font-bold mt-1">
              {webhookStatus ? `${webhookStatus.configured}/${webhookStatus.total}` : '--'}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SignalWire Sync Alert */}
      {webhookStatus && webhookStatus.missingSignalWireSid > 0 && (
        <Alert>
          <Webhook className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>
              {webhookStatus.missingSignalWireSid} numbers need to be synchronized with SignalWire before webhooks can be configured.
            </span>
            <Button
              onClick={syncWithSignalWire}
              disabled={syncing}
              size="sm"
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4 mr-2" />
              )}
              Sync with SignalWire
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Webhook configuration is now automatic - no user-facing alert needed */}

      {/* Main Content Tabs */}
      <Tabs defaultValue="numbers" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="numbers">Phone Numbers</TabsTrigger>
          <TabsTrigger value="brands">SMS Brands</TabsTrigger>
          <TabsTrigger value="campaigns">SMS Campaigns</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Phone Numbers Tab */}
        <TabsContent value="numbers" className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div>
                <CardTitle>Phone Numbers</CardTitle>
                <CardDescription>
                  {limits?.max_phone_numbers ? (
                    <span>
                      Using {phoneNumbers.length} of {limits.max_phone_numbers >= 999 ? '100+' : limits.max_phone_numbers} included numbers
                      {limits.max_phone_numbers < 999 && phoneNumbers.length > limits.max_phone_numbers && (
                        <span className="text-amber-600 ml-1">
                          ({phoneNumbers.length - limits.max_phone_numbers} additional at $2.50/mo each)
                        </span>
                      )}
                    </span>
                  ) : (
                    'Manage your organization\'s phone numbers'
                  )}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {/* Verify Number - Available to all users */}
                <Button
                  variant="outline"
                  onClick={() => setVerifyDialogOpen(true)}
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Verify Number
                </Button>
                {/* Port Number - Paid users only */}
                {isPaidSubscription ? (
                  <Button
                    variant="outline"
                    onClick={() => setPortingDialogOpen(true)}
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Port Number
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    disabled
                    className="cursor-not-allowed"
                    title="Upgrade to a paid plan to port numbers"
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    Port Number
                  </Button>
                )}
                {/* Get New Number - Paid users only */}
                {isPaidSubscription ? (
                  <Button
                    onClick={() => setSearchDialogOpen(true)}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Get New Number
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    disabled
                    className="cursor-not-allowed"
                    title="Upgrade to a paid plan to purchase new numbers"
                  >
                    <Lock className="w-4 h-4 mr-2" />
                    Get New Number
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {/* Grace Period Warning Alert */}
              {phoneNumbers.some(n => n.status === 'grace_period') && (
                <Alert className="mb-4 border-amber-300 bg-amber-50">
                  <Timer className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="flex items-center justify-between">
                    <div className="text-amber-800">
                      <span className="font-medium">Trial ended - </span>
                      {(() => {
                        const gracePeriodNumbers = phoneNumbers.filter(n => n.status === 'grace_period')
                        const minDays = Math.min(...gracePeriodNumbers.map(n =>
                          n.gracePeriodEndsAt ? getDaysRemaining(n.gracePeriodEndsAt) : 30
                        ))
                        return (
                          <span>
                            Your {gracePeriodNumbers.length > 1 ? 'numbers are' : 'number is'} reserved for {minDays} more days.
                            Outbound calls and SMS are disabled. Upgrade to keep {gracePeriodNumbers.length > 1 ? 'your numbers' : 'your number'} and restore full functionality.
                          </span>
                        )
                      })()}
                    </div>
                    <Button
                      size="sm"
                      className="ml-4 bg-amber-600 hover:bg-amber-700"
                      onClick={() => window.location.href = '/dashboard/billing'}
                    >
                      Upgrade Now
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {/* Show overage warning if applicable */}
              {limits?.max_phone_numbers && limits.max_phone_numbers < 999 && phoneNumbers.length > limits.max_phone_numbers && (
                <Alert className="mb-4 border-amber-200 bg-amber-50">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-800">
                    You have {phoneNumbers.length - limits.max_phone_numbers} additional number{phoneNumbers.length - limits.max_phone_numbers > 1 ? 's' : ''} beyond your plan's included {limits.max_phone_numbers}.
                    These will be billed at $2.50/month each. Consider upgrading your plan for more included numbers.
                  </AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-4">
                {phoneNumbers.length === 0 ? (
                  <div className="text-center py-12">
                    <Phone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No phone numbers yet</h3>
                    <p className="text-gray-600 mb-4">
                      {isPaidSubscription
                        ? 'Get started by purchasing a new number, porting an existing one, or verifying a number you own.'
                        : 'Get started by verifying a phone number you own to enable SMS capabilities.'}
                    </p>
                    <div className="flex flex-wrap justify-center gap-3">
                      {/* Verify Number - Always available */}
                      <Button onClick={() => setVerifyDialogOpen(true)}>
                        <Shield className="w-4 h-4 mr-2" />
                        Verify Your Number
                      </Button>
                      {/* Paid features */}
                      {isPaidSubscription ? (
                        <>
                          <Button variant="outline" onClick={() => setPortingDialogOpen(true)}>
                            <ArrowRight className="w-4 h-4 mr-2" />
                            Port Existing Number
                          </Button>
                          <Button variant="outline" onClick={() => setSearchDialogOpen(true)}>
                            <Plus className="w-4 h-4 mr-2" />
                            Get New Number
                          </Button>
                        </>
                      ) : (
                        <div className="w-full mt-4 p-4 bg-gray-50 rounded-lg">
                          <p className="text-sm text-gray-600 mb-2">
                            <Lock className="w-4 h-4 inline mr-1" />
                            Upgrade to a paid plan to unlock:
                          </p>
                          <ul className="text-sm text-gray-500 space-y-1">
                            <li>• Port your existing business numbers</li>
                            <li>• Purchase new phone numbers from our platform</li>
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  phoneNumbers.map((number) => (
                    <div key={number.id} className="border rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <Phone className="h-8 w-8 text-gray-600" />
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-medium">{number.number}</h3>
                              {number.isPrimary && (
                                <Badge className="bg-blue-100 text-blue-700">Primary</Badge>
                              )}
                              {getStatusBadge(number)}
                              {getNumberTypeBadge(number.numberType)}
                            </div>
                            <p className="text-sm text-gray-600">{number.friendlyName}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {getCapabilityBadges(number.capabilities).map((capability) => (
                                <Badge key={capability} variant="secondary" className="text-xs">
                                  {capability}
                                </Badge>
                              ))}
                            </div>
                            {number.forwardingEnabled && number.forwardingDestination && (
                              <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                                <ArrowRight className="w-3 h-3" />
                                {editingForwarding === number.id ? (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="text"
                                      value={forwardingValues[number.id] || ''}
                                      onChange={(e) => setForwardingValues({
                                        ...forwardingValues,
                                        [number.id]: e.target.value
                                      })}
                                      placeholder="Enter phone number"
                                      className="h-6 text-xs w-32"
                                    />
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0"
                                      onClick={() => handleSaveForwarding(number.id)}
                                    >
                                      <Save className="w-3 h-3" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0"
                                      onClick={handleCancelEditForwarding}
                                    >
                                      <X className="w-3 h-3" />
                                    </Button>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-1">
                                    <span>Forwards to {number.forwardingDestination}</span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0"
                                      onClick={() => handleEditForwarding(number.id, number.forwardingDestination || '')}
                                    >
                                      <Edit className="w-3 h-3" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          {number.numberSource === 'platform' ? (
                            // Platform numbers: check if within plan limit
                            platformNumbers.indexOf(number) < includedInPlan ? (
                              <div className="text-sm font-medium text-green-600">Included</div>
                            ) : (
                              <div className="text-sm font-medium">$1.50/month</div>
                            )
                          ) : (
                            <div className="text-sm font-medium text-green-600">Your Number</div>
                          )}
                          <div className="text-xs text-gray-600">
                            {number.numberSource === 'platform' && (
                              platformNumbers.indexOf(number) < includedInPlan
                                ? 'In your plan'
                                : 'Additional number'
                            )}
                            {number.numberSource === 'verified' && 'Verified Business Line'}
                            {number.numberSource === 'imported' && 'Imported Number'}
                          </div>
                          {(number.campaignCount || 0) > 0 && (
                            <div className="text-xs text-blue-600 mt-1">
                              <MessageSquare className="w-3 h-3 inline mr-1" />
                              {number.campaignCount} campaigns
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {number.portingStatus && number.portingStatus !== 'completed' && (
                        <div className="mt-3 p-3 bg-blue-50 rounded-md">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-900">
                              Porting Status: {number.portingStatus}
                            </span>
                          </div>
                          <Progress value={getPortingProgress(number.portingStatus)} className="mt-2" />
                        </div>
                      )}
                      
{/* Webhook configuration is now automatic - no user-facing warning needed */}

                      {/* Grace Period Warning for individual number */}
                      {number.status === 'grace_period' && number.gracePeriodEndsAt && (
                        <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Timer className="w-4 h-4 text-amber-600" />
                              <div className="text-sm text-amber-800">
                                <span className="font-medium">Receive-only mode</span>
                                <span className="text-amber-700">
                                  {' '}— This number will be released on{' '}
                                  {new Date(number.gracePeriodEndsAt).toLocaleDateString('en-US', {
                                    month: 'long',
                                    day: 'numeric',
                                    year: 'numeric'
                                  })}
                                </span>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              className="bg-amber-600 hover:bg-amber-700"
                              onClick={() => window.location.href = '/dashboard/billing'}
                            >
                              Keep Number
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SMS Brands Tab */}
        <TabsContent value="brands">
          <SMSBrandManagement />
        </TabsContent>

        {/* SMS Campaigns Tab */}
        <TabsContent value="campaigns">
          <SMSCampaignManagement />
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Phone Number Settings</CardTitle>
              <CardDescription>Configuration for your phone numbers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Alert>
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    All phone numbers are automatically configured with secure webhooks and proper routing for your organization.
                  </AlertDescription>
                </Alert>

                <div className="text-sm text-gray-600">
                  <p>Your phone numbers are ready to use. Key features:</p>
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Secure webhook endpoints for calls and SMS</li>
                    <li>Automatic routing to your organization</li>
                    <li>Real-time message delivery</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <NumberSearchDialog
        open={searchDialogOpen}
        onOpenChange={setSearchDialogOpen}
        onNumberPurchased={fetchPhoneNumbers}
      />

      <NumberPortingDialog
        open={portingDialogOpen}
        onOpenChange={setPortingDialogOpen}
        onPortingSubmitted={fetchPhoneNumbers}
      />

      {/* Number Verification Dialog */}
      <Dialog open={verifyDialogOpen} onOpenChange={setVerifyDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Verify Your Phone Number</DialogTitle>
            <DialogDescription>
              Verify a phone number you own to enable SMS capabilities on your trial account.
            </DialogDescription>
          </DialogHeader>
          <NumberVerification
            onComplete={async () => {
              setVerifyDialogOpen(false)
              await fetchPhoneNumbers()
              // Auto-configure webhooks in the background
              try {
                await fetch('/api/voice/numbers/configure-webhooks')
              } catch (e) {
                console.error('Failed to auto-configure webhooks:', e)
              }
              toast.success('Phone number verified! You can now send and receive SMS.')
            }}
            onBack={() => setVerifyDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

function getPortingProgress(status: string): number {
  switch (status) {
    case 'pending': return 20
    case 'submitted': return 40
    case 'in_progress': return 70
    case 'completed': return 100
    default: return 0
  }
}