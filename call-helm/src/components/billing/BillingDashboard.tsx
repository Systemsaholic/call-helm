'use client'

import { useState } from 'react'
import { useBilling } from '@/lib/hooks/useBilling'
import { useConfirmation } from '@/lib/hooks/useConfirmation'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { EnterpriseContactDialog } from './EnterpriseContactDialog'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
} from 'lucide-react'
import { cn } from '@/lib/utils'

export function BillingDashboard() {
  const {
    plans,
    limits,
    trialDaysRemaining,
    isLoading,
    formatUsage,
    getUsageClass,
    showUpgradePrompt
  } = useBilling()

  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly')
  const [enterpriseDialogOpen, setEnterpriseDialogOpen] = useState(false)
  const confirmation = useConfirmation()
  const [selectedPlan, setSelectedPlan] = useState<any>(null)

  if (isLoading) {
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

  // Handle plan change
  const handlePlanChange = (plan: any, isDowngrade: boolean) => {
    const price = billingPeriod === 'monthly' ? plan.price_monthly : plan.price_annual
    const period = billingPeriod === 'monthly' ? 'month' : 'year'
    
    setSelectedPlan(plan)
    
    confirmation.showConfirmation({
      title: `${isDowngrade ? 'Downgrade' : 'Upgrade'} to ${plan.name}`,
      description: price > 0 
        ? `You are about to ${isDowngrade ? 'downgrade' : 'upgrade'} your subscription to ${plan.name} for $${price} per ${period}. ${
            isDowngrade 
              ? 'Some features may become unavailable.' 
              : 'You will gain access to additional features.'
          }` 
        : `You are about to switch to the ${plan.name} plan. Some features may become unavailable.`,
      confirmText: `Confirm ${isDowngrade ? 'Downgrade' : 'Upgrade'}`,
      cancelText: 'Cancel',
      variant: isDowngrade ? 'warning' : 'default',
      onConfirm: async () => {
        // Show success message
        setTimeout(() => {
          confirmation.showConfirmation({
            title: 'Success!',
            description: `Your ${isDowngrade ? 'downgrade' : 'upgrade'} to ${plan.name} has been initiated. Redirecting to payment page...`,
            confirmText: 'OK',
            variant: 'success',
            onConfirm: () => {
              // In a real app, this would redirect to Stripe checkout
              console.log('Redirecting to payment page...')
            }
          })
        }, 500)
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
              {currentPlan?.price_monthly && currentPlan.price_monthly > 0 && (
                <div className="flex items-center gap-2">
                  <CreditCard className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-600">
                    ${billingPeriod === 'monthly' 
                      ? `${currentPlan.price_monthly}/mo` 
                      : `${currentPlan.price_annual}/yr`
                    }
                  </span>
                </div>
              )}
            </div>
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
        </CardContent>
      </Card>

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
            const price = billingPeriod === 'monthly' ? plan.price_monthly : plan.price_annual
            const savings = billingPeriod === 'yearly' ? calculateSavings(plan.price_monthly || 0, plan.price_annual || 0) : 0
            
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
                  <div className="pt-4 min-h-[5rem]">
                    {price === 0 ? (
                      <div>
                        <div className="text-3xl font-bold">Free</div>
                        <div className="text-sm text-gray-500 h-5">&nbsp;</div>
                      </div>
                    ) : (
                      <>
                        <div className="text-3xl font-bold">
                          ${billingPeriod === 'monthly' ? price : Math.round(price / 12)}
                        </div>
                        <div className="text-sm text-gray-500 h-5">
                          per {billingPeriod === 'monthly' ? 'month' : 'month, billed yearly'}
                        </div>
                      </>
                    )}
                    {savings > 0 ? (
                      <Badge variant="secondary" className="mt-2">Save {savings}%</Badge>
                    ) : (
                      <div className="h-7">&nbsp;</div>
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
                          {(plan.features?.max_phone_numbers || 0) >= 999 
                            ? '100+ Numbers (fair use)' 
                            : (plan.features?.max_phone_numbers || 0) === 1 
                            ? '1 Number included' 
                            : `${plan.features?.max_phone_numbers || 0} Numbers included`
                          }
                        </span>
                      </li>
                      {(plan.features?.max_phone_numbers || 0) < 999 && (
                        <li className="flex items-center gap-2 text-xs text-gray-500 pl-6 mt-1">
                          <span>+$2.50/mo per additional</span>
                        </li>
                      )}
                    </div>
                    
                    {/* Agents */}
                    <li className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{plan.features?.max_agents >= 999999 ? 'Unlimited agents' : `${plan.features?.max_agents || 0} agents`}</span>
                    </li>
                    
                    {/* Call Minutes */}
                    <li className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{plan.features?.max_call_minutes >= 999999 ? 'Unlimited minutes' : `${(plan.features?.max_call_minutes || 0).toLocaleString()} min/mo`}</span>
                    </li>
                    
                    {/* SMS Messages */}
                    <li className="flex items-center gap-2 text-sm">
                      {(plan.features?.max_sms_messages || 0) > 0 ? (
                        <>
                          <MessageSquare className="h-4 w-4 text-green-500 flex-shrink-0" />
                          <span>{plan.features?.max_sms_messages >= 999999 ? 'Unlimited SMS' : `${(plan.features?.max_sms_messages || 0).toLocaleString()} SMS/mo`}</span>
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
                      {(plan.features?.max_ai_tokens_per_month || 0) > 0 ? (
                        <>
                          <li className="flex items-center gap-2 text-sm">
                            <Brain className="h-4 w-4 text-purple-500 flex-shrink-0" />
                            <span>{plan.features?.max_ai_tokens_per_month >= 999999 ? 'Unlimited AI' : `${(plan.features?.max_ai_tokens_per_month || 0).toLocaleString()} AI tokens`}</span>
                          </li>
                          <li className="flex items-center gap-2 text-sm">
                            <Mic className="h-4 w-4 text-blue-500 flex-shrink-0" />
                            <span>{plan.features?.max_transcription_minutes_per_month >= 999999 ? 'Unlimited transcription' : `${(plan.features?.max_transcription_minutes_per_month || 0)} min transcription`}</span>
                          </li>
                          <li className="flex items-center gap-2 text-sm">
                            <Zap className="h-4 w-4 text-amber-500 flex-shrink-0" />
                            <span>{plan.features?.max_ai_analysis_per_month >= 999999 ? 'Unlimited analysis' : `${(plan.features?.max_ai_analysis_per_month || 0)} analyses`}</span>
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
                      <span>{plan.features?.max_contacts >= 999999 ? 'Unlimited contacts' : `${(plan.features?.max_contacts || 0).toLocaleString()} contacts`}</span>
                    </li>
                    
                    {/* Advanced Features */}
                    <li className="flex items-center gap-2 text-sm">
                      {plan.features?.white_label ? (
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
                      disabled={isCurrentPlan}
                      onClick={() => !isCurrentPlan && handlePlanChange(plan, isDowngrade)}
                    >
                      {isCurrentPlan ? 'Current Plan' : isDowngrade ? 'Downgrade' : 'Upgrade'}
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
                        {plan.features?.[feature.key] !== false ? (
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
                        {(plan.features?.max_ai_tokens_per_month || 0) > 0 || plan.slug === 'enterprise' ? (
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
                        {plan.features?.[feature.key] || (feature.key === 'api_access' || feature.key === 'webhooks') ? (
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
                         (feature.key === 'priority_support' && plan.features?.priority_support) ||
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
                      {plan.features?.max_phone_numbers >= 999 
                        ? '100+' 
                        : plan.features?.max_phone_numbers || 0}
                      {plan.features?.max_phone_numbers < 999 && plan.features?.max_phone_numbers > 0 && (
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
                      {plan.features?.max_agents >= 999999 
                        ? 'Unlimited' 
                        : (plan.features?.max_agents || 0).toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">Call Minutes/Month</td>
                  {plans?.map(plan => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm font-medium">
                      {plan.features?.max_call_minutes >= 999999 
                        ? 'Unlimited' 
                        : (plan.features?.max_call_minutes || 0).toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">SMS Messages/Month</td>
                  {plans?.map(plan => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm font-medium">
                      {plan.features?.max_sms_messages >= 999999 
                        ? 'Unlimited' 
                        : (plan.features?.max_sms_messages || 0).toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">Contacts</td>
                  {plans?.map(plan => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm font-medium">
                      {plan.features?.max_contacts >= 999999 
                        ? 'Unlimited' 
                        : (plan.features?.max_contacts || 0).toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">AI Tokens/Month</td>
                  {plans?.map(plan => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm font-medium">
                      {(plan.features?.max_ai_tokens_per_month || 0) === 0 
                        ? '—' 
                        : plan.features?.max_ai_tokens_per_month >= 999999 
                        ? 'Unlimited' 
                        : (plan.features?.max_ai_tokens_per_month || 0).toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">Transcription Minutes/Month</td>
                  {plans?.map(plan => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm font-medium">
                      {(plan.features?.max_transcription_minutes_per_month || 0) === 0 
                        ? '—' 
                        : plan.features?.max_transcription_minutes_per_month >= 999999 
                        ? 'Unlimited' 
                        : (plan.features?.max_transcription_minutes_per_month || 0).toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">AI Analyses/Month</td>
                  {plans?.map(plan => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm font-medium">
                      {(plan.features?.max_ai_analysis_per_month || 0) === 0 
                        ? '—' 
                        : plan.features?.max_ai_analysis_per_month >= 999999 
                        ? 'Unlimited' 
                        : (plan.features?.max_ai_analysis_per_month || 0).toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-3 px-4 text-sm font-medium">Storage</td>
                  {plans?.map(plan => (
                    <td key={plan.id} className="text-center py-3 px-4 text-sm font-medium">
                      {plan.features?.max_storage_gb >= 999 
                        ? 'Unlimited' 
                        : `${plan.features?.max_storage_gb || 10} GB`}
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