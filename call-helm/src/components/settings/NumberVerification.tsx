'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
  InputOTPSeparator,
} from '@/components/ui/input-otp'
import {
  Phone,
  ArrowRight,
  Loader2,
  CheckCircle,
  AlertCircle,
  MessageSquare,
  ArrowLeft
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/hooks/useAuth'

interface NumberVerificationProps {
  onComplete: () => void
  onBack?: () => void
}

export function NumberVerification({ onComplete, onBack }: NumberVerificationProps) {
  const { supabase } = useAuth()
  const [step, setStep] = useState<'enter' | 'verify'>('enter')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)

  // Format phone number as user types
  const formatPhoneNumber = (value: string) => {
    const cleaned = value.replace(/\D/g, '')
    const match = cleaned.match(/^(\d{0,3})(\d{0,3})(\d{0,4})$/)
    
    if (!match) return value
    
    const parts = []
    if (match[1]) parts.push(match[1])
    if (match[2]) parts.push(match[2])
    if (match[3]) parts.push(match[3])
    
    if (parts.length === 0) return ''
    if (parts.length === 1) return parts[0]
    if (parts.length === 2) return `(${parts[0]}) ${parts[1]}`
    return `(${parts[0]}) ${parts[1]}-${parts[2]}`
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value)
    setPhoneNumber(formatted)
  }

  const handleSendCode = async () => {
    // Validate phone number
    const cleaned = phoneNumber.replace(/\D/g, '')
    if (cleaned.length !== 10) {
      toast.error('Please enter a valid 10-digit phone number')
      return
    }

    setSending(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!member) throw new Error('Organization not found')

      // Format number with country code
      const formattedNumber = `+1${cleaned}`

      // Start verification process
      const { data, error } = await supabase
        .rpc('start_phone_verification', {
          p_org_id: member.organization_id,
          p_phone_number: formattedNumber
        })

      if (error) throw error

      // Send verification code via API
      const response = await fetch('/api/voice/verify/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: formattedNumber })
      })

      if (!response.ok) {
        throw new Error('Failed to send verification code')
      }

      toast.success('Verification code sent to your phone')
      setStep('verify')
      
      // Start resend timer
      setResendTimer(60)
      const interval = setInterval(() => {
        setResendTimer(prev => {
          if (prev <= 1) {
            clearInterval(interval)
            return 0
          }
          return prev - 1
        })
      }, 1000)
    } catch (error) {
      console.error('Error sending verification code:', error)
      toast.error('Failed to send verification code')
    } finally {
      setSending(false)
    }
  }

  const handleVerifyCode = async () => {
    if (verificationCode.length !== 6) {
      toast.error('Please enter the complete 6-digit code')
      return
    }

    setVerifying(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!member) throw new Error('Organization not found')

      // Verify the code
      const { data, error } = await supabase
        .rpc('verify_phone_number', {
          p_org_id: member.organization_id,
          p_code: verificationCode
        })

      if (error) throw error

      if (!data.success) {
        throw new Error(data.error || 'Invalid verification code')
      }

      toast.success('Phone number verified successfully!')
      onComplete()
    } catch (error: any) {
      console.error('Error verifying code:', error)
      toast.error(error.message || 'Invalid or expired verification code')
    } finally {
      setVerifying(false)
    }
  }

  const handleResendCode = async () => {
    if (resendTimer > 0) return
    setVerificationCode('')
    await handleSendCode()
  }

  if (step === 'enter') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verify Your Business Number</CardTitle>
          <CardDescription>
            We'll send a verification code to confirm you own this number
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="phone">Business Phone Number</Label>
            <div className="relative mt-2">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">+1</span>
              </div>
              <Input
                id="phone"
                type="tel"
                placeholder="(555) 123-4567"
                value={phoneNumber}
                onChange={handlePhoneChange}
                className="pl-12"
                maxLength={14}
              />
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Enter your US business phone number. This will be your caller ID for outbound calls.
            </p>
          </div>

          <Alert>
            <MessageSquare className="h-4 w-4" />
            <AlertDescription>
              We'll send a 6-digit code via SMS to verify ownership of this number.
            </AlertDescription>
          </Alert>

          <div className="flex gap-3">
            {onBack && (
              <Button variant="outline" onClick={onBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
            <Button 
              onClick={handleSendCode} 
              disabled={sending || phoneNumber.replace(/\D/g, '').length !== 10}
              className="flex-1"
            >
              {sending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending Code...
                </>
              ) : (
                <>
                  Send Verification Code
                  <ArrowRight className="h-4 w-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enter Verification Code</CardTitle>
        <CardDescription>
          We sent a 6-digit code to {phoneNumber}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex justify-center">
          <InputOTP 
            maxLength={6} 
            value={verificationCode}
            onChange={setVerificationCode}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
            </InputOTPGroup>
            <InputOTPSeparator />
            <InputOTPGroup>
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
        </div>

        {resendTimer > 0 ? (
          <p className="text-center text-sm text-gray-600">
            Resend code in {resendTimer} seconds
          </p>
        ) : (
          <Button 
            variant="link" 
            onClick={handleResendCode}
            className="w-full"
            disabled={sending}
          >
            Didn't receive code? Resend
          </Button>
        )}

        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={() => setStep('enter')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Change Number
          </Button>
          <Button 
            onClick={handleVerifyCode} 
            disabled={verifying || verificationCode.length !== 6}
            className="flex-1"
          >
            {verifying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Verify Number
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}