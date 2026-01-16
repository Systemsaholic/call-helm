'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Check,
  Users,
  UserPlus,
  FileText,
  Phone,
  X,
  ChevronRight,
  Sparkles
} from 'lucide-react'

export interface OnboardingProgress {
  invite_team: boolean
  add_contacts: boolean
  create_campaign: boolean
  make_first_call: boolean
  dismissed: boolean
  dismissed_at: string | null
}

interface OnboardingChecklistProps {
  progress: OnboardingProgress
  onUpdateProgress: (updates: Partial<OnboardingProgress>) => Promise<void>
  isLoading?: boolean
}

interface OnboardingStep {
  id: keyof Omit<OnboardingProgress, 'dismissed' | 'dismissed_at'>
  title: string
  description: string
  icon: React.ElementType
  href: string
  actionLabel: string
}

const onboardingSteps: OnboardingStep[] = [
  {
    id: 'invite_team',
    title: 'Invite your team',
    description: 'Add agents to help manage calls',
    icon: UserPlus,
    href: '/dashboard/agents',
    actionLabel: 'Invite Agents'
  },
  {
    id: 'add_contacts',
    title: 'Add contacts',
    description: 'Import or add contacts to call',
    icon: Users,
    href: '/dashboard/contacts',
    actionLabel: 'Add Contacts'
  },
  {
    id: 'create_campaign',
    title: 'Create a campaign',
    description: 'Set up your first call list',
    icon: FileText,
    href: '/dashboard/call-lists',
    actionLabel: 'Create Campaign'
  },
  {
    id: 'make_first_call',
    title: 'Make your first call',
    description: 'Start calling from the call board',
    icon: Phone,
    href: '/dashboard/call-board',
    actionLabel: 'Start Calling'
  }
]

export function OnboardingChecklist({
  progress,
  onUpdateProgress,
  isLoading = false
}: OnboardingChecklistProps) {
  const [dismissing, setDismissing] = useState(false)
  const [temporarilyDismissed, setTemporarilyDismissed] = useState(false)

  // Calculate completion percentage
  const completedSteps = onboardingSteps.filter(step => progress[step.id]).length
  const totalSteps = onboardingSteps.length
  const completionPercentage = Math.round((completedSteps / totalSteps) * 100)

  // Check if all steps are complete
  const isComplete = completedSteps === totalSteps

  // Don't render if dismissed (temporarily or permanently) or all complete
  if (progress.dismissed || temporarilyDismissed || isComplete) {
    return null
  }

  const handleDismiss = async (permanent: boolean) => {
    if (!permanent) {
      // Temporary dismiss - just hide locally (will reappear on page refresh)
      setTemporarilyDismissed(true)
      return
    }

    // Permanent dismiss - save to database
    setDismissing(true)
    try {
      await onUpdateProgress({
        dismissed: true,
        dismissed_at: new Date().toISOString()
      })
    } finally {
      setDismissing(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden mb-8">
      {/* Header */}
      <div className="bg-gradient-to-r from-primary/5 to-accent/5 px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 p-2 rounded-lg">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Get started with Call Helm</h3>
              <p className="text-sm text-gray-500">
                Complete these steps to set up your call center
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <span className="text-sm font-medium text-gray-900">{completedSteps}/{totalSteps} complete</span>
              <div className="w-32 mt-1">
                <Progress value={completionPercentage} className="h-2" />
              </div>
            </div>
            <button
              onClick={() => handleDismiss(false)}
              disabled={dismissing}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Dismiss for now"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {/* Mobile progress */}
        <div className="sm:hidden mt-3">
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="text-gray-600">Progress</span>
            <span className="font-medium text-gray-900">{completionPercentage}%</span>
          </div>
          <Progress value={completionPercentage} className="h-2" />
        </div>
      </div>

      {/* Steps */}
      <div className="divide-y divide-gray-100">
        {onboardingSteps.map((step, index) => {
          const isStepComplete = progress[step.id]
          const StepIcon = step.icon

          return (
            <div
              key={step.id}
              className={`px-6 py-4 flex items-center gap-4 transition-colors ${
                isStepComplete ? 'bg-green-50/50' : 'hover:bg-gray-50'
              }`}
            >
              {/* Step number / check */}
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  isStepComplete
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {isStepComplete ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <span className="text-sm font-medium">{index + 1}</span>
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <StepIcon className={`h-4 w-4 ${isStepComplete ? 'text-green-600' : 'text-gray-400'}`} />
                  <h4 className={`font-medium ${isStepComplete ? 'text-green-700' : 'text-gray-900'}`}>
                    {step.title}
                  </h4>
                </div>
                <p className={`text-sm mt-0.5 ${isStepComplete ? 'text-green-600' : 'text-gray-500'}`}>
                  {isStepComplete ? 'Completed' : step.description}
                </p>
              </div>

              {/* Action button */}
              {!isStepComplete && (
                <Link href={step.href}>
                  <Button size="sm" variant="outline" className="flex-shrink-0">
                    {step.actionLabel}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="bg-gray-50 px-6 py-3 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          You can always access this guide from the help menu
        </p>
        <button
          onClick={() => handleDismiss(true)}
          disabled={dismissing}
          className="text-xs text-gray-500 hover:text-gray-700 underline"
        >
          Don't show again
        </button>
      </div>
    </div>
  )
}
