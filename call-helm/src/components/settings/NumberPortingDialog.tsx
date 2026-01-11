'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  ArrowRight, 
  Loader2, 
  Upload,
  Info,
  CheckCircle,
  Clock
} from 'lucide-react'
import { toast } from 'sonner'
import { validatePhone, formatUSPhone } from '@/lib/utils/phone'

interface NumberPortingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPortingSubmitted?: () => void
}

const US_STATES = [
  { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' }, { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' }, { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' }, { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' }, { value: 'HI', label: 'Hawaii' }, { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' }, { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' }, { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' }, { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' }, { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' }, { value: 'MT', label: 'Montana' }, { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' }, { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' }, { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' }, { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' }, { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' }, { value: 'SD', label: 'South Dakota' }, { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' }, { value: 'UT', label: 'Utah' }, { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' }, { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' }
]

const BUSINESS_TYPES = [
  { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'corporation', label: 'Corporation' },
  { value: 'llc', label: 'Limited Liability Company (LLC)' },
  { value: 'nonprofit', label: 'Non-Profit Organization' }
]

export function NumberPortingDialog({ open, onOpenChange, onPortingSubmitted }: NumberPortingDialogProps) {
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [portingData, setPortingData] = useState({
    // Step 1: Phone Number Info
    phoneNumber: '',
    currentProvider: '',
    
    // Step 2: Account Info
    accountNumber: '',
    pinCode: '',
    
    // Step 3: Contact Info
    authorizedContactName: '',
    authorizedContactEmail: '',
    authorizedContactPhone: '',
    
    // Step 4: Address Info
    billingAddress: {
      street: '',
      city: '',
      state: '',
      zip: '',
      country: 'US'
    },
    serviceAddressSame: true,
    serviceAddress: {
      street: '',
      city: '',
      state: '',
      zip: '',
      country: 'US'
    },
    
    // Step 5: Additional Info
    requestedPortDate: '',
    businessType: '',
    acceptTerms: false
  })

  const formatPhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\D/g, '')
    if (cleaned.length <= 3) return cleaned
    if (cleaned.length <= 6) return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3)}`
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6, 10)}`
  }

  const handlePhoneNumberChange = (value: string) => {
    const formatted = formatPhoneNumber(value)
    setPortingData({ ...portingData, phoneNumber: formatted })
  }

  const validatePhoneInput = (phoneNumber: string): string[] => {
    const validation = validatePhone(phoneNumber)
    return validation.errors
  }

  const validateStep = (stepNumber: number): boolean => {
    switch (stepNumber) {
      case 1:
        const phoneErrors = validatePhoneInput(portingData.phoneNumber)
        return !!(portingData.phoneNumber && portingData.currentProvider && phoneErrors.length === 0)
      case 2:
        return !!(portingData.accountNumber && portingData.pinCode)
      case 3:
        return !!(portingData.authorizedContactName && portingData.authorizedContactEmail && 
                  portingData.authorizedContactPhone)
      case 4:
        const billing = portingData.billingAddress
        const billingValid = !!(billing.street && billing.city && billing.state && billing.zip)
        if (portingData.serviceAddressSame) return billingValid
        
        const service = portingData.serviceAddress
        const serviceValid = !!(service.street && service.city && service.state && service.zip)
        return billingValid && serviceValid
      case 5:
        return portingData.acceptTerms
      default:
        return false
    }
  }

  const nextStep = () => {
    if (validateStep(step)) {
      setStep(step + 1)
    } else {
      toast.error('Please fill in all required fields')
    }
  }

  const submitPortingRequest = async () => {
    if (!validateStep(5)) {
      toast.error('Please complete all required information and accept the terms')
      return
    }

    try {
      setSubmitting(true)

      // Clean phone number for API
      const cleanedPhone = '+1' + portingData.phoneNumber.replace(/\D/g, '')

      const response = await fetch('/api/voice/numbers/porting/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phoneNumber: cleanedPhone,
          currentProvider: portingData.currentProvider,
          accountNumber: portingData.accountNumber,
          pinCode: portingData.pinCode,
          authorizedContactName: portingData.authorizedContactName,
          authorizedContactEmail: portingData.authorizedContactEmail,
          authorizedContactPhone: portingData.authorizedContactPhone,
          billingAddress: portingData.billingAddress,
          serviceAddress: portingData.serviceAddressSame ? null : portingData.serviceAddress,
          requestedPortDate: portingData.requestedPortDate || null
        })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to submit porting request')
      }

      toast.success(`Porting request submitted for ${portingData.phoneNumber}`)
      onPortingSubmitted?.()
      onOpenChange(false)
      
      // Reset form
      setStep(1)
      setPortingData({
        phoneNumber: '',
        currentProvider: '',
        accountNumber: '',
        pinCode: '',
        authorizedContactName: '',
        authorizedContactEmail: '',
        authorizedContactPhone: '',
        billingAddress: { street: '', city: '', state: '', zip: '', country: 'US' },
        serviceAddressSame: true,
        serviceAddress: { street: '', city: '', state: '', zip: '', country: 'US' },
        requestedPortDate: '',
        businessType: '',
        acceptTerms: false
      })
    } catch (error) {
      console.error('Error submitting porting request:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to submit porting request')
    } finally {
      setSubmitting(false)
    }
  }

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="phoneNumber">Phone Number to Port *</Label>
              <Input
                id="phoneNumber"
                placeholder="(555) 123-4567"
                value={portingData.phoneNumber}
                onChange={(e) => handlePhoneNumberChange(e.target.value)}
                maxLength={14}
                className={validatePhoneInput(portingData.phoneNumber).length > 0 && portingData.phoneNumber ? 'border-red-500' : ''}
              />
              {portingData.phoneNumber && validatePhoneInput(portingData.phoneNumber).length > 0 && (
                <p className="text-sm text-red-600">
                  {validatePhoneInput(portingData.phoneNumber)[0]}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="currentProvider">Current Provider *</Label>
              <Input
                id="currentProvider"
                placeholder="e.g., Verizon, AT&T, Sprint, etc."
                value={portingData.currentProvider}
                onChange={(e) => setPortingData({ ...portingData, currentProvider: e.target.value })}
              />
            </div>
          </div>
        )

      case 2:
        return (
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                You'll need your account information from your current provider. This is typically found on your phone bill.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="accountNumber">Account Number *</Label>
              <Input
                id="accountNumber"
                placeholder="Your account number with current provider"
                value={portingData.accountNumber}
                onChange={(e) => setPortingData({ ...portingData, accountNumber: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pinCode">Account PIN/Password *</Label>
              <Input
                id="pinCode"
                type="password"
                placeholder="PIN or account password"
                value={portingData.pinCode}
                onChange={(e) => setPortingData({ ...portingData, pinCode: e.target.value })}
              />
            </div>
          </div>
        )

      case 3:
        return (
          <div className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                The authorized contact must be the person authorized to make changes to the current phone account.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Label htmlFor="contactName">Authorized Contact Name *</Label>
              <Input
                id="contactName"
                placeholder="Full name of account holder"
                value={portingData.authorizedContactName}
                onChange={(e) => setPortingData({ ...portingData, authorizedContactName: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactEmail">Contact Email *</Label>
              <Input
                id="contactEmail"
                type="email"
                placeholder="email@example.com"
                value={portingData.authorizedContactEmail}
                onChange={(e) => setPortingData({ ...portingData, authorizedContactEmail: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contactPhone">Contact Phone *</Label>
              <Input
                id="contactPhone"
                placeholder="(555) 123-4567"
                value={portingData.authorizedContactPhone}
                onChange={(e) => setPortingData({ ...portingData, authorizedContactPhone: e.target.value })}
              />
            </div>
          </div>
        )

      case 4:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <h4 className="font-medium">Billing Address *</h4>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="billingStreet">Street Address *</Label>
                  <Input
                    id="billingStreet"
                    placeholder="123 Main St"
                    value={portingData.billingAddress.street}
                    onChange={(e) => setPortingData({
                      ...portingData,
                      billingAddress: { ...portingData.billingAddress, street: e.target.value }
                    })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="billingCity">City *</Label>
                    <Input
                      id="billingCity"
                      placeholder="San Francisco"
                      value={portingData.billingAddress.city}
                      onChange={(e) => setPortingData({
                        ...portingData,
                        billingAddress: { ...portingData.billingAddress, city: e.target.value }
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="billingState">State *</Label>
                    <Select
                      value={portingData.billingAddress.state}
                      onValueChange={(value) => setPortingData({
                        ...portingData,
                        billingAddress: { ...portingData.billingAddress, state: value }
                      })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map((state) => (
                          <SelectItem key={state.value} value={state.value}>
                            {state.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="billingZip">ZIP Code *</Label>
                  <Input
                    id="billingZip"
                    placeholder="94102"
                    value={portingData.billingAddress.zip}
                    onChange={(e) => setPortingData({
                      ...portingData,
                      billingAddress: { ...portingData.billingAddress, zip: e.target.value }
                    })}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="sameAddress"
                checked={portingData.serviceAddressSame}
                onCheckedChange={(checked) => setPortingData({
                  ...portingData,
                  serviceAddressSame: !!checked
                })}
              />
              <Label htmlFor="sameAddress">Service address is same as billing address</Label>
            </div>

            {!portingData.serviceAddressSame && (
              <div className="space-y-4">
                <h4 className="font-medium">Service Address *</h4>
                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="serviceStreet">Street Address *</Label>
                    <Input
                      id="serviceStreet"
                      placeholder="456 Business Ave"
                      value={portingData.serviceAddress.street}
                      onChange={(e) => setPortingData({
                        ...portingData,
                        serviceAddress: { ...portingData.serviceAddress, street: e.target.value }
                      })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="serviceCity">City *</Label>
                      <Input
                        id="serviceCity"
                        placeholder="San Francisco"
                        value={portingData.serviceAddress.city}
                        onChange={(e) => setPortingData({
                          ...portingData,
                          serviceAddress: { ...portingData.serviceAddress, city: e.target.value }
                        })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="serviceState">State *</Label>
                      <Select
                        value={portingData.serviceAddress.state}
                        onValueChange={(value) => setPortingData({
                          ...portingData,
                          serviceAddress: { ...portingData.serviceAddress, state: value }
                        })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select state" />
                        </SelectTrigger>
                        <SelectContent>
                          {US_STATES.map((state) => (
                            <SelectItem key={state.value} value={state.value}>
                              {state.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="serviceZip">ZIP Code *</Label>
                    <Input
                      id="serviceZip"
                      placeholder="94102"
                      value={portingData.serviceAddress.zip}
                      onChange={(e) => setPortingData({
                        ...portingData,
                        serviceAddress: { ...portingData.serviceAddress, zip: e.target.value }
                      })}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )

      case 5:
        return (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="businessType">Business Type</Label>
                <Select
                  value={portingData.businessType}
                  onValueChange={(value) => setPortingData({ ...portingData, businessType: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select business type" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="requestedDate">Requested Port Date (Optional)</Label>
                <Input
                  id="requestedDate"
                  type="date"
                  value={portingData.requestedPortDate}
                  onChange={(e) => setPortingData({ ...portingData, requestedPortDate: e.target.value })}
                  min={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                />
                <p className="text-xs text-gray-500">
                  If not specified, porting will happen as soon as possible (typically 7-10 business days)
                </p>
              </div>
            </div>

            <Alert>
              <Clock className="h-4 w-4" />
              <AlertDescription>
                <strong>Estimated Timeline:</strong> Number porting typically takes 7-10 business days. 
                You'll receive updates throughout the process.
              </AlertDescription>
            </Alert>

            <div className="space-y-4">
              <div className="flex items-start space-x-2">
                <Checkbox
                  id="acceptTerms"
                  checked={portingData.acceptTerms}
                  onCheckedChange={(checked) => setPortingData({ ...portingData, acceptTerms: !!checked })}
                />
                <Label htmlFor="acceptTerms" className="text-sm leading-relaxed">
                  I authorize the porting of my phone number and understand that:
                  <ul className="list-disc list-inside mt-2 space-y-1 text-xs text-gray-600">
                    <li>The porting process typically takes 7-10 business days</li>
                    <li>I am responsible for maintaining service with my current provider until porting completes</li>
                    <li>There may be early termination fees with my current provider</li>
                    <li>I will be notified at each stage of the porting process</li>
                    <li>The number will automatically be configured with CallHelm once porting completes</li>
                  </ul>
                </Label>
              </div>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Port Your Phone Number</DialogTitle>
          <DialogDescription>
            Bring your existing business number to CallHelm. Step {step} of 5.
          </DialogDescription>
        </DialogHeader>

        {/* Progress Steps */}
        <div className="flex items-center space-x-2 mb-6">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                i < step ? 'bg-green-500 text-white' :
                i === step ? 'bg-primary text-primary-foreground' :
                'bg-gray-200 text-gray-500'
              }`}>
                {i < step ? <CheckCircle className="w-4 h-4" /> : i}
              </div>
              {i < 5 && <div className={`h-1 w-8 mx-2 ${i < step ? 'bg-green-500' : 'bg-gray-200'}`} />}
            </div>
          ))}
        </div>

        <div className="space-y-6">
          {renderStep()}
          
          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={() => step > 1 ? setStep(step - 1) : onOpenChange(false)}
            >
              {step > 1 ? 'Previous' : 'Cancel'}
            </Button>
            
            {step < 5 ? (
              <Button onClick={nextStep} disabled={!validateStep(step)}>
                Next Step
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button 
                onClick={submitPortingRequest} 
                disabled={!validateStep(5) || submitting}
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Submit Porting Request
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}