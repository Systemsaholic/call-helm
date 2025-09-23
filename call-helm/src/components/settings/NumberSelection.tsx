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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// US States
const US_STATES = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' }, 
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' }
]

// Canadian Provinces
const CA_PROVINCES = [
  { code: 'AB', name: 'Alberta' }, { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' }, { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland and Labrador' }, { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' }, { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' }, { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' }, { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' }
]



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
  const [country, setCountry] = useState<'US' | 'CA'>('CA')
  const [searchType, setSearchType] = useState<'areaCode' | 'state'>('state')
  const [areaCode, setAreaCode] = useState('')
  const [state, setState] = useState('')
  const [city, setCity] = useState('')
  const [availableNumbers, setAvailableNumbers] = useState<AvailableNumber[]>([])
  const [selectedNumber, setSelectedNumber] = useState<string>('')
  const [forwardingNumber, setForwardingNumber] = useState('')
  const [searchResults, setSearchResults] = useState<{
    hasSearched: boolean
    searchCriteria?: string
    totalFound: number
    errorMessage?: string
    showAreaCodeTip?: boolean
    citySearched?: string
  }>({ hasSearched: false, totalFound: 0 })

  const regions = country === 'US' ? US_STATES : CA_PROVINCES

  const handleSearch = async () => {
    // Validate input based on search type
    if (searchType === 'areaCode' && (!areaCode || areaCode.length !== 3)) {
      setSearchResults({
        hasSearched: true,
        searchCriteria: `Area code ${areaCode || '___'}`,
        totalFound: 0,
        errorMessage: 'Please enter a valid 3-digit area code'
      })
      return
    }
    if (searchType === 'state' && !state) {
      setSearchResults({
        hasSearched: true,
        searchCriteria: `${country === 'US' ? 'State' : 'Province'} selection`,
        totalFound: 0,
        errorMessage: `Please select a ${country === 'US' ? 'state' : 'province'}`
      })
      return
    }

    setSearching(true)
    setSearchResults({ hasSearched: false, totalFound: 0 })
    
    let searchCriteria = ''
    
    try {
      const searchParams: any = { country }
      let stateName = ''
      
      if (searchType === 'areaCode') {
        searchParams.areaCode = areaCode
        searchCriteria = `Area code ${areaCode} in ${country}`
      } else if (searchType === 'state') {
        stateName = regions.find(r => r.code === state)?.name || state
        searchParams.region = state
        searchCriteria = `${stateName}, ${country}`
        
        // If city is provided, pass it to the API for area code lookup
        if (city && city.trim().length >= 2) {
          searchParams.city = city.trim()
          searchCriteria = `${city.trim()}, ${stateName}, ${country}`
        }
      }

      const response = await fetch('/api/voice/numbers/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(searchParams)
      })

      if (!response.ok) {
        throw new Error('Failed to search numbers')
      }

      const data = await response.json()
      let numbers = data.numbers || []
      const searchMethod = data.searchMethod
      const searchedCity = data.searchedCity
      
      // Debug: Log what we received for city searches
      if (searchType === 'state' && city) {
        console.log(`Search method: ${searchMethod}`)
        console.log(`Total numbers received: ${numbers.length}`)
        if (searchMethod === 'city' && numbers.length > 0) {
          console.log('Successfully searched by area codes for city:', city)
        }
      }
      
      // Update search criteria based on search method
      if (searchMethod === 'city' && searchedCity) {
        // Successfully found area codes and searched them
        searchCriteria = `${searchedCity}, ${stateName} (${numbers.length} results from area codes)`
      } else if (searchMethod === 'region-fallback' && searchedCity) {
        // No area codes found, fell back to region search
        searchCriteria = `${searchedCity} area - showing all ${stateName} numbers`
        
        // Set flag to show that we couldn't find specific area codes
        setSearchResults({
          hasSearched: true,
          searchCriteria,
          totalFound: numbers.length,
          errorMessage: undefined,
          showAreaCodeTip: true,
          citySearched: searchedCity
        } as any)
        
        setAvailableNumbers(numbers)
        return // Early return since we set the results manually
      }
      
      setAvailableNumbers(numbers)
      
      setSearchResults({
        hasSearched: true,
        searchCriteria,
        totalFound: numbers.length
      })
    } catch (error) {
      console.error('Error searching numbers:', error)
      setSearchResults({
        hasSearched: true,
        searchCriteria,
        totalFound: 0,
        errorMessage: 'Failed to search available numbers. Please try again.'
      })
      setAvailableNumbers([])
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
        const errorData = await response.text()
        console.error('Provision API error:', errorData)
        
        // Try to parse JSON error response
        let errorMessage = 'Failed to provision phone number'
        try {
          const errorJson = JSON.parse(errorData)
          errorMessage = errorJson.error || errorMessage
        } catch {
          // Keep default message if can't parse JSON
        }
        
        throw new Error(errorMessage)
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
            Search for available numbers by location
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Country Selection */}
          <div>
            <Label>Country</Label>
            <Select value={country} onValueChange={(v) => setCountry(v as 'US' | 'CA')}>
              <SelectTrigger className="mt-2">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CA">Canada</SelectItem>
                <SelectItem value="US">United States</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Search Type Selection */}
          <div>
            <Label>Search by</Label>
            <RadioGroup value={searchType} onValueChange={(v) => setSearchType(v as any)} className="mt-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="state" id="state-search" />
                <Label htmlFor="state-search" className="font-normal">
                  {country === 'US' ? 'State' : 'Province'}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="areaCode" id="area-search" />
                <Label htmlFor="area-search" className="font-normal">Area Code</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Dynamic Search Input */}
          <div>
            {searchType === 'state' && (
              <>
                <Label>{country === 'US' ? 'State' : 'Province'}</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder={`Select ${country === 'US' ? 'state' : 'province'}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {regions.map((region) => (
                      <SelectItem key={region.code} value={region.code}>
                        {region.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* Optional city filter */}
                <div className="mt-4">
                  <Label>City Name Filter (Optional)</Label>
                  <Input
                    className="mt-2"
                    placeholder="Ottawa, Toronto, etc."
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                  <p className="text-xs text-gray-600 mt-1">
                    Note: This filters results after searching the province. For specific cities, use area code search for best results.
                  </p>
                  {country === 'CA' && state === 'ON' && (
                    <Alert className="mt-2 bg-blue-50 border-blue-200">
                      <Info className="h-4 w-4 text-blue-600" />
                      <AlertDescription className="text-xs">
                        <strong>💡 For specific Canadian cities, use area code search:</strong>
                        <div className="mt-1 grid grid-cols-2 gap-1 text-xs">
                          <span>• Ottawa: 613, 343</span>
                          <span>• Toronto: 416, 647</span>
                          <span>• Hamilton: 905, 289</span>
                          <span>• London: 519, 226</span>
                        </div>
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              </>
            )}
            
            {searchType === 'areaCode' && (
              <>
                <Label>Area Code</Label>
                <Input
                  className="mt-2 w-32"
                  placeholder="555"
                  value={areaCode}
                  onChange={(e) => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))}
                  maxLength={3}
                />
                <p className="text-xs text-gray-600 mt-1">
                  Enter a 3-digit area code
                </p>
                {country === 'CA' && (
                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600">
                    <strong>Common Canadian area codes:</strong>
                    <div className="grid grid-cols-2 gap-1 mt-1">
                      <span>• Ottawa: 613, 343</span>
                      <span>• Toronto: 416, 647, 437</span>
                      <span>• Vancouver: 604, 778, 236</span>
                      <span>• Montreal: 514, 438</span>
                      <span>• Calgary: 403, 587, 825</span>
                      <span>• Edmonton: 780, 587, 825</span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Search Button */}
          <Button 
            onClick={handleSearch}
            disabled={searching || 
              (searchType === 'areaCode' && areaCode.length !== 3) ||
              (searchType === 'state' && !state)
            }
            className="w-full"
          >
            {searching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Searching...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Search Available Numbers
              </>
            )}
          </Button>

          {/* Search Results Feedback */}
          {(searchResults.hasSearched || searching) && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="text-sm font-medium">Search Results</p>
                  <p className="text-xs text-gray-600">
                    {searching ? 'Searching...' : searchResults.searchCriteria}
                  </p>
                </div>
                <div className="text-right">
                  {searching ? (
                    <div className="flex items-center gap-2 text-blue-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Searching</span>
                    </div>
                  ) : searchResults.errorMessage ? (
                    <div className="flex items-center gap-2 text-red-600">
                      <AlertCircle className="h-4 w-4" />
                      <span className="text-sm">Error</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">
                        {searchResults.totalFound} found
                      </span>
                    </div>
                  )}
                </div>
              </div>
              
              {!searching && searchResults.errorMessage && (
                <Alert className="bg-red-50 border-red-200">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-700">
                    {searchResults.errorMessage}
                  </AlertDescription>
                </Alert>
              )}
              
              {!searching && !searchResults.errorMessage && searchResults.totalFound === 0 && (
                <Alert className="bg-blue-50 border-blue-200">
                  <Info className="h-4 w-4 text-blue-600" />
                  <AlertDescription className="text-blue-700">
                    No phone numbers available for your search criteria. Try:
                    <ul className="mt-2 ml-4 space-y-1 text-sm">
                      <li>• Selecting a different {country === 'US' ? 'state' : 'province'}</li>
                      <li>• Searching by area code instead</li>
                      {city && <li>• Removing the city filter to see all numbers in the region</li>}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
              
              {!searching && searchResults.showAreaCodeTip && searchResults.citySearched && (
                <Alert className="bg-amber-50 border-amber-200">
                  <AlertCircle className="h-4 w-4 text-amber-600" />
                  <AlertDescription className="text-amber-700">
                    <strong>No {searchResults.citySearched} numbers found in results.</strong>
                    <p className="mt-1 text-sm">
                      The phone provider may not have numbers specifically labeled for {searchResults.citySearched}.
                      For better results, try searching by area code:
                    </p>
                    {country === 'CA' && searchResults.citySearched.toLowerCase().includes('ottawa') && (
                      <p className="mt-1 text-sm font-medium">
                        • Ottawa area codes: 613, 343, 753
                      </p>
                    )}
                    {country === 'CA' && searchResults.citySearched.toLowerCase().includes('toronto') && (
                      <p className="mt-1 text-sm font-medium">
                        • Toronto area codes: 416, 647, 437
                      </p>
                    )}
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

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