import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { OnboardingProgress } from '@/components/dashboard/OnboardingChecklist'

const defaultProgress: OnboardingProgress = {
  invite_team: false,
  add_contacts: false,
  create_campaign: false,
  make_first_call: false,
  dismissed: false,
  dismissed_at: null
}

async function fetchOnboardingProgress(): Promise<OnboardingProgress> {
  const response = await fetch('/api/organizations/onboarding')
  if (!response.ok) {
    throw new Error('Failed to fetch onboarding progress')
  }
  const data = await response.json()
  return data.progress || defaultProgress
}

async function updateOnboardingProgress(updates: Partial<OnboardingProgress>): Promise<OnboardingProgress> {
  const response = await fetch('/api/organizations/onboarding', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  })
  if (!response.ok) {
    throw new Error('Failed to update onboarding progress')
  }
  const data = await response.json()
  return data.progress
}

export function useOnboardingProgress() {
  const queryClient = useQueryClient()

  const { data: progress, isLoading, error } = useQuery({
    queryKey: ['onboarding-progress'],
    queryFn: fetchOnboardingProgress,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: true
  })

  const mutation = useMutation({
    mutationFn: updateOnboardingProgress,
    onMutate: async (updates) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['onboarding-progress'] })

      // Snapshot current value
      const previousProgress = queryClient.getQueryData<OnboardingProgress>(['onboarding-progress'])

      // Optimistically update
      queryClient.setQueryData<OnboardingProgress>(['onboarding-progress'], (old) => ({
        ...defaultProgress,
        ...old,
        ...updates
      }))

      return { previousProgress }
    },
    onError: (err, updates, context) => {
      // Rollback on error
      if (context?.previousProgress) {
        queryClient.setQueryData(['onboarding-progress'], context.previousProgress)
      }
    },
    onSettled: () => {
      // Refetch to ensure consistency
      queryClient.invalidateQueries({ queryKey: ['onboarding-progress'] })
    }
  })

  const updateProgress = async (updates: Partial<OnboardingProgress>) => {
    await mutation.mutateAsync(updates)
  }

  return {
    progress: progress || defaultProgress,
    isLoading,
    error,
    updateProgress,
    isUpdating: mutation.isPending
  }
}
