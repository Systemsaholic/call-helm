import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/hooks/useAuth'

export interface UserProfile {
  id: string
  organization_id: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  timezone: string
  avatar_url: string | null
  bio: string | null
  created_at: string
  updated_at: string
  default_record_calls?: boolean
}

export function useProfile() {
  const { user, supabase } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      fetchProfile()
    }
  }, [user])

  const fetchProfile = async () => {
    if (!user) return

    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error && error.code === 'PGRST116') {
        // Profile doesn't exist, create it
        const { data: newProfile, error: insertError } = await supabase
          .from('user_profiles')
          .insert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata?.full_name || null,
            organization_id: user.user_metadata?.organization_id || null,
          })
          .select()
          .single()

        if (insertError) throw insertError
        setProfile(newProfile)
      } else if (error) {
        throw error
      } else {
        setProfile(data)
      }
    } catch (err) {
      console.error('Error fetching profile:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch profile')
    } finally {
      setLoading(false)
    }
  }

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return { error: 'No user logged in' }

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .update(updates)
        .eq('id', user.id)
        .select()
        .single()

      if (error) throw error
      setProfile(data)
      return { data, error: null }
    } catch (err) {
      console.error('Error updating profile:', err)
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Failed to update profile' 
      }
    }
  }

  const uploadAvatar = async (file: File) => {
    if (!user) return { error: 'No user logged in' }

    try {
      // Generate unique filename
      const fileExt = file.name.split('.').pop()
      const fileName = `${user.id}-${Date.now()}.${fileExt}`
      const filePath = `${user.id}/${fileName}`

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          upsert: true,
          cacheControl: '3600'
        })

      if (uploadError) throw uploadError

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath)

      // Update profile with new avatar URL
      const { data, error: updateError } = await updateProfile({ 
        avatar_url: publicUrl 
      })

      if (updateError) throw updateError

      return { data: publicUrl, error: null }
    } catch (err) {
      console.error('Error uploading avatar:', err)
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Failed to upload avatar' 
      }
    }
  }

  return {
    profile,
    loading,
    error,
    updateProfile,
    uploadAvatar,
    refetch: fetchProfile
  }
}