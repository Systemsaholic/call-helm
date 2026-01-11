'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatUSPhone, getAreaCode, validatePhone } from '@/lib/utils/phone'
import { 
  Search, 
  Loader2, 
  Phone, 
  MapPin, 
  DollarSign,
  ShoppingCart,
  CheckCircle,
  Info
} from 'lucide-react'
import { toast } from 'sonner'

interface AvailableNumber {
  phoneNumber: string
  friendlyName: string
  locality: string
  region: string
  postalCode: string
  rateCenter?: string
  capabilities: {
    voice: boolean
    sms: boolean
    mms: boolean
  }
  monthlyPrice: number
  estimatedMonthlyCost: number
  estimatedSetupCost: number
}

interface SearchResults {
  success: boolean
  numbers: AvailableNumber[]
  total: number
  searchMethod: string
  pricing: {
    monthlyRate: number
    setupFee: number
    currency: string
    note: string
  }
}

interface NumberSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNumberPurchased?: () => void
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

export function NumberSearchDialog({ open, onOpenChange, onNumberPurchased }: NumberSearchDialogProps) {
  const [searchType, setSearchType] = useState<'areaCode' | 'city'>('areaCode')
  const [areaCode, setAreaCode] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [contains, setContains] = useState('')
  const [searching, setSearching] = useState(false)
  const [purchasing, setPurchasing] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)

  const handleAreaCodeChange = (value: string) => {
    // Only allow digits, limit to 3 characters
    const cleaned = value.replace(/\D/g, '').slice(0, 3)
    setAreaCode(cleaned)
  }

  const searchNumbers = async () => {
    if (searchType === 'areaCode' && !areaCode) {
      toast.error('Please enter an area code')
      return
    }
    
    // Validate area code format
    if (searchType === 'areaCode') {
      const cleaned = areaCode.replace(/\D/g, '')
      if (cleaned.length !== 3) {
        toast.error('Area code must be exactly 3 digits')
        return
      }
      const areaCodeNum = parseInt(cleaned, 10)
      if (areaCodeNum < 200 || areaCodeNum > 999) {
        toast.error('Invalid area code range')
        return
      }
    }
    
    if (searchType === 'city' && (!city || !state)) {
      toast.error('Please enter both city and state')
      return
    }

    try {
      setSearching(true)
      setResults(null)

      const searchParams = new URLSearchParams()
      
      if (searchType === 'areaCode') {
        searchParams.append('areaCode', areaCode)
      } else {
        searchParams.append('city', city)
        searchParams.append('region', state)
      }
      
      if (contains) {
        searchParams.append('contains', contains)
      }

      const response = await fetch(`/api/voice/numbers/search?${searchParams}`)
      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to search numbers')
      }

      setResults(data)

      if (data.numbers.length === 0) {
        toast.info('No numbers found. Try different search criteria.')
      }
    } catch (error) {
      console.error('Error searching numbers:', error)
      toast.error('Failed to search for available numbers')
    } finally {
      setSearching(false)
    }
  }

  const purchaseNumber = async (phoneNumber: string, friendlyName: string) => {
    try {
      setPurchasing(phoneNumber)

      const response = await fetch('/api/voice/numbers/purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phoneNumber,
          friendlyName: friendlyName || `Number ${phoneNumber}`,
          capabilities: {
            voice: true,
            sms: true,
            mms: false
          }
        })
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to purchase number')
      }

      toast.success(`Successfully purchased ${phoneNumber}`)
      onNumberPurchased?.()
      onOpenChange(false)
      
      // Reset form
      setResults(null)
      setAreaCode('')
      setCity('')
      setState('')
      setContains('')
    } catch (error) {
      console.error('Error purchasing number:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to purchase number')
    } finally {
      setPurchasing('')
    }
  }

  const formatPhoneNumber = (phoneNumber: string) => {
    const cleaned = phoneNumber.replace(/\D/g, '')
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
      const number = cleaned.slice(1)
      return `+1 (${number.slice(0, 3)}) ${number.slice(3, 6)}-${number.slice(6)}`
    }
    return phoneNumber
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Search for Available Phone Numbers</DialogTitle>
          <DialogDescription>
            Find and purchase phone numbers for your organization
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Search Form */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Search Method</Label>
                <Select value={searchType} onValueChange={(value) => setSearchType(value as 'areaCode' | 'city')}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="areaCode">By Area Code</SelectItem>
                    <SelectItem value="city">By City & State</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {searchType === 'areaCode' ? (
                <div className="space-y-2">
                  <Label htmlFor="areaCode">Area Code</Label>
                  <Input
                    id="areaCode"
                    placeholder="e.g., 415, 212, 713"
                    value={areaCode}
                    onChange={(e) => handleAreaCodeChange(e.target.value)}
                    maxLength={3}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      placeholder="e.g., San Francisco"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Select value={state} onValueChange={setState}>
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
              )}

              <div className="space-y-2">
                <Label htmlFor="contains">Contains Digits (Optional)</Label>
                <Input
                  id="contains"
                  placeholder="e.g., 123, 888"
                  value={contains}
                  onChange={(e) => setContains(e.target.value)}
                />
              </div>

              <Button
                onClick={searchNumbers}
                disabled={searching}
                className="w-full"
              >
                {searching ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Search className="w-4 h-4 mr-2" />
                )}
                Search Numbers
              </Button>
            </div>

            {/* Pricing Info */}
            <div className="space-y-4">
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Pricing Information
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Monthly Rate:</span>
                      <span className="font-medium">$1.50/month</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Setup Fee:</span>
                      <span className="font-medium">Free</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between font-medium">
                      <span>Total Monthly:</span>
                      <span>$1.50</span>
                    </div>
                  </div>
                  
                  <Alert className="mt-3">
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Numbers include voice and SMS capabilities with automatic webhook configuration.
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Search Results */}
          {results && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">
                  Available Numbers ({results.numbers.length})
                </h3>
                {results.searchMethod && (
                  <Badge variant="outline">
                    {results.searchMethod === 'city' ? 'City Search' : 'Area Code Search'}
                  </Badge>
                )}
              </div>

              <div className="grid gap-3 max-h-96 overflow-y-auto">
                {results.numbers.map((number) => (
                  <Card key={number.phoneNumber} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Phone className="w-5 h-5 text-gray-600" />
                          <div>
                            <div className="font-medium">
                              {formatPhoneNumber(number.phoneNumber)}
                            </div>
                            <div className="text-sm text-gray-600 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {number.locality}, {number.region}
                            </div>
                            <div className="flex gap-1 mt-1">
                              {number.capabilities.voice && (
                                <Badge variant="secondary" className="text-xs">Voice</Badge>
                              )}
                              {number.capabilities.sms && (
                                <Badge variant="secondary" className="text-xs">SMS</Badge>
                              )}
                              {number.capabilities.mms && (
                                <Badge variant="secondary" className="text-xs">MMS</Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <div className="text-sm font-medium">
                            ${number.estimatedMonthlyCost.toFixed(2)}/month
                          </div>
                          <Button
                            size="sm"
                            onClick={() => purchaseNumber(number.phoneNumber, number.friendlyName)}
                            disabled={purchasing === number.phoneNumber}
                          >
                            {purchasing === number.phoneNumber ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <ShoppingCart className="w-4 h-4 mr-2" />
                            )}
                            Purchase
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {results && results.numbers.length === 0 && (
            <div className="text-center py-8">
              <Phone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Numbers Available</h3>
              <p className="text-gray-600">Try different search criteria or check back later.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}