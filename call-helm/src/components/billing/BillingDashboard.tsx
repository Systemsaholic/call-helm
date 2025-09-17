'use client'

import { useState } from 'react'
import { useBilling } from '@/lib/hooks/useBilling'
import { useConfirmation } from '@/lib/hooks/useConfirmation'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
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

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
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
                  <CardDescription className="min-h-[2.5rem]">{plan.description}</CardDescription>
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
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{plan.features?.max_agents >= 999999 ? 'Unlimited' : plan.features?.max_agents || 0} agents</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{plan.features?.max_contacts >= 999999 ? 'Unlimited' : (plan.features?.max_contacts || 0).toLocaleString()} contacts</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{plan.features?.max_call_minutes >= 999999 ? 'Unlimited' : (plan.features?.max_call_minutes || 0).toLocaleString()} minutes/mo</span>
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      {(plan.features?.max_sms_messages || 0) > 0 ? (
                        <>
                          <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                          <span>{plan.features?.max_sms_messages >= 999999 ? 'Unlimited' : (plan.features?.max_sms_messages || 0).toLocaleString()} SMS/mo</span>
                        </>
                      ) : (
                        <>
                          <X className="h-4 w-4 text-gray-300 flex-shrink-0" />
                          <span className="text-gray-400">No SMS included</span>
                        </>
                      )}
                    </li>
                    <li className="flex items-center gap-2 text-sm">
                      {plan.features?.ai_analysis ? (
                        <>
                          <Zap className="h-4 w-4 text-purple-500 flex-shrink-0" />
                          <span>AI Analysis</span>
                        </>
                      ) : (
                        <>
                          <X className="h-4 w-4 text-gray-300 flex-shrink-0" />
                          <span className="text-gray-400">No AI Analysis</span>
                        </>
                      )}
                    </li>
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
                  <Button 
                    className="w-full mt-auto" 
                    variant={isCurrentPlan ? "outline" : isDowngrade ? "destructive" : "default"}
                    disabled={isCurrentPlan}
                    onClick={() => !isCurrentPlan && handlePlanChange(plan, isDowngrade)}
                  >
                    {isCurrentPlan ? 'Current Plan' : isDowngrade ? 'Downgrade' : 'Upgrade'}
                  </Button>
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
                {[
                  { key: 'voice_calls', label: 'Voice Calls' },
                  { key: 'call_recording', label: 'Call Recording' },
                  { key: 'call_transcription', label: 'Transcription' },
                  { key: 'ai_analysis', label: 'AI Analysis' },
                  { key: 'sentiment_analysis', label: 'Sentiment Analysis' },
                  { key: 'api_access', label: 'API Access' },
                  { key: 'webhooks', label: 'Webhooks' },
                  { key: 'white_label', label: 'White Label' },
                  { key: 'priority_support', label: 'Priority Support' },
                ].map(feature => (
                  <tr key={feature.key} className="border-b">
                    <td className="py-3 px-4 text-sm font-medium">{feature.label}</td>
                    {plans?.map(plan => (
                      <td key={plan.id} className="text-center py-3 px-4">
                        {plan.features?.[feature.key] ? (
                          <Check className="h-5 w-5 text-green-500 mx-auto" />
                        ) : (
                          <X className="h-5 w-5 text-gray-300 mx-auto" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
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
    </div>
  )
}