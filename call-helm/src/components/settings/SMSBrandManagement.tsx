'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Building,
  Plus,
  Loader2,
  CheckCircle,
  Clock,
  AlertTriangle,
  Info,
  Shield
} from 'lucide-react'
import { toast } from 'sonner'

interface SMSBrand {
  id: string
  brandName: string
  legalCompanyName: string
  businessType: string
  industry: string
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'suspended'
  telnyxBrandId?: string
  approvalDate?: string
  campaignCount: number
  createdAt: string
  canCreateCampaigns: boolean
  statusDisplay: string
  nextSteps: string[]
}

interface BrandSummary {
  total: number
  pending: number
  submitted: number
  approved: number
  rejected: number
  suspended: number
}

const BUSINESS_TYPES = [
  { value: 'sole_proprietorship', label: 'Sole Proprietorship' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'corporation', label: 'Corporation' },
  { value: 'llc', label: 'Limited Liability Company (LLC)' },
  { value: 'nonprofit', label: 'Non-Profit Organization' }
]

const INDUSTRIES = [
  { value: 'technology', label: 'Technology' },
  { value: 'healthcare', label: 'Healthcare' },
  { value: 'finance', label: 'Finance & Banking' },
  { value: 'retail', label: 'Retail & E-commerce' },
  { value: 'education', label: 'Education' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'automotive', label: 'Automotive' },
  { value: 'food_beverage', label: 'Food & Beverage' },
  { value: 'travel', label: 'Travel & Hospitality' },
  { value: 'professional_services', label: 'Professional Services' },
  { value: 'other', label: 'Other' }
]

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

export function SMSBrandManagement() {
  const [brands, setBrands] = useState<SMSBrand[]>([])
  const [summary, setSummary] = useState<BrandSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [creating, setCreating] = useState(false)

  const [brandData, setBrandData] = useState({
    brandName: '',
    legalCompanyName: '',
    einTaxId: '',
    businessType: '',
    industry: '',
    websiteUrl: '',
    address: {
      street: '',
      city: '',
      state: '',
      zip: '',
      country: 'US'
    },
    phoneNumber: '',
    email: ''
  })

  useEffect(() => {
    fetchBrands()
  }, [])

  const fetchBrands = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/sms/brands')
      const data = await response.json()

      if (data.success) {
        setBrands(data.brands || [])
        setSummary(data.summary || null)
      } else {
        throw new Error(data.error)
      }
    } catch (error) {
      console.error('Error fetching SMS brands:', error)
      toast.error('Failed to load SMS brands')
    } finally {
      setLoading(false)
    }
  }

  const createBrand = async () => {
    // Validate required fields
    if (!brandData.brandName || !brandData.legalCompanyName || !brandData.einTaxId ||
        !brandData.businessType || !brandData.industry || !brandData.phoneNumber || 
        !brandData.email || !brandData.address.street || !brandData.address.city ||
        !brandData.address.state || !brandData.address.zip) {
      toast.error('Please fill in all required fields')
      return
    }

    try {
      setCreating(true)

      const response = await fetch('/api/sms/brands/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(brandData)
      })

      const data = await response.json()

      if (!data.success) {
        throw new Error(data.error || 'Failed to create brand')
      }

      toast.success(`SMS brand "${brandData.brandName}" created successfully`)
      setCreateDialogOpen(false)
      await fetchBrands()
      
      // Reset form
      setBrandData({
        brandName: '',
        legalCompanyName: '',
        einTaxId: '',
        businessType: '',
        industry: '',
        websiteUrl: '',
        address: { street: '', city: '', state: '', zip: '', country: 'US' },
        phoneNumber: '',
        email: ''
      })
    } catch (error) {
      console.error('Error creating SMS brand:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create SMS brand')
    } finally {
      setCreating(false)
    }
  }

  const getStatusBadge = (brand: SMSBrand) => {
    switch (brand.status) {
      case 'pending':
        return (
          <Badge variant="outline" className="text-yellow-600 border-yellow-300">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </Badge>
        )
      case 'submitted':
        return (
          <Badge variant="outline" className="text-blue-600 border-blue-300">
            <Clock className="w-3 h-3 mr-1" />
            Under Review
          </Badge>
        )
      case 'approved':
        return (
          <Badge className="bg-green-100 text-green-700 border-green-300">
            <CheckCircle className="w-3 h-3 mr-1" />
            Approved
          </Badge>
        )
      case 'rejected':
        return (
          <Badge variant="outline" className="text-red-600 border-red-300">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Rejected
          </Badge>
        )
      case 'suspended':
        return (
          <Badge variant="outline" className="text-orange-600 border-orange-300">
            <AlertTriangle className="w-3 h-3 mr-1" />
            Suspended
          </Badge>
        )
      default:
        return null
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Total Brands</span>
              </div>
              <div className="text-2xl font-bold mt-1">{summary.total}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="text-sm font-medium">Approved</span>
              </div>
              <div className="text-2xl font-bold mt-1">{summary.approved}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-medium">Under Review</span>
              </div>
              <div className="text-2xl font-bold mt-1">{summary.submitted}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-600" />
                <span className="text-sm font-medium">Pending</span>
              </div>
              <div className="text-2xl font-bold mt-1">{summary.pending}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span className="text-sm font-medium">Issues</span>
              </div>
              <div className="text-2xl font-bold mt-1">{summary.rejected + summary.suspended}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Content */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle>SMS Brands</CardTitle>
            <CardDescription>
              Manage your 10DLC brands for SMS compliance. Approved brands can create SMS campaigns.
            </CardDescription>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Create Brand
          </Button>
        </CardHeader>
        <CardContent>
          {brands.length === 0 ? (
            <div className="text-center py-12">
              <Building className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No SMS brands yet</h3>
              <p className="text-gray-600 mb-4">
                Create a brand to enable SMS messaging with 10DLC compliance.
              </p>
              <Button onClick={() => setCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Brand
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {brands.map((brand) => (
                <div key={brand.id} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <Building className="h-8 w-8 text-gray-600" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{brand.brandName}</h3>
                          {getStatusBadge(brand)}
                        </div>
                        <p className="text-sm text-gray-600">{brand.legalCompanyName}</p>
                        <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                          <span>{brand.businessType.replace('_', ' ')}</span>
                          <span>•</span>
                          <span>{brand.industry.replace('_', ' ')}</span>
                          {brand.campaignCount > 0 && (
                            <>
                              <span>•</span>
                              <span>{brand.campaignCount} campaigns</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{brand.statusDisplay}</div>
                      <div className="text-xs text-gray-600">
                        Created {new Date(brand.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  
                  {brand.nextSteps.length > 0 && (
                    <div className="mt-3 p-3 bg-blue-50 rounded-md">
                      <h4 className="text-sm font-medium text-blue-900 mb-2">Next Steps:</h4>
                      <ul className="text-sm text-blue-800 space-y-1">
                        {brand.nextSteps.map((step, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="text-blue-600 mt-0.5">•</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Brand Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create SMS Brand</DialogTitle>
            <DialogDescription>
              Create a brand for 10DLC SMS compliance. This information will be verified by the Campaign Registry.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <Alert>
              <Shield className="h-4 w-4" />
              <AlertDescription>
                All information must be accurate and match your business registration. 
                False information may result in permanent rejection.
              </AlertDescription>
            </Alert>

            {/* Brand Information */}
            <div className="space-y-4">
              <h4 className="font-medium">Brand Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="brandName">Brand Name *</Label>
                  <Input
                    id="brandName"
                    placeholder="Your brand name"
                    value={brandData.brandName}
                    onChange={(e) => setBrandData({ ...brandData, brandName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="legalName">Legal Company Name *</Label>
                  <Input
                    id="legalName"
                    placeholder="Legal business name"
                    value={brandData.legalCompanyName}
                    onChange={(e) => setBrandData({ ...brandData, legalCompanyName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ein">EIN/Tax ID *</Label>
                  <Input
                    id="ein"
                    placeholder="12-3456789"
                    value={brandData.einTaxId}
                    onChange={(e) => setBrandData({ ...brandData, einTaxId: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessType">Business Type *</Label>
                  <Select
                    value={brandData.businessType}
                    onValueChange={(value) => setBrandData({ ...brandData, businessType: value })}
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
                  <Label htmlFor="industry">Industry *</Label>
                  <Select
                    value={brandData.industry}
                    onValueChange={(value) => setBrandData({ ...brandData, industry: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRIES.map((industry) => (
                        <SelectItem key={industry.value} value={industry.value}>
                          {industry.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="website">Website URL</Label>
                  <Input
                    id="website"
                    placeholder="https://example.com"
                    value={brandData.websiteUrl}
                    onChange={(e) => setBrandData({ ...brandData, websiteUrl: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Contact Information */}
            <div className="space-y-4">
              <h4 className="font-medium">Contact Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number *</Label>
                  <Input
                    id="phone"
                    placeholder="+1 (555) 123-4567"
                    value={brandData.phoneNumber}
                    onChange={(e) => setBrandData({ ...brandData, phoneNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address *</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="contact@example.com"
                    value={brandData.email}
                    onChange={(e) => setBrandData({ ...brandData, email: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Address Information */}
            <div className="space-y-4">
              <h4 className="font-medium">Business Address</h4>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="street">Street Address *</Label>
                  <Input
                    id="street"
                    placeholder="123 Business Ave"
                    value={brandData.address.street}
                    onChange={(e) => setBrandData({
                      ...brandData,
                      address: { ...brandData.address, street: e.target.value }
                    })}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City *</Label>
                    <Input
                      id="city"
                      placeholder="San Francisco"
                      value={brandData.address.city}
                      onChange={(e) => setBrandData({
                        ...brandData,
                        address: { ...brandData.address, city: e.target.value }
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="state">State *</Label>
                    <Select
                      value={brandData.address.state}
                      onValueChange={(value) => setBrandData({
                        ...brandData,
                        address: { ...brandData.address, state: value }
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
                  <div className="space-y-2">
                    <Label htmlFor="zip">ZIP Code *</Label>
                    <Input
                      id="zip"
                      placeholder="94102"
                      value={brandData.address.zip}
                      onChange={(e) => setBrandData({
                        ...brandData,
                        address: { ...brandData.address, zip: e.target.value }
                      })}
                    />
                  </div>
                </div>
              </div>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>Review Process:</strong> Brand approval typically takes 3-5 business days. 
                You'll be notified via email when your brand status changes.
              </AlertDescription>
            </Alert>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={createBrand} disabled={creating}>
                {creating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Building className="w-4 h-4 mr-2" />
                )}
                Create Brand
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}