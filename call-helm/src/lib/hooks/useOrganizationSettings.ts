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
      
      // First, get the user's organization ID from their profile
      const { data: profile, error: profileError } = await supabase
        .from('user_profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (profileError || !profile?.organization_id) {
        throw new Error('No organization found for user')
      }

      // Fetch organization settings
      const { data, error } = await supabase
        .from('organization_settings')
        .select('*')
        .eq('organization_id', profile.organization_id)
        .single()

      if (error && error.code === 'PGRST116') {
        // Settings don't exist, create default settings
        const { data: newSettings, error: insertError } = await supabase
          .from('organization_settings')
          .insert({
            organization_id: profile.organization_id,
            notification_preferences: {}
          })
          .select()
          .single()

        if (insertError) throw insertError
        setSettings(newSettings)
      } else if (error) {
        throw error
      } else {
        setSettings(data)
      }
    } catch (err) {
      console.error('Error fetching organization settings:', err)
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