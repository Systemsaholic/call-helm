import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'

export interface OrganizationSettings {
  organization_id: string
  website: string | null
  language: string
  date_format: string
  time_format: string
  auto_record_calls: boolean
  enable_transcription: boolean
  enable_ai_analysis: boolean
  notification_preferences: Record<string, any>
  billing_email: string | null
  created_at: string
  updated_at: string
}

export function useOrganizationSettings() {
  const { user, supabase } = useAuth()
  const [settings, setSettings] = useState<OrganizationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      fetchSettings()
    }
  }, [user])

  const fetchSettings = async () => {
    if (!user) return

    try {
      setLoading(true)
      
      // First, get the user's organization ID from organization_members
      const { data: member, error: memberError } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .single()

      if (memberError) {
        console.error('Error fetching organization member:', memberError)
        throw new Error(memberError.message || 'Failed to fetch organization membership')
      }
      
      if (!member?.organization_id) {
        console.log('No active organization membership found for user:', user.id)
        throw new Error('No active organization found for user. Please ensure you have been added to an organization.')
      }

      // Fetch organization settings
      const { data, error } = await supabase
        .from('organization_settings')
        .select('*')
        .eq('organization_id', member.organization_id)
        .single()

      if (error && error.code === 'PGRST116') {
        // Settings don't exist, create default settings
        console.log('Organization settings not found, creating defaults for org:', member.organization_id)
        const { data: newSettings, error: insertError } = await supabase
          .from('organization_settings')
          .insert({
            organization_id: member.organization_id,
            notification_preferences: {}
          })
          .select()
          .single()

        if (insertError) {
          console.error('Error creating default organization settings:', insertError)
          throw insertError
        }
        setSettings(newSettings)
      } else if (error) {
        console.error('Error fetching organization settings:', error)
        throw error
      } else {
        setSettings(data)
      }
    } catch (err) {
      // Provide more detailed error logging
      console.error('Error in fetchSettings:', {
        error: err,
        message: err instanceof Error ? err.message : 'Unknown error',
        code: (err as any)?.code,
        details: (err as any)?.details,
        hint: (err as any)?.hint,
        userId: user?.id
      })
      setError(err instanceof Error ? err.message : 'Failed to fetch organization settings')
    } finally {
      setLoading(false)
    }
  }

  const updateSettings = async (updates: Partial<OrganizationSettings>) => {
    if (!settings) return { error: 'No organization settings loaded' }

    try {
      const { data, error } = await supabase
        .from('organization_settings')
        .update(updates)
        .eq('organization_id', settings.organization_id)
        .select()
        .single()

      if (error) throw error
      setSettings(data)
      return { data, error: null }
    } catch (err) {
      console.error('Error updating organization settings:', err)
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Failed to update organization settings' 
      }
    }
  }

  const updateNotificationPreferences = async (preferences: Record<string, any>) => {
    return updateSettings({ 
      notification_preferences: preferences 
    })
  }

  return {
    settings,
    loading,
    error,
    updateSettings,
    updateNotificationPreferences,
    refetch: fetchSettings
  }
}