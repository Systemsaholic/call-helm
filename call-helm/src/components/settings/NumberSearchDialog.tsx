'use client'

import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import { formatUSPhone, getAreaCode, validatePhone } from '@/lib/utils/phone'
import { useBilling } from '@/lib/hooks/useBilling'
import {
  Search,
  Loader2,
  Phone,
  MapPin,
  DollarSign,
  ShoppingCart,
  CheckCircle,
  Info,
  ChevronsUpDown,
  Check,
  Gift
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

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
  searchedCity?: string | null
  pricing: {
    monthlyRate: number
    setupFee: number
    currency: string
    note: string
  }
}

// Area code suggestions by region for when no numbers are found
const CANADIAN_AREA_CODE_REGIONS: Record<string, { codes: string[], region: string }> = {
  // Ontario
  '613': { codes: ['343', '416', '437', '647', '905', '289'], region: 'Ontario' },
  '416': { codes: ['437', '647', '905', '289', '613', '343'], region: 'Ontario' },
  '905': { codes: ['289', '416', '437', '647', '613', '343'], region: 'Ontario' },
  '519': { codes: ['226', '548', '416', '905'], region: 'Ontario' },
  // Quebec
  '514': { codes: ['438', '450', '579', '819'], region: 'Quebec' },
  '418': { codes: ['581', '367', '514', '438'], region: 'Quebec' },
  // British Columbia
  '604': { codes: ['778', '236', '672'], region: 'British Columbia' },
  '250': { codes: ['778', '604', '236'], region: 'British Columbia' },
  // Alberta
  '403': { codes: ['587', '825', '780'], region: 'Alberta' },
  '780': { codes: ['587', '825', '403'], region: 'Alberta' },
}

const US_AREA_CODE_REGIONS: Record<string, { codes: string[], region: string }> = {
  // California
  '415': { codes: ['628', '650', '510', '408', '925'], region: 'California Bay Area' },
  '650': { codes: ['415', '628', '510', '408'], region: 'California Bay Area' },
  '213': { codes: ['323', '310', '818', '626', '562'], region: 'Los Angeles' },
  // New York
  '212': { codes: ['646', '332', '917', '718', '347'], region: 'New York City' },
  '718': { codes: ['347', '929', '917', '212', '646'], region: 'New York City' },
  // Texas
  '214': { codes: ['469', '972', '817', '682'], region: 'Dallas' },
  '713': { codes: ['281', '832', '346'], region: 'Houston' },
}

interface NumberSearchDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNumberPurchased?: () => void
}

// Canadian Provinces
const CANADIAN_PROVINCES = [
  { value: 'AB', label: 'Alberta', country: 'CA' },
  { value: 'BC', label: 'British Columbia', country: 'CA' },
  { value: 'MB', label: 'Manitoba', country: 'CA' },
  { value: 'NB', label: 'New Brunswick', country: 'CA' },
  { value: 'NL', label: 'Newfoundland and Labrador', country: 'CA' },
  { value: 'NS', label: 'Nova Scotia', country: 'CA' },
  { value: 'NT', label: 'Northwest Territories', country: 'CA' },
  { value: 'NU', label: 'Nunavut', country: 'CA' },
  { value: 'ON', label: 'Ontario', country: 'CA' },
  { value: 'PE', label: 'Prince Edward Island', country: 'CA' },
  { value: 'QC', label: 'Quebec', country: 'CA' },
  { value: 'SK', label: 'Saskatchewan', country: 'CA' },
  { value: 'YT', label: 'Yukon', country: 'CA' },
]

// US States
const US_STATES = [
  { value: 'AL', label: 'Alabama', country: 'US' },
  { value: 'AK', label: 'Alaska', country: 'US' },
  { value: 'AZ', label: 'Arizona', country: 'US' },
  { value: 'AR', label: 'Arkansas', country: 'US' },
  { value: 'CA', label: 'California', country: 'US' },
  { value: 'CO', label: 'Colorado', country: 'US' },
  { value: 'CT', label: 'Connecticut', country: 'US' },
  { value: 'DE', label: 'Delaware', country: 'US' },
  { value: 'FL', label: 'Florida', country: 'US' },
  { value: 'GA', label: 'Georgia', country: 'US' },
  { value: 'HI', label: 'Hawaii', country: 'US' },
  { value: 'ID', label: 'Idaho', country: 'US' },
  { value: 'IL', label: 'Illinois', country: 'US' },
  { value: 'IN', label: 'Indiana', country: 'US' },
  { value: 'IA', label: 'Iowa', country: 'US' },
  { value: 'KS', label: 'Kansas', country: 'US' },
  { value: 'KY', label: 'Kentucky', country: 'US' },
  { value: 'LA', label: 'Louisiana', country: 'US' },
  { value: 'ME', label: 'Maine', country: 'US' },
  { value: 'MD', label: 'Maryland', country: 'US' },
  { value: 'MA', label: 'Massachusetts', country: 'US' },
  { value: 'MI', label: 'Michigan', country: 'US' },
  { value: 'MN', label: 'Minnesota', country: 'US' },
  { value: 'MS', label: 'Mississippi', country: 'US' },
  { value: 'MO', label: 'Missouri', country: 'US' },
  { value: 'MT', label: 'Montana', country: 'US' },
  { value: 'NE', label: 'Nebraska', country: 'US' },
  { value: 'NV', label: 'Nevada', country: 'US' },
  { value: 'NH', label: 'New Hampshire', country: 'US' },
  { value: 'NJ', label: 'New Jersey', country: 'US' },
  { value: 'NM', label: 'New Mexico', country: 'US' },
  { value: 'NY', label: 'New York', country: 'US' },
  { value: 'NC', label: 'North Carolina', country: 'US' },
  { value: 'ND', label: 'North Dakota', country: 'US' },
  { value: 'OH', label: 'Ohio', country: 'US' },
  { value: 'OK', label: 'Oklahoma', country: 'US' },
  { value: 'OR', label: 'Oregon', country: 'US' },
  { value: 'PA', label: 'Pennsylvania', country: 'US' },
  { value: 'RI', label: 'Rhode Island', country: 'US' },
  { value: 'SC', label: 'South Carolina', country: 'US' },
  { value: 'SD', label: 'South Dakota', country: 'US' },
  { value: 'TN', label: 'Tennessee', country: 'US' },
  { value: 'TX', label: 'Texas', country: 'US' },
  { value: 'UT', label: 'Utah', country: 'US' },
  { value: 'VT', label: 'Vermont', country: 'US' },
  { value: 'VA', label: 'Virginia', country: 'US' },
  { value: 'WA', label: 'Washington', country: 'US' },
  { value: 'WV', label: 'West Virginia', country: 'US' },
  { value: 'WI', label: 'Wisconsin', country: 'US' },
  { value: 'WY', label: 'Wyoming', country: 'US' },
]

// Combined list with country info for the API
const STATES_AND_PROVINCES = [...CANADIAN_PROVINCES, ...US_STATES]

export function NumberSearchDialog({ open, onOpenChange, onNumberPurchased }: NumberSearchDialogProps) {
  const [searchType, setSearchType] = useState<'areaCode' | 'city'>('areaCode')
  const [areaCode, setAreaCode] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [regionSearch, setRegionSearch] = useState('')
  const [regionPopoverOpen, setRegionPopoverOpen] = useState(false)
  const [contains, setContains] = useState('')
  const [searching, setSearching] = useState(false)
  const [purchasing, setPurchasing] = useState('')
  const [results, setResults] = useState<SearchResults | null>(null)

  // Get billing/plan information
  const { limits, isLoading: billingLoading } = useBilling()

  // Calculate included numbers remaining in plan
  const currentPhoneNumbers = limits?.current_phone_numbers ?? 0
  const maxPhoneNumbers = limits?.max_phone_numbers ?? 0
  const includedNumbersRemaining = Math.max(0, maxPhoneNumbers - currentPhoneNumbers)
  const hasIncludedNumbers = includedNumbersRemaining > 0
  const usagePercentage = maxPhoneNumbers > 0
    ? Math.min(100, (currentPhoneNumbers / maxPhoneNumbers) * 100)
    : 0

  // Filter states/provinces based on search
  const filteredRegions = useMemo(() => {
    if (!regionSearch) return STATES_AND_PROVINCES
    const search = regionSearch.toLowerCase()
    return STATES_AND_PROVINCES.filter(
      region => region.label.toLowerCase().includes(search) ||
                region.value.toLowerCase().includes(search)
    )
  }, [regionSearch])

  // Get selected region details
  const selectedRegion = STATES_AND_PROVINCES.find(r => r.value === state)

  const handleAreaCodeChange = (value: string) => {
    // Only allow digits, limit to 3 characters
    const cleaned = value.replace(/\D/g, '').slice(0, 3)
    setAreaCode(cleaned)
  }

  const searchNumbers = async (overrideAreaCode?: string) => {
    const searchAreaCode = String(overrideAreaCode || areaCode || '')

    if (searchType === 'areaCode' && !searchAreaCode) {
      toast.error('Please enter an area code')
      return
    }

    // Validate area code format
    if (searchType === 'areaCode') {
      const cleaned = searchAreaCode.replace(/\D/g, '')
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

    if (searchType === 'city' && !state) {
      toast.error('Please select a state or province')
      return
    }

    // Update the displayed area code if using an override
    if (overrideAreaCode) {
      setAreaCode(overrideAreaCode)
    }

    try {
      setSearching(true)
      setResults(null)

      const searchBody: Record<string, string> = {}

      if (searchType === 'areaCode') {
        searchBody.areaCode = searchAreaCode
      } else {
        searchBody.city = city
        searchBody.region = state
        // Pass country based on selected region
        if (selectedRegion) {
          searchBody.country = selectedRegion.country
        }
      }

      if (contains) {
        searchBody.contains = contains
      }

      const response = await fetch('/api/voice/numbers/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchBody)
      })
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
                    <SelectItem value="city">By State / Province</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {searchType === 'areaCode' ? (
                <div className="space-y-2">
                  <Label htmlFor="areaCode">Area Code</Label>
                  <Input
                    id="areaCode"
                    placeholder="e.g., 415, 212, 613"
                    value={areaCode}
                    onChange={(e) => handleAreaCodeChange(e.target.value)}
                    maxLength={3}
                  />
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="city">City (Optional)</Label>
                    <Input
                      id="city"
                      placeholder="e.g., Toronto, Ottawa"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State / Province</Label>
                    <Popover open={regionPopoverOpen} onOpenChange={setRegionPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={regionPopoverOpen}
                          className="w-full justify-between font-normal"
                        >
                          {selectedRegion ? (
                            <span>
                              {selectedRegion.label}
                              <span className="ml-1 text-muted-foreground text-xs">
                                ({selectedRegion.country})
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">Select state/province...</span>
                          )}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[280px] p-0" align="start">
                        <div className="p-2 border-b">
                          <Input
                            placeholder="Search states/provinces..."
                            value={regionSearch}
                            onChange={(e) => setRegionSearch(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <ScrollArea className="h-[280px]">
                          <div className="p-1">
                            {/* Canadian Provinces */}
                            {filteredRegions.some(r => r.country === 'CA') && (
                              <>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50">
                                  Canadian Provinces
                                </div>
                                {filteredRegions
                                  .filter(r => r.country === 'CA')
                                  .map((region) => (
                                    <Button
                                      key={region.value}
                                      variant="ghost"
                                      className={cn(
                                        "w-full justify-start font-normal",
                                        state === region.value && "bg-accent"
                                      )}
                                      onClick={() => {
                                        setState(region.value)
                                        setRegionPopoverOpen(false)
                                        setRegionSearch('')
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          state === region.value ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      {region.label}
                                    </Button>
                                  ))}
                              </>
                            )}
                            {/* US States */}
                            {filteredRegions.some(r => r.country === 'US') && (
                              <>
                                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 mt-1">
                                  US States
                                </div>
                                {filteredRegions
                                  .filter(r => r.country === 'US')
                                  .map((region) => (
                                    <Button
                                      key={region.value}
                                      variant="ghost"
                                      className={cn(
                                        "w-full justify-start font-normal",
                                        state === region.value && "bg-accent"
                                      )}
                                      onClick={() => {
                                        setState(region.value)
                                        setRegionPopoverOpen(false)
                                        setRegionSearch('')
                                      }}
                                    >
                                      <Check
                                        className={cn(
                                          "mr-2 h-4 w-4",
                                          state === region.value ? "opacity-100" : "opacity-0"
                                        )}
                                      />
                                      {region.label}
                                    </Button>
                                  ))}
                              </>
                            )}
                            {filteredRegions.length === 0 && (
                              <div className="py-6 text-center text-sm text-muted-foreground">
                                No results found.
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                      </PopoverContent>
                    </Popover>
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
                onClick={() => searchNumbers()}
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
              {/* Plan Usage Card */}
              {maxPhoneNumbers > 0 && (
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-medium mb-3 flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      Your Plan Usage
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span>Phone Numbers</span>
                        <span className="font-medium">
                          {currentPhoneNumbers} of {maxPhoneNumbers} used
                        </span>
                      </div>
                      <Progress value={usagePercentage} className="h-2" />
                      {hasIncludedNumbers ? (
                        <div className="flex items-center gap-2 text-sm text-green-600">
                          <Gift className="w-4 h-4" />
                          <span>
                            <strong>{includedNumbersRemaining}</strong> number{includedNumbersRemaining !== 1 ? 's' : ''} included in your plan
                          </span>
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          All included numbers used. Additional numbers are $1.50/month each.
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardContent className="p-4">
                  <h3 className="font-medium mb-3 flex items-center gap-2">
                    <DollarSign className="w-4 h-4" />
                    Pricing for This Number
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Monthly Rate:</span>
                      {hasIncludedNumbers ? (
                        <span className="font-medium text-green-600">Included in plan</span>
                      ) : (
                        <span className="font-medium">$1.50/month</span>
                      )}
                    </div>
                    <div className="flex justify-between">
                      <span>Setup Fee:</span>
                      <span className="font-medium">Free</span>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between font-medium">
                      <span>Total Monthly:</span>
                      {hasIncludedNumbers ? (
                        <span className="text-green-600">$0.00</span>
                      ) : (
                        <span>$1.50</span>
                      )}
                    </div>
                  </div>

                  <Alert className="mt-3">
                    <Info className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      {hasIncludedNumbers
                        ? 'This number is included in your subscription at no extra cost.'
                        : 'Numbers include voice and SMS capabilities with automatic webhook configuration.'}
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
                          {hasIncludedNumbers ? (
                            <div className="text-sm font-medium text-green-600 flex items-center gap-1 justify-end">
                              <Gift className="w-3 h-3" />
                              Included
                            </div>
                          ) : (
                            <div className="text-sm font-medium">
                              ${number.estimatedMonthlyCost.toFixed(2)}/month
                            </div>
                          )}
                          <Button
                            size="sm"
                            onClick={() => purchaseNumber(number.phoneNumber, number.friendlyName)}
                            disabled={purchasing === number.phoneNumber}
                            className="mt-1"
                          >
                            {purchasing === number.phoneNumber ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : hasIncludedNumbers ? (
                              <CheckCircle className="w-4 h-4 mr-2" />
                            ) : (
                              <ShoppingCart className="w-4 h-4 mr-2" />
                            )}
                            {hasIncludedNumbers ? 'Add Number' : 'Purchase'}
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
            <div className="py-6">
              <div className="text-center mb-6">
                <Phone className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Numbers Available</h3>
                <p className="text-gray-600 mb-4">
                  {searchType === 'areaCode'
                    ? `No phone numbers are currently available in the ${areaCode} area code.`
                    : `No phone numbers are currently available in ${city}, ${state}.`}
                </p>
              </div>

              {/* Alternative area code suggestions */}
              {searchType === 'areaCode' && areaCode && (() => {
                const canadianSuggestions = CANADIAN_AREA_CODE_REGIONS[areaCode]
                const usSuggestions = US_AREA_CODE_REGIONS[areaCode]
                const suggestions = canadianSuggestions || usSuggestions

                if (suggestions) {
                  return (
                    <Card className="mb-4">
                      <CardContent className="p-4">
                        <h4 className="font-medium mb-2 flex items-center gap-2">
                          <MapPin className="w-4 h-4" />
                          Try nearby area codes in {suggestions.region}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {suggestions.codes.slice(0, 5).map(code => (
                            <Button
                              key={code}
                              variant="outline"
                              size="sm"
                              onClick={() => searchNumbers(code)}
                              disabled={searching}
                            >
                              {code}
                            </Button>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )
                }
                return null
              })()}

              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  <strong>Tips for finding numbers:</strong>
                  <ul className="mt-2 text-sm space-y-1 list-disc list-inside">
                    <li>Try a different area code in the same region</li>
                    <li>Phone number availability changes frequently - check back later</li>
                    <li>Some area codes have limited inventory due to high demand</li>
                    <li>Consider using a nearby area code that covers the same geographic area</li>
                  </ul>
                </AlertDescription>
              </Alert>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}