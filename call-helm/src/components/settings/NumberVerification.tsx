'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
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
  ArrowLeft,
  PhoneCall
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/hooks/useAuth'

interface NumberVerificationProps {
  onComplete: () => void
  onBack?: () => void
}

type VerificationChannel = 'call' | 'sms'
type PhoneNumberType = 'mobile' | 'landline' | 'voip' | 'unknown'

export function NumberVerification({ onComplete, onBack }: NumberVerificationProps) {
  const { supabase } = useAuth()
  const [step, setStep] = useState<'enter' | 'verify'>('enter')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [resendTimer, setResendTimer] = useState(0)
  const [verificationChannel, setVerificationChannel] = useState<VerificationChannel>('call')
  const [phoneType, setPhoneType] = useState<PhoneNumberType | null>(null)
  const [lookingUp, setLookingUp] = useState(false)

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
    // Reset phone type when number changes
    setPhoneType(null)
  }

  // Lookup phone number type when user finishes entering number
  const lookupPhoneType = async (number: string) => {
    const cleaned = number.replace(/\D/g, '')
    if (cleaned.length !== 10) return

    setLookingUp(true)
    try {
      const formattedNumber = `+1${cleaned}`
      const response = await fetch(`/api/voice/verify/send?phoneNumber=${encodeURIComponent(formattedNumber)}`)

      if (response.ok) {
        const data = await response.json()
        setPhoneType(data.type)

        // Auto-select recommended channel
        if (data.type === 'landline') {
          setVerificationChannel('call')
          toast.info('Landline detected - voice call verification will be used')
        } else if (data.type === 'mobile') {
          // For mobile, default to call but allow SMS
          setVerificationChannel('call')
        }
      }
    } catch (error) {
      console.error('Failed to lookup phone type:', error)
    } finally {
      setLookingUp(false)
    }
  }

  // Trigger lookup when phone number is complete
  useEffect(() => {
    const cleaned = phoneNumber.replace(/\D/g, '')
    if (cleaned.length === 10 && phoneType === null) {
      lookupPhoneType(phoneNumber)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phoneNumber])

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
        body: JSON.stringify({
          phoneNumber: formattedNumber,
          channel: verificationChannel
        })
      })

      if (!response.ok) {
        throw new Error('Failed to send verification code')
      }

      const result = await response.json()
      toast.success(
        verificationChannel === 'call'
          ? 'Verification call initiated - please answer your phone!'
          : 'Verification code sent via SMS'
      )
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
              Enter your US or Canadian business phone number. This will be your caller ID for outbound calls.
            </p>
            {lookingUp && (
              <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Detecting phone type...
              </p>
            )}
            {phoneType && !lookingUp && (
              <p className="text-xs text-green-600 mt-1">
                {phoneType === 'mobile' && 'Mobile phone detected'}
                {phoneType === 'landline' && 'Landline detected'}
                {phoneType === 'voip' && 'VoIP phone detected'}
                {phoneType === 'unknown' && 'Phone type: Unknown'}
              </p>
            )}
          </div>

          {/* Verification Method Selection */}
          <div className="space-y-3">
            <Label>Verification Method</Label>
            <RadioGroup
              value={verificationChannel}
              onValueChange={(value) => setVerificationChannel(value as VerificationChannel)}
              className="grid grid-cols-2 gap-4"
              disabled={phoneType === 'landline'} // Force call for landlines
            >
              <Label
                htmlFor="call"
                className={`flex flex-col items-center justify-between rounded-md border-2 p-4 cursor-pointer transition-colors ${
                  verificationChannel === 'call'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/50'
                }`}
              >
                <RadioGroupItem value="call" id="call" className="sr-only" />
                <PhoneCall className="h-6 w-6 mb-2" />
                <span className="text-sm font-medium">Voice Call</span>
                <span className="text-xs text-muted-foreground text-center mt-1">
                  Works for all phones
                </span>
              </Label>
              <Label
                htmlFor="sms"
                className={`flex flex-col items-center justify-between rounded-md border-2 p-4 cursor-pointer transition-colors ${
                  verificationChannel === 'sms'
                    ? 'border-primary bg-primary/5'
                    : 'border-muted hover:border-muted-foreground/50'
                } ${phoneType === 'landline' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <RadioGroupItem
                  value="sms"
                  id="sms"
                  className="sr-only"
                  disabled={phoneType === 'landline'}
                />
                <MessageSquare className="h-6 w-6 mb-2" />
                <span className="text-sm font-medium">SMS Text</span>
                <span className="text-xs text-muted-foreground text-center mt-1">
                  Mobile phones only
                </span>
              </Label>
            </RadioGroup>
            {phoneType === 'landline' && (
              <p className="text-xs text-amber-600">
                Landline detected - SMS is not available. Voice call will be used.
              </p>
            )}
          </div>

          <Alert>
            {verificationChannel === 'call' ? (
              <>
                <PhoneCall className="h-4 w-4" />
                <AlertDescription>
                  We'll call your phone and speak a 6-digit verification code. Make sure you can answer the call.
                </AlertDescription>
              </>
            ) : (
              <>
                <MessageSquare className="h-4 w-4" />
                <AlertDescription>
                  We'll send a 6-digit code via SMS to verify ownership of this number.
                </AlertDescription>
              </>
            )}
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
                  {verificationChannel === 'call' ? 'Initiating Call...' : 'Sending Code...'}
                </>
              ) : (
                <>
                  {verificationChannel === 'call' ? 'Call Me Now' : 'Send SMS Code'}
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
          {verificationChannel === 'call'
            ? `We're calling ${phoneNumber} with your verification code`
            : `We sent a 6-digit code to ${phoneNumber}`}
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
            {verificationChannel === 'call' ? 'Call again' : 'Resend code'} in {resendTimer} seconds
          </p>
        ) : (
          <Button
            variant="link"
            onClick={handleResendCode}
            className="w-full"
            disabled={sending}
          >
            {verificationChannel === 'call'
              ? "Didn't receive the call? Call me again"
              : "Didn't receive code? Resend"}
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