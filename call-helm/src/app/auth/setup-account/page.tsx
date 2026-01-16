'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, User, Lock, Building2 } from 'lucide-react'
import { toast } from 'sonner'

type SetupMode = 'loading' | 'invited' | 'new_signup' | 'has_org'

export default function SetupAccountPage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(true)
  const [setupMode, setSetupMode] = useState<SetupMode>('loading')
  const [error, setError] = useState<string | null>(null)
  const [isOAuthUser, setIsOAuthUser] = useState(false)
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
    fullName: '',
    phone: '',
    organizationName: ''
  })

  // Check user status on mount
  useEffect(() => {
    checkUserStatus()
  }, [])

  const checkUserStatus = async () => {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError || !user) {
        // No user, redirect to login
        router.push('/auth/login')
        return
      }

      // Check if user signed in with OAuth
      const providers = user.app_metadata?.providers || []
      const isOAuth = providers.includes('google') || providers.includes('github')
      setIsOAuthUser(isOAuth)

      // Pre-fill name from user metadata
      if (user.user_metadata?.full_name) {
        setFormData(prev => ({ ...prev, fullName: user.user_metadata?.full_name || '' }))
      }

      // Check if user has an organization membership
      const { data: membership } = await supabase
        .from('organization_members')
        .select('id, organization_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (membership) {
        // User already has an organization - might be an invited user
        if (user.user_metadata?.onboarding_completed) {
          // Already onboarded, go to dashboard
          router.push('/dashboard')
          return
        }
        setSetupMode('invited')
      } else {
        // New user - needs to create an organization
        // Check localStorage for pending organization name from signup
        const pendingOrgName = localStorage.getItem('pending_org_name')
        const pendingUserName = localStorage.getItem('pending_user_name')

        if (pendingOrgName) {
          setFormData(prev => ({
            ...prev,
            organizationName: pendingOrgName,
            fullName: pendingUserName || prev.fullName
          }))
        }

        setSetupMode('new_signup')
      }
    } catch (err) {
      console.error('Error checking user status:', err)
      setError('Failed to check account status')
    } finally {
      setCheckingStatus(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (userError || !user) {
        throw new Error('No authenticated user found. Please try logging in again.')
      }

      // For non-OAuth users, validate and set password
      if (!isOAuthUser) {
        if (formData.password !== formData.confirmPassword) {
          throw new Error('Passwords do not match')
        }
        if (formData.password.length < 8) {
          throw new Error('Password must be at least 8 characters long')
        }
      }

      // For new signups, create organization first
      if (setupMode === 'new_signup') {
        if (!formData.organizationName.trim()) {
          throw new Error('Organization name is required')
        }
        if (!formData.fullName.trim()) {
          throw new Error('Full name is required')
        }

        // Call API to create organization
        const response = await fetch('/api/organizations/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            organizationName: formData.organizationName.trim(),
            fullName: formData.fullName.trim()
          })
        })

        const result = await response.json()

        if (!response.ok) {
          if (response.status === 409) {
            // User already has an org, just continue
            console.log('User already has organization, continuing setup')
          } else {
            throw new Error(result.error || 'Failed to create organization')
          }
        }

        // Clear localStorage
        localStorage.removeItem('pending_org_name')
        localStorage.removeItem('pending_user_name')
      }

      // Update user metadata and password (if not OAuth)
      const updateData: { password?: string; data: Record<string, any> } = {
        data: {
          full_name: formData.fullName,
          phone: formData.phone,
          onboarding_completed: true
        }
      }

      if (!isOAuthUser && formData.password) {
        updateData.password = formData.password
      }

      const { error: updateError } = await supabase.auth.updateUser(updateData)

      if (updateError) {
        throw updateError
      }

      // For invited users, update their organization member profile
      if (setupMode === 'invited' && user.user_metadata?.organization_member_id) {
        const { error: memberError } = await supabase
          .from('organization_members')
          .update({
            full_name: formData.fullName || user.user_metadata.full_name,
            phone: formData.phone,
            status: 'active',
            is_active: true,
            joined_at: new Date().toISOString()
          })
          .eq('id', user.user_metadata.organization_member_id)

        if (memberError) {
          console.error('Failed to update member profile:', memberError)
        }
      }

      toast.success('Account setup complete!')

      // Force a page refresh to get updated user metadata
      window.location.href = '/dashboard'
    } catch (err) {
      console.error('Setup error:', err)
      setError(err instanceof Error ? err.message : 'Failed to set up account')
    } finally {
      setLoading(false)
    }
  }

  if (checkingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="mt-2 text-gray-600">Checking account status...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">
            {setupMode === 'new_signup' ? 'Create your organization' : 'Welcome! Let\'s set up your account'}
          </CardTitle>
          <CardDescription>
            {setupMode === 'new_signup'
              ? 'Complete your profile to get started with Call Helm'
              : 'Please complete your profile to get started'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="fullName">
                <User className="inline h-4 w-4 mr-1" />
                Full Name
              </Label>
              <Input
                id="fullName"
                type="text"
                placeholder="John Doe"
                value={formData.fullName}
                onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                required
              />
            </div>

            {setupMode === 'new_signup' && (
              <div className="space-y-2">
                <Label htmlFor="organizationName">
                  <Building2 className="inline h-4 w-4 mr-1" />
                  Organization Name
                </Label>
                <Input
                  id="organizationName"
                  type="text"
                  placeholder="Acme Call Center"
                  value={formData.organizationName}
                  onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                  required
                />
                <p className="text-xs text-gray-500">
                  This will be your organization's name in Call Helm
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number (Optional)</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+1 (555) 123-4567"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              />
            </div>

            {!isOAuthUser && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="password">
                    <Lock className="inline h-4 w-4 mr-1" />
                    Create Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={8}
                  />
                  <p className="text-xs text-gray-500">Must be at least 8 characters</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">
                    <Lock className="inline h-4 w-4 mr-1" />
                    Confirm Password
                  </Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    required
                    minLength={8}
                  />
                </div>
              </>
            )}

            {isOAuthUser && (
              <p className="text-sm text-gray-500 text-center py-2">
                You're signed in with {formData.fullName ? 'your social account' : 'OAuth'}. No password needed!
              </p>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {setupMode === 'new_signup' ? 'Creating organization...' : 'Setting up account...'}
                </>
              ) : (
                setupMode === 'new_signup' ? 'Create Organization' : 'Complete Setup'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
