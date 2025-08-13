'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Building2, Users, Phone, ChevronRight, Loader2, CheckCircle } from 'lucide-react'

export default function OnboardingPage() {
  const router = useRouter()
  const { user, loading, supabase } = useAuth()
  const [step, setStep] = useState(1)
  const [orgName, setOrgName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    // Get organization name from localStorage (set during signup)
    const pendingOrgName = localStorage.getItem('pending_org_name')
    const pendingUserName = localStorage.getItem('pending_user_name')
    
    if (pendingOrgName) {
      setOrgName(pendingOrgName)
      localStorage.removeItem('pending_org_name')
    }
    
    if (pendingUserName) {
      localStorage.removeItem('pending_user_name')
    }
  }, [])

  const handleCompleteSetup = async () => {
    if (!user) return
    
    setCreating(true)
    
    try {
      // Create organization
      const orgSlug = orgName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .insert({
          name: orgName || 'My Organization',
          slug: orgSlug + '-' + Date.now(),
        })
        .select()
        .single()

      if (orgError) {
        console.error('Error creating organization:', orgError)
        return
      }

      // Create profile if it doesn't exist
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          id: user.id,
          email: user.email!,
          full_name: user.user_metadata?.full_name || '',
        })

      if (profileError) {
        console.error('Error creating profile:', profileError)
        return
      }

      // Create organization member
      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({
          organization_id: org.id,
          user_id: user.id,
          role: 'org_admin',
        })

      if (memberError) {
        console.error('Error creating member:', memberError)
        return
      }

      // Redirect to dashboard
      router.push('/dashboard')
    } catch (error) {
      console.error('Error during onboarding:', error)
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  if (!user) {
    router.push('/auth/login')
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Welcome to Call Helm!</h1>
          <p className="mt-2 text-gray-600">Let's get your call center set up in just a few steps</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-8">
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 mb-4">
                  <Building2 className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Organization Setup</h2>
                <p className="text-gray-600">First, let's confirm your organization details</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Organization Name
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-primary focus:border-primary"
                  placeholder="Acme Call Center"
                />
              </div>

              <Button
                className="w-full"
                onClick={() => setStep(2)}
                disabled={!orgName}
              >
                Continue
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 mb-4">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">Invite Your Team</h2>
                <p className="text-gray-600">You can invite team members now or later from the dashboard</p>
              </div>

              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">
                  As an organization admin, you'll be able to:
                </p>
                <ul className="mt-2 space-y-1 text-sm text-gray-600">
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    Invite and manage team members
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    Set up call routing and campaigns
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    Access analytics and reports
                  </li>
                  <li className="flex items-start">
                    <CheckCircle className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                    Configure AI analysis settings
                  </li>
                </ul>
              </div>

              <div className="flex space-x-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(1)}
                >
                  Back
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => setStep(3)}
                >
                  Continue
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 mb-4">
                  <Phone className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">You're All Set!</h2>
                <p className="text-gray-600">Your organization is ready to start managing calls</p>
              </div>

              <div className="space-y-3">
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900">Organization created</p>
                    <p className="text-sm text-gray-600">{orgName}</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900">Admin access granted</p>
                    <p className="text-sm text-gray-600">You have full control over your organization</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-gray-900">Ready to go</p>
                    <p className="text-sm text-gray-600">Start by uploading call recordings or inviting agents</p>
                  </div>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleCompleteSetup}
                disabled={creating}
              >
                {creating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    Go to Dashboard
                    <ChevronRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}