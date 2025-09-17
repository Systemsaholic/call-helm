'use client'

import { useEffect, useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)
      } catch (error) {
        console.error('Error fetching user:', error)
      } finally {
        setLoading(false)
      }
    }

    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase])

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return {
    user,
    loading,
    signOut,
    supabase,
  }
}

// Hook to get organization members
export function useOrganizationMembers() {
  const { supabase, user } = useAuth()
  
  return useQuery({
    queryKey: ['organization-members'],
    queryFn: async () => {
      // Get current user's organization
      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user?.id)
        .single()
      
      if (!member) return []
      
      // Get all members of the organization
      const { data: members, error } = await supabase
        .from('organization_members')
        .select('*')
        .eq('organization_id', member.organization_id)
        .order('created_at', { ascending: false })
      
      if (error) throw error
      return members || []
    },
    enabled: !!user,
  })
}