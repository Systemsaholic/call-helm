'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { useBilling } from '@/lib/hooks/useBilling'
import { useStripe } from '@/lib/hooks/useStripe'
import { useStripePrices } from '@/lib/hooks/useStripePrices'
import { useConfirmation } from '@/lib/hooks/useConfirmation'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { EnterpriseContactDialog } from './EnterpriseContactDialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'
import {
  Check,
  X,
  AlertCircle,
  CreditCard,
  Users,
  Phone,
  MessageSquare,
  HardDrive,
  TrendingUp,
  Zap,
  Crown,
  ChevronRight,
  Clock,
  Activity,
  Smartphone,
  Brain,
  Mic,
  ExternalLink,
  Loader2,
  DollarSign,
  AlertTriangle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Helper to get limit values from plan - check direct columns first, then features JSONB
const getPlanLimit = (plan: any, key: string, defaultValue: number = 0): number => {
  // Check direct column first (e.g., plan.max_agents)
  if (plan?.[key] !== undefined && plan?.[key] !== null) {
    return plan[key]
  }
  // Fallback to features JSONB
  return plan?.features?.[key] ?? defaultValue
}

// Helper to check boolean feature flags
const hasPlanFeature = (plan: any, key: string): boolean => {
  // Check has_* columns first (e.g., has_white_label, has_api_access)
  const hasKey = `has_${key}`
  if (plan?.[hasKey] !== undefined) {
    return !!plan[hasKey]
  }
  // Then check direct column
  if (plan?.[key] !== undefined) {
    return !!plan[key]
  }
  // Finally check features JSONB
  return !!plan?.features?.[key]
}

// Overage pricing (must match Stripe metered prices)
const OVERAGE_PRICES = {
  phone_numbers: { price: 2.50, unit: 'number', label: 'Phone Numbers' },
  agents: { price: 15.00, unit: 'agent', label: 'Agents' },
  call_minutes: { price: 0.025, unit: 'minute', label: 'Call Minutes' },
  sms_messages: { price: 0.02, unit: 'message', label: 'SMS Messages' },
  ai_tokens: { price: 0.00015, unit: 'token', label: 'AI Tokens' },
  transcription_minutes: { price: 0.003, unit: 'minute', label: 'Transcription' },
  ai_analysis: { price: 0.05, unit: 'analysis', label: 'AI Analysis' },
}

// Calculate overage for a resource
interface OverageItem {
  key: string
  label: string
  used: number
  limit: number
  overage: number
  price: number
  cost: number
  unit: string
}

const calculateOverages = (limits: any): OverageItem[] => {
  if (!limits) return []

  const overages: OverageItem[] = []

  // Check each resource for overage (skip unlimited limits >= 999999)
  const resources = [
    { key: 'agents', used: limits.current_agents, limit: limits.max_agents },
    { key: 'phone_numbers', used: limits.current_phone_numbers, limit: limits.max_phone_numbers },
    { key: 'call_minutes', used: limits.used_call_minutes, limit: limits.max_call_minutes },
    { key: 'sms_messages', used: limits.used_sms_messages, limit: limits.max_sms_messages },
    { key: 'ai_tokens', used: limits.used_ai_tokens, limit: limits.max_ai_tokens_per_month },
    { key: 'transcription_minutes', used: limits.used_transcription_minutes, limit: limits.max_transcription_minutes_per_month },
    { key: 'ai_analysis', used: limits.used_ai_analysis, limit: limits.max_ai_analysis_per_month },
  ]

  for (const resource of resources) {
    const pricing = OVERAGE_PRICES[resource.key as keyof typeof OVERAGE_PRICES]
    if (!pricing) continue

    const used = resource.used || 0
    const limit = resource.limit || 0

    // Skip unlimited resources
    if (limit >= 999999) continue

    const overage = Math.max(0, used - limit)
    if (overage > 0) {
      overages.push({
        key: resource.key,
        label: pricing.label,
        used,
        limit,
        overage,
        price: pricing.price,
        cost: overage * pricing.price,
        unit: pricing.unit,
      })
    }
  }

  return overages
}

export function BillingDashboard() {
  const {
    plans,
    limits,
    trialDaysRemaining,
    isLoading,
    formatUsage,
    getUsageClass,
    showUpgradePrompt,
    refetchLimits
  } = useBilling()

  const { createCheckout, openBillingPortal, isCheckoutLoading, isPortalLoading } = useStripe()
  const { byPlan: stripePrices, isLoading: stripePricesLoading, formatPrice } = useStripePrices()
  const searchParams = useSearchParams()

  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [enterpriseDialogOpen, setEnterpriseDialogOpen] = useState(false)
  const confirmation = useConfirmation()
  const [selectedPlan, setSelectedPlan] = useState<any>(null)

  // Handle success/cancel URL params from Stripe redirect
  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast.success('Subscription updated successfully!')
      refetchLimits()
    } else if (searchParams.get('canceled') === 'true') {
      toast.info('Checkout was canceled')
    }
  }, [searchParams, refetchLimits])

  if (isLoading || stripePricesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  const currentPlan = plans?.find(p => p.slug === limits?.plan_slug)

  // Calculate savings for yearly
  const calculateSavings = (monthly: number, yearly: number) => {
    const yearlyEquivalent = monthly * 12
    return Math.round(((yearlyEquivalent - yearly) / yearlyEquivalent) * 100)
  }

  // Handle plan change - now uses real Stripe checkout
  const handlePlanChange = (plan: any, isDowngrade: boolean) => {
    // Use Stripe prices as source of truth, fallback to database prices
    const planStripePricing = stripePrices[plan.slug]
    const price = billingPeriod === 'monthly'
      ? (planStripePricing?.monthly ?? plan.price_monthly)
      : (planStripePricing?.yearly ?? plan.price_annual)
    const period = billingPeriod === 'monthly' ? 'month' : 'year'

    setSelectedPlan(plan)

    // For free plan (downgrade to free), show confirmation then handle via portal
    if (plan.price_monthly === 0) {
      confirmation.showConfirmation({
        title: 'Downgrade to Free Plan',
        description: 'You will lose access to premium features. To cancel your subscription, you\'ll be redirected to the billing portal.',
        confirmText: 'Open Billing Portal',
        cancelText: 'Cancel',
        variant: 'warning',
        onConfirm: async () => {
          openBillingPortal({})
        }
      })
      return
    }

    confirmation.showConfirmation({
      title: `${isDowngrade ? 'Downgrade' : 'Upgrade'} to ${plan.name}`,
      description: `You are about to ${isDowngrade ? 'downgrade' : 'upgrade'} your subscription to ${plan.name} for $${price} USD per ${period}. ${
          isDowngrade
            ? 'Some features may become unavailable.'
            : 'You will gain access to additional features.'
        } You will be redirected to our secure checkout.`,
      confirmText: `${isDowngrade ? 'Downgrade' : 'Upgrade'} Now`,
      cancelText: 'Cancel',
      variant: isDowngrade ? 'warning' : 'default',
      onConfirm: async () => {
        // Redirect to Stripe checkout
        createCheckout({
          planSlug: plan.slug,
          billingPeriod: billingPeriod === 'yearly' ? 'annual' : 'monthly',
        })
      }
    })
  }

  return (
    <div className="space-y-6">
      {/* Trial Warning */}
      {limits?.subscription_status === 'trialing' && trialDaysRemaining && trialDaysRemaining <= 7 && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800">
            Your trial ends in {trialDaysRemaining} days. Upgrade now to continue using Call Helm without interruption.
          </AlertDescription>
        </Alert>
      )}

      {/* Current Plan Overview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>Your subscription and usage overview</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {limits?.badge_text && (
                <Badge variant="secondary">{limits.badge_text}</Badge>
              )}
              <Badge className="text-lg px-3 py-1">
                {limits?.plan_display_name || 'Free'}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Agents Usage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Agents</span>
                </div>
                <span className="text-gray-500">
                  {formatUsage(limits?.current_agents || 0, limits?.max_agents || 0)}
                </span>
              </div>
              <Progress 
                value={limits?.agents_percentage || 0} 
                className="h-2"
              />
              {(limits?.agents_percentage || 0) >= 90 && (
                <p className="text-xs text-amber-600">Approaching limit</p>
              )}
            </div>

            {/* Phone Numbers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Phone Numbers</span>
                </div>
                <span className="text-gray-500">
                  {formatUsage(limits?.current_phone_numbers || 0, limits?.max_phone_numbers || 0)}
                </span>
              </div>
              <Progress 
                value={limits?.phone_numbers_percentage || 0} 
                className="h-2"
              />
              {limits?.max_phone_numbers && limits.max_phone_numbers >= 999 && (
                <p className="text-xs text-green-600">Fair use policy</p>
              )}
            </div>

            {/* Call Minutes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Call Minutes</span>
                </div>
                <span className="text-gray-500">
                  {formatUsage(limits?.used_call_minutes || 0, limits?.max_call_minutes || 0)}
                </span>
              </div>
              <Progress 
                value={limits?.call_minutes_percentage || 0} 
                className="h-2"
              />
              <p className="text-xs text-gray-500">This month</p>
            </div>

            {/* SMS Messages */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">SMS Messages</span>
                </div>
                <span className="text-gray-500">
                  {formatUsage(limits?.used_sms_messages || 0, limits?.max_sms_messages || 0)}
                </span>
              </div>
              <Progress 
                value={limits?.max_sms_messages ? (limits?.used_sms_messages || 0) * 100 / limits.max_sms_messages : 0} 
                className="h-2"
              />
              <p className="text-xs text-gray-500">This month</p>
            </div>

            {/* AI Tokens */}
            {(limits?.max_ai_tokens_per_month || 0) > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-purple-500" />
                    <span className="font-medium">AI Tokens</span>
                  </div>
                  <span className="text-gray-500">
                    {formatUsage(limits?.used_ai_tokens || 0, limits?.max_ai_tokens_per_month || 0)}
                  </span>
                </div>
                <Progress 
                  value={limits?.ai_tokens_percentage || 0} 
                  className="h-2"
                />
                <p className="text-xs text-gray-500">This month</p>
              </div>
            )}

            {/* Transcription Minutes */}
            {(limits?.max_transcription_minutes_per_month || 0) > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Mic className="h-4 w-4 text-blue-500" />
                    <span className="font-medium">Transcription</span>
                  </div>
                  <span className="text-gray-500">
                    {formatUsage(limits?.used_transcription_minutes || 0, limits?.max_transcription_minutes_per_month || 0)} min
                  </span>
                </div>
                <Progress 
                  value={limits?.transcription_percentage || 0} 
                  className="h-2"
                />
                <p className="text-xs text-gray-500">This month</p>
              </div>
            )}

            {/* AI Analysis */}
            {(limits?.max_ai_analysis_per_month || 0) > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" />
                    <span className="font-medium">AI Analysis</span>
                  </div>
                  <span className="text-gray-500">
                    {formatUsage(limits?.used_ai_analysis || 0, limits?.max_ai_analysis_per_month || 0)}
                  </span>
                </div>
                <Progress 
                  value={limits?.ai_analysis_percentage || 0} 
                  className="h-2"
                />
                <p className="text-xs text-gray-500">This month</p>
              </div>
            )}

            {/* Contacts */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Contacts</span>
                </div>
                <span className="text-gray-500">
                  {formatUsage(limits?.current_contacts || 0, limits?.max_contacts || 0)}
                </span>
              </div>
              <Progress 
                value={limits?.contacts_percentage || 0} 
                className="h-2"
              />
            </div>

            {/* Campaigns */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Campaigns</span>
                </div>
                <span className="text-gray-500">
                  {formatUsage(limits?.current_campaigns || 0, limits?.max_campaigns || 0)}
                </span>
              </div>
              <Progress 
                value={limits?.max_campaigns ? (limits?.current_campaigns || 0) * 100 / limits.max_campaigns : 0} 
                className="h-2"
              />
            </div>

            {/* Storage */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">Storage</span>
                </div>
                <span className="text-gray-500">
                  {limits?.max_storage_gb || 0} GB
                </span>
              </div>
              <Progress 
                value={0} 
                className="h-2"
              />
              <p className="text-xs text-gray-500">Recordings & files</p>
            </div>
          </div>

          {/* Status Bar */}
          <div className="mt-6 pt-6 border-t flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-500" />
                <span className="text-sm text-gray-600">
                  {limits?.subscription_status === 'trialing'
                    ? `Trial: ${trialDaysRemaining} days remaining`
                    : `Status: ${limits?.subscription_status || 'Active'}`
                  }
                </span>
              </div>
              {(() => {
                const currentStripePricing = currentPlan?.slug ? stripePrices[currentPlan.slug] : null
                const currentPrice = billingPeriod === 'monthly'
                  ? (currentStripePricing?.monthly ?? currentPlan?.price_monthly)
                  : (currentStripePricing?.yearly ?? currentPlan?.price_annual)

                if (!currentPrice || currentPrice === 0) return null

                return (
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-600">
                      ${currentPrice}{billingPeriod === 'monthly' ? '/mo' : '/yr'} USD
                    </span>
                  </div>
                )
              })()}
            </div>
            <div className="flex items-center gap-2">
              {/* Manage Subscription button for paid subscribers */}
              {limits?.subscription_status === 'active' && (currentPlan?.price_monthly ?? 0) > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openBillingPortal({})}
                  disabled={isPortalLoading}
                >
                  {isPortalLoading ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-1" />
                  )}
                  Manage Subscription
                </Button>
              )}
              {limits?.plan_slug !== 'enterprise' && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Scroll to Available Plans section
                    const plansSection = document.querySelector('[data-section="available-plans"]')
                    plansSection?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                >
                  Upgrade Plan
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overage Charges Section */}
      {(() => {
        const overages = calculateOverages(limits)
        const totalOverageCost = overages.reduce((sum, o) => sum + o.cost, 0)

        if (overages.length === 0) return null

        return (
          <Card className="border-amber-200 bg-amber-50/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <CardTitle className="text-amber-900">Estimated Overage Charges</CardTitle>
                </div>
                <Badge variant="outline" className="text-amber-700 border-amber-300 text-lg px-3 py-1">
                  ${totalOverageCost.toFixed(2)}
                </Badge>
              </div>
              <CardDescription className="text-amber-700">
                You've exceeded your plan limits. These charges will be added to your next invoice.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {overages.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between p-3 bg-white rounded-lg border border-amber-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-lg">
                        {item.key === 'agents' && <Users className="h-4 w-4 text-amber-600" />}
                        {item.key === 'phone_numbers' && <Smartphone className="h-4 w-4 text-amber-600" />}
                        {item.key === 'call_minutes' && <Phone className="h-4 w-4 text-amber-600" />}
                        {item.key === 'sms_messages' && <MessageSquare className="h-4 w-4 text-amber-600" />}
                        {item.key === 'ai_tokens' && <Brain className="h-4 w-4 text-amber-600" />}
                        {item.key === 'transcription_minutes' && <Mic className="h-4 w-4 text-amber-600" />}
                        {item.key === 'ai_analysis' && <Zap className="h-4 w-4 text-amber-600" />}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{item.label}</p>
                        <p className="text-sm text-gray-500">
                          {item.used.toLocaleString()} used / {item.limit.toLocaleString()} included
                          <span className="text-amber-600 ml-2">
                            (+{item.overage.toLocaleString()} over)
                          </span>
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-amber-700">
                        ${item.cost.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">
                        ${item.price.toFixed(item.price < 0.01 ? 5 : 2)}/{item.unit}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-4 border-t border-amber-200 flex items-center justify-between">
                <p className="text-sm text-amber-700">
                  <DollarSign className="h-4 w-4 inline mr-1" />
                  Overages are billed automatically at the end of your billing period
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-amber-300 text-amber-700 hover:bg-amber-100"
                  onClick={() => {
                    const plansSection = document.querySelector('[data-section="available-plans"]')
                    plansSection?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                >
                  Upgrade to avoid overages
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })()}

      {/* Available Plans */}
      <div data-section="available-plans">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Available Plans</h3>
            <p className="text-sm text-gray-600">Choose the plan that fits your needs</p>
          </div>
          <div className="flex items-center gap-2 bg-gray-100 rounded-lg p-1">
            <Button
              variant={billingPeriod === 'monthly' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setBillingPeriod('monthly')}
            >
              Monthly
            </Button>
            <Button
              variant={billingPeriod === 'yearly' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setBillingPeriod('yearly')}
            >
              Yearly
              <Badge variant="secondary" className="ml-2">Save 20%</Badge>
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {plans?.map((plan, index) => {
            const isCurrentPlan = plan.slug === limits?.plan_slug
            const currentPlanIndex = plans.findIndex(p => p.slug === limits?.plan_slug)
            const isDowngrade = currentPlanIndex > index

            // Use Stripe prices as source of truth, fallback to database prices
            const planStripePricing = stripePrices[plan.slug]
            const monthlyPrice = planStripePricing?.monthly ?? plan.price_monthly ?? 0
            const yearlyPrice = planStripePricing?.yearly ?? plan.price_annual ?? 0
            const price = billingPeriod === 'monthly' ? monthlyPrice : yearlyPrice

            // Calculate savings from Stripe prices or fallback
            const savings = billingPeriod === 'yearly' && planStripePricing?.savingsPercentage != null
              ? planStripePricing.savingsPercentage
              : billingPeriod === 'yearly'
              ? calculateSavings(monthlyPrice, yearlyPrice)
              : 0
            
            return (
              <Card 
                key={plan.id} 
                className={cn(
                  "relative flex flex-col h-full",
                  isCurrentPlan && "border-primary ring-2 ring-primary/20"
                )}
              >
                {plan.badge_text && (
                  <Badge className="absolute -top-2 -right-2 z-10">{plan.badge_text}</Badge>
                )}
                <CardHeader className="pb-4">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription className="min-h-[3rem] sm:min-h-[2.5rem] flex items-start">{plan.description}</CardDescription>
                  <div className="pt-4 min-h-[6.5rem]">
                    {price === 0 ? (
                      <div>
                        <div className="text-3xl font-bold">Free</div>
                        <div className="text-sm text-gray-500 min-h-[1.25rem]">&nbsp;</div>
                      </div>
                    ) : (
                      <>
                        <div className="text-3xl font-bold">
                          ${billingPeriod === 'monthly' ? price : Math.round(price / 12)}
                          <span className="text-base font-normal text-gray-500 ml-2">USD</span>
                        </div>
                        <div className="text-sm text-gray-500 min-h-[1.25rem]">
                          per {billingPeriod === 'monthly' ? 'month' : 'month, billed yearly'}
                        </div>
                      </>
                    )}
                    {savings > 0 ? (
                      <Badge variant="secondary" className="mt-1">Save {savings}%</Badge>
                    ) : (
                      <div className="h-6">&nbsp;</div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <ul className="space-y-2 mb-4 flex-1">
                    {/* Phone Numbers - Fixed height block */}
                    <div className="min-h-[3rem]">
                      <li className="flex items-center gap-2 text-sm">
                        <Smartphone className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        <span className="font-medium">
                          {getPlanLimit(plan, 'max_phone_numbers') >= 999
                            ? '100+ Numbers (fair use)'
                            : getPlanLimit(plan, 'max_phone_numbers') === 1
                            ? '1 Number included'
                            : `${getPlanLimit(plan, 'max_phone_numbers')} Numbers included`
                          }
                        </span>
                      </li>
                      {getPlanLimit(plan, 'max_phone_numbers') < 999 && (
                        <li className="flex items-center gap-2 text-xs text-gray-500 pl-6 mt-1">
                          <span>+$2.50/mo per additional</span>
                        </li>
                      )}
                    </div>

                    {/* Agents */}
                    <li className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{getPlanLimit(plan, 'max_agents') >= 999999 ? 'Unlimited agents' : `${getPlanLimit(plan, 'max_agents')} agents`}</span>
                    </li>

                    {/* Call Minutes */}
                    <li className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{getPlanLimit(plan, 'max_call_minutes') >= 999999 ? 'Unlimited minutes' : `${getPlanLimit(plan, 'max_call_minutes').toLocaleString()} min/mo`}</span>
                    </li>

                    {/* SMS Messages */}
                    <li className="flex items-center gap-2 text-sm">
                      {getPlanLimit(plan, 'max_sms_messages') > 0 ? (
                        <>
                          <MessageSquare className="h-4 w-4 text-green-500 flex-shrink-0" />
                          <span>{getPlanLimit(plan, 'max_sms_messages') >= 999999 ? 'Unlimited SMS' : `${getPlanLimit(plan, 'max_sms_messages').toLocaleString()} SMS/mo`}</span>
                        </>
                      ) : (
                        <>
                          <X className="h-4 w-4 text-gray-300 flex-shrink-0" />
                          <span className="text-gray-400">No SMS</span>
                        </>
                      )}
                    </li>

                    {/* AI Services - Fixed height block */}
                    <div className="min-h-[4.5rem]">
                      {getPlanLimit(plan, 'max_ai_tokens_per_month') > 0 ? (
                        <>
                          <li className="flex items-center gap-2 text-sm">
                            <Brain className="h-4 w-4 text-purple-500 flex-shrink-0" />
                            <span>{getPlanLimit(plan, 'max_ai_tokens_per_month') >= 999999 ? 'Unlimited AI' : `${getPlanLimit(plan, 'max_ai_tokens_per_month').toLocaleString()} AI tokens`}</span>
                          </li>
                          <li className="flex items-center gap-2 text-sm">
                            <Mic className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <span>{getPlanLimit(plan, 'max_transcription_minutes_per_month') >= 999999 ? 'Unlimited transcription' : `${getPlanLimit(plan, 'max_transcription_minutes_per_month')} min transcription`}</span>
                          </li>
                          <li className="flex items-center gap-2 text-sm">
                            <Zap className="h-4 w-4 text-amber-500 flex-shrink-0" />
                            <span>{getPlanLimit(plan, 'max_ai_analysis_per_month') >= 999999 ? 'Unlimited analysis' : `${getPlanLimit(plan, 'max_ai_analysis_per_month')} analyses`}</span>
                          </li>
                        </>
                      ) : (
                        <li className="flex items-center gap-2 text-sm">
                          <X className="h-4 w-4 text-gray-300 flex-shrink-0" />
                          <span className="text-gray-400">No AI services</span>
                        </li>
                      )}
                    </div>

                    {/* Contacts */}
                    <li className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{getPlanLimit(plan, 'max_contacts') >= 999999 ? 'Unlimited contacts' : `${getPlanLimit(plan, 'max_contacts').toLocaleString()} contacts`}</span>
                    </li>
                    
                    {/* Advanced Features */}
                    <li className="flex items-center gap-2 text-sm">
                      {hasPlanFeature(plan, 'white_label') ? (
                        <>
                          <Crown className="h-4 w-4 text-amber-500 flex-shrink-0" />
                          <span>White Label</span>
                        </>
                      ) : (
                        <>
                          <X className="h-4 w-4 text-gray-300 flex-shrink-0" />
                          <span className="text-gray-400">No White Label</span>
                        </>
                      )}
                    </li>
                  </ul>
                  
                  {/* Button section */}
                  {plan.slug === 'enterprise' ? (
                    <Button
                      className="w-full mt-auto"
                      variant="default"
                      onClick={() => setEnterpriseDialogOpen(true)}
                    >
                      Contact Sales
                    </Button>
                  ) : (
                    <Button
                      className="w-full mt-auto"
                      variant={isCurrentPlan ? "outline" : isDowngrade ? "destructive" : "default"}
                      disabled={isCurrentPlan || (isCheckoutLoading && selectedPlan?.slug === plan.slug)}
                      onClick={() => !isCurrentPlan && handlePlanChange(plan, isDowngrade)}
                    >
                      {isCheckoutLoading && selectedPlan?.slug === plan.slug ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Redirecting...
                        </>
                      ) : isCurrentPlan ? (
                        'Current Plan'
                      ) : isDowngrade ? (
                        'Downgrade'
                      ) : (
                        'Upgrade'
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      {/* Feature Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>Feature Comparison</CardTitle>
          <CardDescription>See what's included in each plan</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4">Feature</th>
                  {plans?.map(plan => (
                    <th key={plan.id} className="text-center py-3 px-4 min-w-[120px]">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Core Features Section */}
                <tr className="bg-gray-50">
                  <td colSpan={plans?.length ? plans.length + 1 : 5} className="py-2 px-4 text-sm font-semibold">
                    Core Features
                  </td>
                </tr>
                {[
                  { key: 'phone_number_management', label: 'Phone Number Management' },
                  { key: 'voice_calls', label: 'Voice Calls' },
                  { key: 'sms_messaging', label: 'SMS Messaging' },
                  { key: 'call_recording', label: 'Call Recording' },
                  { key: 'call_forwarding', label: 'Call Forwarding' },
                  { key: 'voicemail', label: 'Voicemail' },
                  { key: 'contact_management', label: 'Contact Management' },
                ].map(feature => (
                  <tr key={feature.key} className="border-b">
                    <td className="py-3 px-4 text-sm font-medium">{feature.label}</td>
                    {plans?.map(plan => (
                      <td key={plan.id} className="text-center py-3 px-4">
                        {hasPlanFeature(plan, feature.key) ? (
                          <Check className="h-5 w-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-300 mx-auto" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}

                {/* AI Features Section */}
                <tr className="bg-gray-50">
                  <td colSpan={plans?.length ? plans.length + 1 : 5} className="py-2 px-4 text-sm font-semibold">
                    AI Features
                  </td>
                </tr>
                {[
                  { key: 'call_transcription', label: 'AI Transcription' },
                  { key: 'ai_analysis', label: 'AI Call Analysis' },
                  { key: 'sentiment_analysis', label: 'Sentiment Analysis' },
                  { key: 'speaker_diarization', label: 'Speaker Diarization' },
                  { key: 'action_items', label: 'Action Item Extraction' },
                  { key: 'call_summaries', label: 'AI Call Summaries' },
                ].map(feature => (
                  <tr key={feature.key} className="border-b">
                    <td className="py-3 px-4 text-sm font-medium">{feature.label}</td>
                    {plans?.map(plan => (
                      <td key={plan.id} className="text-center py-3 px-4">
                        {getPlanLimit(plan, 'max_ai_tokens_per_month') > 0 || plan.slug === 'enterprise' ? (
                          <Check className="h-5 w-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-300 mx-auto" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Integration Features Section */}
                <tr className="bg-gray-50">
                  <td colSpan={plans?.length ? plans.length + 1 : 5} className="py-2 px-4 text-sm font-semibold">
                    Integrations & API
                  </td>
                </tr>
                {[
                  { key: 'api_access', label: 'REST API Access' },
                  { key: 'webhooks', label: 'Webhooks' },
                  { key: 'crm_integration', label: 'CRM Integration' },
                  { key: 'zapier_integration', label: 'Zapier Integration' },
                  { key: 'white_label', label: 'White Label' },
                ].map(feature => (
                  <tr key={feature.key} className="border-b">
                    <td className="py-3 px-4 text-sm font-medium">{feature.label}</td>
                    {plans?.map(plan => (
                      <td key={plan.id} className="text-center py-3 px-4">
                        {hasPlanFeature(plan, feature.key) ? (
                          <Check className="h-5 w-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-300 mx-auto" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Support Section */}
                <tr className="bg-gray-50">
                  <td colSpan={plans?.length ? plans.length + 1 : 5} className="py-2 px-4 text-sm font-semibold">
                    Support & Service
                  </td>
                </tr>
                {[
                  { key: 'email_support', label: 'Email Support' },
                  { key: 'priority_support', label: 'Priority Support' },
                  { key: 'dedicated_account_manager', label: 'Dedicated Account Manager' },
                  { key: 'sla', label: 'Service Level Agreement' },
                ].map(feature => (
                  <tr key={feature.key} className="border-b">
                    <td className="py-3 px-4 text-sm font-medium">{feature.label}</td>
                    {plans?.map(plan => (
                      <td key={plan.id} className="text-center py-3 px-4">
                        {feature.key === 'email_support' ||
                         (feature.key === 'priority_support' && hasPlanFeature(plan, 'priority_support')) ||
                         (feature.key === 'dedicated_account_manager' && plan.slug === 'enterprise') ||
                         (feature.key === 'sla' && plan.slug === 'enterprise') ? (
                          <Check className="h-5 w-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-300 mx-auto" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}

                {/* Limits Section */}
                <tr className="bg-gray-50">
                  <td colSpan={plans?.length ? plans.length + 1 : 5} className="py-2 px-4 text-sm font-semibold">
                    Limits & Quotas
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">Phone Numbers Included</td>
                  {plans?.map(plan => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm font-medium">
                      {getPlanLimit(plan, 'max_phone_numbers') >= 999
                        ? '100+'
                        : getPlanLimit(plan, 'max_phone_numbers')}
                      {getPlanLimit(plan, 'max_phone_numbers') < 999 && getPlanLimit(plan, 'max_phone_numbers') > 0 && (
                        <span className="block text-xs text-gray-500 font-normal">
                          +$2.50/mo each extra
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">Agents/Users</td>
                  {plans?.map(plan => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm font-medium">
                      {getPlanLimit(plan, 'max_agents') >= 999999
                        ? 'Unlimited'
                        : getPlanLimit(plan, 'max_agents').toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">Call Minutes/Month</td>
                  {plans?.map(plan => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm font-medium">
                      {getPlanLimit(plan, 'max_call_minutes') >= 999999
                        ? 'Unlimited'
                        : getPlanLimit(plan, 'max_call_minutes').toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">SMS Messages/Month</td>
                  {plans?.map(plan => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm font-medium">
                      {getPlanLimit(plan, 'max_sms_messages') >= 999999
                        ? 'Unlimited'
                        : getPlanLimit(plan, 'max_sms_messages').toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">Contacts</td>
                  {plans?.map(plan => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm font-medium">
                      {getPlanLimit(plan, 'max_contacts') >= 999999
                        ? 'Unlimited'
                        : getPlanLimit(plan, 'max_contacts').toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">AI Tokens/Month</td>
                  {plans?.map(plan => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm font-medium">
                      {getPlanLimit(plan, 'max_ai_tokens_per_month') === 0
                        ? '—'
                        : getPlanLimit(plan, 'max_ai_tokens_per_month') >= 999999
                        ? 'Unlimited'
                        : getPlanLimit(plan, 'max_ai_tokens_per_month').toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">Transcription Minutes/Month</td>
                  {plans?.map(plan => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm font-medium">
                      {getPlanLimit(plan, 'max_transcription_minutes_per_month') === 0
                        ? '—'
                        : getPlanLimit(plan, 'max_transcription_minutes_per_month') >= 999999
                        ? 'Unlimited'
                        : getPlanLimit(plan, 'max_transcription_minutes_per_month').toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">AI Analyses/Month</td>
                  {plans?.map(plan => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm font-medium">
                      {getPlanLimit(plan, 'max_ai_analysis_per_month') === 0
                        ? '—'
                        : getPlanLimit(plan, 'max_ai_analysis_per_month') >= 999999
                        ? 'Unlimited'
                        : getPlanLimit(plan, 'max_ai_analysis_per_month').toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">Storage</td>
                  {plans?.map(plan => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm font-medium">
                      {getPlanLimit(plan, 'max_storage_gb') >= 999
                        ? 'Unlimited'
                        : `${getPlanLimit(plan, 'max_storage_gb', 10)} GB`}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

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

      {/* Enterprise Contact Dialog */}
      <EnterpriseContactDialog
        isOpen={enterpriseDialogOpen}
        onClose={() => setEnterpriseDialogOpen(false)}
      />
    </div>
  )
}