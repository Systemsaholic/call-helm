import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { toast } from 'sonner'

export interface Script {
  id: string
  organization_id: string
  call_list_id: string
  name: string
  content: string
  tone?: string
  language?: string
  key_points?: string[]
  context?: string
  version: number
  is_active: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

export interface ScriptInput {
  call_list_id: string
  name: string
  content: string
  tone?: string
  language?: string
  key_points?: string[]
  context?: string
  is_active?: boolean
}

export function useScripts(callListId?: string) {
  const { supabase, user } = useAuth()

  return useQuery({
    queryKey: ['scripts', callListId],
    queryFn: async () => {
      // Get user's organization ID
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .single()

      if (!member?.organization_id) return []

      let query = supabase
        .from('scripts')
        .select('*')
        .eq('organization_id', member.organization_id)
        .order('created_at', { ascending: false })

      if (callListId) {
        query = query.eq('call_list_id', callListId)
      }

      const { data, error } = await query

      if (error) {
        console.error('Error fetching scripts:', error)
        throw error
      }

      return data as Script[]
    },
    enabled: !!user
  })
}

export function useScript(scriptId: string) {
  const { supabase } = useAuth()

  return useQuery({
    queryKey: ['scripts', scriptId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('scripts')
        .select('*')
        .eq('id', scriptId)
        .single()

      if (error) {
        console.error('Error fetching script:', error)
        throw error
      }

      return data as Script
    },
    enabled: !!scriptId
  })
}

export function useCreateScript() {
  const { supabase, user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (script: ScriptInput) => {
      // Get user's organization ID
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .eq('is_active', true)
        .single()

      if (!member?.organization_id) {
        throw new Error('No organization found')
      }

      const { data, error } = await supabase
        .from('scripts')
        .insert({
          ...script,
          organization_id: member.organization_id,
          created_by: user?.id
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating script:', error)
        throw error
      }

      return data
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['scripts'] })
      toast.success('Script created successfully')
    },
    onError: (error) => {
      console.error('Failed to create script:', error)
      toast.error('Failed to create script')
    }
  })
}

export function useUpdateScript() {
  const { supabase } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<ScriptInput>) => {
      const { data, error } = await supabase
        .from('scripts')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('Error updating script:', error)
        throw error
      }

      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scripts'] })
      toast.success('Script updated successfully')
    },
    onError: (error) => {
      console.error('Failed to update script:', error)
      toast.error('Failed to update script')
    }
  })
}

export function useDeleteScript() {
  const { supabase } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (scriptId: string) => {
      const { error } = await supabase
        .from('scripts')
        .delete()
        .eq('id', scriptId)

      if (error) {
        console.error('Error deleting script:', error)
        throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scripts'] })
      toast.success('Script deleted successfully')
    },
    onError: (error) => {
      console.error('Failed to delete script:', error)
      toast.error('Failed to delete script')
    }
  })
}

export function useGenerateScript() {
  return useMutation({
    mutationFn: async ({
      keyPoints,
      tone,
      language,
      context,
      includeScenarios = true
    }: {
      keyPoints: string[]
      tone: string
      language: string
      context?: string
      includeScenarios?: boolean
    }) => {
      // Create a comprehensive prompt that incorporates all user inputs
      const prompt = `Create a professional call script with the following requirements:

Key Points to Include:
${keyPoints.map((point, index) => `${index + 1}. ${point}`).join('\n')}

Tone: ${tone}
Language: ${language}
${includeScenarios ? 'Include Scenario Branches: Yes' : 'Include Scenario Branches: No'}
${context ? `Additional Context: ${context}` : ''}

Please generate a complete call script that naturally incorporates all the key points listed above while maintaining the specified tone and language.`

      // Call the actual AI API endpoint
      const response = await fetch('/api/ai/generate-script', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          tone,
          maxLength: includeScenarios ? 500 : 300,
          campaignType: 'general',
          includeScenarios,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to generate script')
      }

      const result = await response.json()

      return {
        content: result.script,
        tone,
        language,
        keyPoints,
        tokensUsed: result.tokensUsed
      }
    }
  })
}