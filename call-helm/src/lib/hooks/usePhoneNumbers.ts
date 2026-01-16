import { useState, useEffect } from 'react'
import { useAuth } from './useAuth'
import { toast } from 'sonner'

export interface PhoneNumber {
  id: string
  organization_id: string
  number: string
  friendly_name: string
  capabilities: {
    voice: boolean
    sms: boolean
    mms: boolean
    fax: boolean
  }
  status: 'active' | 'inactive' | 'pending'
  is_primary: boolean
  provider: string
  provider_id?: string
  created_at: string
  updated_at: string
}

export interface VoiceIntegration {
  id: string
  organization_id: string
  provider: string
  is_active: boolean
  api_key?: string
  public_key?: string
  app_id?: string
  phone_numbers: string[]
  default_caller_id?: string
  recording_enabled: boolean
  transcription_enabled: boolean
  voicemail_enabled: boolean
  webhook_url: string
  status_callback_url: string
  settings: Record<string, unknown>
  last_verified_at: string
}

export function usePhoneNumbers() {
  const { supabase, user } = useAuth()
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([])
  const [voiceIntegration, setVoiceIntegration] = useState<VoiceIntegration | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      fetchPhoneNumbers()
      fetchVoiceIntegration()
    }
  }, [user])

  const fetchPhoneNumbers = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/phone-numbers')
      if (!response.ok) {
        throw new Error('Failed to fetch phone numbers')
      }

      const data = await response.json()
      setPhoneNumbers(data.phoneNumbers || [])
    } catch (err) {
      console.error('Error fetching phone numbers:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const fetchVoiceIntegration = async () => {
    try {
      // Get user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single()

      if (!member) return

      // Fetch voice integration settings
      const { data, error } = await supabase
        .from('voice_integrations')
        .select('*')
        .eq('organization_id', member.organization_id)
        .single()

      if (error && error.code !== 'PGRST116') { // Ignore not found error
        console.error('Error fetching voice integration:', error)
      }

      setVoiceIntegration(data)
    } catch (err) {
      console.error('Error fetching voice integration:', err)
    }
  }

  const addPhoneNumber = async (phoneNumber: Omit<PhoneNumber, 'id' | 'organization_id' | 'created_at' | 'updated_at'>) => {
    try {
      const response = await fetch('/api/phone-numbers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(phoneNumber)
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to add phone number')
      }

      const data = await response.json()
      await fetchPhoneNumbers()
      toast.success('Phone number added successfully')
      return data.phoneNumber
    } catch (err) {
      console.error('Error adding phone number:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to add phone number')
      throw err
    }
  }

  const updatePhoneNumber = async (id: string, updates: Partial<PhoneNumber>) => {
    try {
      const response = await fetch('/api/phone-numbers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...updates })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update phone number')
      }

      const data = await response.json()
      await fetchPhoneNumbers()
      toast.success('Phone number updated successfully')
      return data.phoneNumber
    } catch (err) {
      console.error('Error updating phone number:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to update phone number')
      throw err
    }
  }

  const deletePhoneNumber = async (id: string) => {
    try {
      const response = await fetch(`/api/phone-numbers?id=${id}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to delete phone number')
      }

      await fetchPhoneNumbers()
      toast.success('Phone number removed successfully')
    } catch (err) {
      console.error('Error deleting phone number:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to remove phone number')
      throw err
    }
  }

  const configureVoiceIntegration = async (config: {
    apiKey: string
    publicKey?: string
    appId: string
  }) => {
    try {
      const response = await fetch('/api/voice/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          phoneNumbers: phoneNumbers.map(p => p.number),
          webhookUrl: `${window.location.origin}/api/voice/webhook`
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to configure voice integration')
      }

      const data = await response.json()
      await fetchVoiceIntegration()
      toast.success('Voice integration configured successfully')
      return data
    } catch (err) {
      console.error('Error configuring voice integration:', err)
      toast.error(err instanceof Error ? err.message : 'Failed to configure voice integration')
      throw err
    }
  }

  return {
    phoneNumbers,
    voiceIntegration,
    loading,
    error,
    addPhoneNumber,
    updatePhoneNumber,
    deletePhoneNumber,
    configureVoiceIntegration,
    refetch: () => {
      fetchPhoneNumbers()
      fetchVoiceIntegration()
    }
  }
}