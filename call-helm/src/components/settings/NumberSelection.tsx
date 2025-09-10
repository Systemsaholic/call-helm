'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Badge } from '@/components/ui/badge'
import {
  Phone,
  Search,
  MapPin,
  Loader2,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  PhoneForwarded,
  Info
} from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/hooks/useAuth'

interface AvailableNumber {
  phoneNumber: string
  friendlyName: string
  locality: string
  region: string
  postalCode: string
  capabilities: {
    voice: boolean
    sms: boolean
    mms: boolean
  }
  monthlyPrice: number
}

interface NumberSelectionProps {
  onComplete: () => void
  onBack?: () => void
}

export function NumberSelection({ onComplete, onBack }: NumberSelectionProps) {
  const { supabase } = useAuth()
  const [step, setStep] = useState<'search' | 'forwarding'>('search')
  const [searching, setSearching] = useState(false)
  const [provisioning, setProvisioning] = useState(false)
  const [areaCode, setAreaCode] = useState('')
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([])
  const [selectedNumber, setSelectedNumber] = useState<string>('')
  const [forwardingNumber, setForwardingNumber] = useState('')

  const handleSearch = async () => {
    if (!areaCode || areaCode.length !== 3) {
      toast.error('Please enter a valid 3-digit area code')
      return
    }

    setSearching(true)
    try {
      const response = await fetch('/api/voice/numbers/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ areaCode })
      })

      if (!response.ok) {
        throw new Error('Failed to search numbers')
      }

      const data = await response.json()
      setAvailableNumbers(data.numbers || [])

      if (data.numbers.length === 0) {
        toast.error('No numbers available in this area code. Try another.')
      }
    } catch (error) {
      console.error('Error searching numbers:', error)
      toast.error('Failed to search available numbers')
    } finally {
      setSearching(false)
    }
  }

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

  const handleForwardingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhoneNumber(e.target.value)
    setForwardingNumber(formatted)
  }

  const handleProvisionNumber = async () => {
    if (!selectedNumber) {
      toast.error('Please select a number')
      return
    }

    if (!forwardingNumber || forwardingNumber.replace(/\D/g, '').length !== 10) {
      toast.error('Please enter a valid forwarding number')
      return
    }

    setProvisioning(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: member } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .single()

      if (!member) throw new Error('Organization not found')

      // Format forwarding number with country code
      const formattedForwarding = `+1${forwardingNumber.replace(/\D/g, '')}`

      // Provision the number
      const response = await fetch('/api/voice/numbers/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phoneNumber: selectedNumber,
          forwardingNumber: formattedForwarding,
          organizationId: member.organization_id
        })
      })

      if (!response.ok) {
        throw new Error('Failed to provision number')
      }

      toast.success('Phone number provisioned successfully!')
      onComplete()
    } catch (error) {
      console.error('Error provisioning number:', error)
      toast.error('Failed to provision phone number')
    } finally {
      setProvisioning(false)
    }
  }

  if (step === 'search') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Choose a Phone Number</CardTitle>
          <CardDescription>
            Search for available numbers in your area
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <Label htmlFor="area-code">Area Code</Label>
            <div className="flex gap-2 mt-2">
              <Input
                id="area-code"
                type="text"
                placeholder="555"
                value={areaCode}
                onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                maxLength={3}
                className="w-24"
              />
              <Button 
                onClick={handleSearch}
                disabled={searching || areaCode.length !== 3}
              >
                {searching ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Search Numbers
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Enter a 3-digit area code to find available numbers
            </p>
          </div>

          {availableNumbers.length > 0 && (
            <div>
              <Label className="mb-3">Available Numbers</Label>
              <RadioGroup value={selectedNumber} onValueChange={setSelectedNumber}>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {availableNumbers.map((number) => (
                    <label
                      key={number.phoneNumber}
                      className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 data-[state=checked]:border-primary"
                    >
                      <RadioGroupItem value={number.phoneNumber} className="mt-1" />
                      <div className="flex-1">
                        <div className="font-medium">
                          {number.phoneNumber.replace(/^\+1/, '').replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-600">
                            <MapPin className="h-3 w-3 inline mr-1" />
                            {number.locality}, {number.region}
                          </span>
                          {number.capabilities.sms && (
                            <Badge variant="outline" className="text-xs">SMS</Badge>
                          )}
                        </div>
                      </div>
                      <span className="text-sm text-gray-600">
                        ${number.monthlyPrice}/mo
                      </span>
                    </label>
                  ))}
                </div>
              </RadioGroup>
            </div>
          )}

          <div className="flex gap-3">
            {onBack && (
              <Button variant="outline" onClick={onBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            )}
            <Button 
              onClick={() => setStep('forwarding')}
              disabled={!selectedNumber}
              className="flex-1"
            >
              Continue
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Set Up Call Forwarding</CardTitle>
        <CardDescription>
          Where should we forward incoming calls?
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-gray-600" />
            <span className="text-sm font-medium">Selected Number:</span>
            <span className="text-sm">
              {selectedNumber.replace(/^\+1/, '').replace(/(\d{3})(\d{3})(\d{4})/, '($1) $2-$3')}
            </span>
          </div>
        </div>

        <div>
          <Label htmlFor="forwarding">Forwarding Number</Label>
          <div className="relative mt-2">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <span className="text-gray-500 sm:text-sm">+1</span>
            </div>
            <Input
              id="forwarding"
              type="tel"
              placeholder="(555) 987-6543"
              value={forwardingNumber}
              onChange={handleForwardingChange}
              className="pl-12"
              maxLength={14}
            />
          </div>
          <p className="text-xs text-gray-600 mt-2">
            Incoming calls to your new number will be forwarded here (your mobile or office phone)
          </p>
        </div>

        <Alert className="bg-primary/10 border-primary/20">
          <Info className="h-4 w-4 text-primary" />
          <AlertDescription className="text-gray-700">
            <strong>How it works:</strong>
            <ul className="mt-2 space-y-1 text-sm">
              <li>• Outbound calls will show your new number as caller ID</li>
              <li>• Incoming calls will be forwarded to your phone</li>
              <li>• All calls are automatically recorded and tracked</li>
            </ul>
          </AlertDescription>
        </Alert>

        <div className="flex gap-3">
          <Button 
            variant="outline" 
            onClick={() => setStep('search')}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Button 
            onClick={handleProvisionNumber}
            disabled={provisioning || !forwardingNumber || forwardingNumber.replace(/\D/g, '').length !== 10}
            className="flex-1"
          >
            {provisioning ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Setting Up Number...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                Complete Setup
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}