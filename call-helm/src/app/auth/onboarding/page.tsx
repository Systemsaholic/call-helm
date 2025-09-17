'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, User, Lock, CheckCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function OnboardingPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [step, setStep] = useState(1)
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
    fullName: '',
    phone: ''
  })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth/login')
    }
  }, [user, loading, router])

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long')
      return
    }

    setIsSubmitting(true)

    try {
      // Update password
      const { error: passwordError } = await supabase.auth.updateUser({
        password: formData.password
      })

      if (passwordError) throw passwordError

      // Update user metadata
      const { error: metadataError } = await supabase.auth.updateUser({
        data: {
          full_name: formData.fullName,
          phone: formData.phone,
          onboarding_completed: true
        }
      })

      if (metadataError) throw metadataError

      // Update profile if needed
      if (user?.id) {
        await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            full_name: formData.fullName,
            phone: formData.phone,
            updated_at: new Date().toISOString()
          })
      }

      setStep(3)
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)
    } catch (err: any) {
      setError(err.message || 'Failed to update account')
      setIsSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Welcome to Call Helm!
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            {step === 1 ? 'Set up your password to secure your account' :
             step === 2 ? 'Complete your profile information' :
             'Your account is ready!'}
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center space-x-4">
          <div className={`flex items-center ${step >= 1 ? 'text-primary' : 'text-gray-400'}`}>
            <div className={`rounded-full p-2 ${step >= 1 ? 'bg-primary text-white' : 'bg-gray-200'}`}>
              <Lock className="h-4 w-4" />
            </div>
            <span className="ml-2 text-sm font-medium">Password</span>
          </div>
          <div className={`w-12 h-0.5 ${step >= 2 ? 'bg-primary' : 'bg-gray-200'}`} />
          <div className={`flex items-center ${step >= 2 ? 'text-primary' : 'text-gray-400'}`}>
            <div className={`rounded-full p-2 ${step >= 2 ? 'bg-primary text-white' : 'bg-gray-200'}`}>
              <User className="h-4 w-4" />
            </div>
            <span className="ml-2 text-sm font-medium">Profile</span>
          </div>
          <div className={`w-12 h-0.5 ${step >= 3 ? 'bg-primary' : 'bg-gray-200'}`} />
          <div className={`flex items-center ${step >= 3 ? 'text-primary' : 'text-gray-400'}`}>
            <div className={`rounded-full p-2 ${step >= 3 ? 'bg-primary text-white' : 'bg-gray-200'}`}>
              <CheckCircle className="h-4 w-4" />
            </div>
            <span className="ml-2 text-sm font-medium">Complete</span>
          </div>
        </div>

        {step === 1 && (
          <form className="mt-8 space-y-6" onSubmit={(e) => { e.preventDefault(); setStep(2) }}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Enter a strong password"
                  className="mt-1"
                />
                <p className="text-xs text-gray-500 mt-1">Must be at least 8 characters</p>
              </div>
              <div>
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                  placeholder="Confirm your password"
                  className="mt-1"
                />
              </div>
            </div>
            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
        )}

        {step === 2 && (
          <form className="mt-8 space-y-6" onSubmit={handleUpdatePassword}>
            <div className="space-y-4">
              <div>
                <Label htmlFor="fullName">Full Name</Label>
                <Input
                  id="fullName"
                  name="fullName"
                  type="text"
                  required
                  value={formData.fullName}
                  onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                  placeholder="Enter your full name"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="phone">Phone Number (Optional)</Label>
                <Input
                  id="phone"
                  name="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  placeholder="Enter your phone number"
                  className="mt-1"
                />
              </div>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep(1)}
                className="w-full"
                disabled={isSubmitting}
              >
                Back
              </Button>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  'Complete Setup'
                )}
              </Button>
            </div>
          </form>
        )}

        {step === 3 && (
          <div className="mt-8 text-center space-y-4">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 p-3">
                <CheckCircle className="h-12 w-12 text-green-600" />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900">Account Setup Complete!</h3>
            <p className="text-gray-600">
              Your account has been successfully set up. Redirecting to dashboard...
            </p>
            <div className="flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          </div>
        )}

        <div className="text-center text-sm text-gray-600">
          <p>
            Logged in as: <span className="font-medium">{user?.email}</span>
          </p>
        </div>
      </div>
    </div>
  )
}