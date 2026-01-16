import crypto from 'crypto'
import { voiceLogger } from '@/lib/logger'

// This service handles all SignalWire interactions server-side
// Users never see or interact with SignalWire directly
// Enhanced for multi-tenant self-service number management

const SIGNALWIRE_SPACE_URL = process.env.SIGNALWIRE_SPACE_URL || 'call-helm.signalwire.com'
const SIGNALWIRE_PROJECT_ID = process.env.SIGNALWIRE_PROJECT_ID || ''
const SIGNALWIRE_API_TOKEN = process.env.SIGNALWIRE_API_TOKEN || ''
const SIGNALWIRE_CAMPAIGN_REGISTRY_API = process.env.SIGNALWIRE_CAMPAIGN_REGISTRY_API || ''

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

interface SignalWireCapabilities {
  voice?: boolean
  sms?: boolean
  SMS?: boolean
  mms?: boolean
  MMS?: boolean
  fax?: boolean
}

interface SignalWireNumber {
  sid: string
  phoneNumber: string
  friendlyName: string
  capabilities: SignalWireCapabilities
  status: string
}

interface PortingRequest {
  id: string
  phoneNumber: string
  status: 'pending' | 'submitted' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
  statusDetails?: string
  requestedPortDate?: string
  actualPortDate?: string
  rejectionReason?: string
}

interface Brand {
  id: string
  brandName: string
  legalCompanyName: string
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'suspended'
  approvalDate?: string
  rejectionReason?: string
}

interface Campaign {
  id: string
  campaignName: string
  brandId: string
  useCase: string
  status: 'pending' | 'submitted' | 'approved' | 'rejected' | 'suspended'
  approvalDate?: string
  rejectionReason?: string
}

// SignalWire API response types
interface SignalWireAvailableNumber {
  phone_number: string
  friendly_name: string
  locality?: string
  rate_center?: string
  region?: string
  postal_code?: string
  capabilities?: SignalWireCapabilities
  monthly_price?: string
}

interface SignalWireOwnedNumber {
  sid: string
  phone_number: string
  friendly_name: string
  capabilities?: SignalWireCapabilities
  status?: string
  voice_url?: string
  sms_url?: string
}

export class SignalWireService {
  private baseUrl: string
  private campaignRegistryUrl: string
  private auth: string

  constructor() {
    if (process.env.NODE_ENV === 'development') {
      voiceLogger.debug('SignalWire constructor initialized', {
        spaceUrl: SIGNALWIRE_SPACE_URL,
        projectId: SIGNALWIRE_PROJECT_ID,
        hasApiToken: !!SIGNALWIRE_API_TOKEN
      })
    }

    this.baseUrl = `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}`
    this.campaignRegistryUrl = `https://${SIGNALWIRE_SPACE_URL}/api/relay/rest/registry`
    this.auth = Buffer.from(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`).toString('base64')

    if (process.env.NODE_ENV === 'development') {
      voiceLogger.debug('SignalWire URLs constructed', {
        baseUrl: this.baseUrl,
        campaignRegistryUrl: this.campaignRegistryUrl
      })
    }
  }

  // Search for available phone numbers by city name using area code mapping
  async searchByCity(params: {
    city: string
    region: string
    country?: string
    contains?: string
    limit?: number
  }): Promise<AvailableNumber[]> {
    const country = params.country || 'US'
    
    // This will be called from the API route which will look up area codes
    // and make multiple searches if needed
    // For now, just redirect to regular search with region
    return this.searchAvailableNumbers({
      region: params.region,
      country,
      contains: params.contains,
      limit: params.limit
    })
  }

  // Search for available phone numbers by area code or region
  async searchAvailableNumbers(params: {
    areaCode?: string
    region?: string
    country?: string
    contains?: string
    locality?: string
    limit?: number
  }): Promise<AvailableNumber[]> {
    const queryParams = new URLSearchParams()
    
    // Required/core parameters
    if (params.areaCode) queryParams.append('AreaCode', params.areaCode)
    if (params.region) queryParams.append('InRegion', params.region)
    if (params.contains) queryParams.append('Contains', params.contains)
    // Don't use InLocality - it's too restrictive and returns few results
    // if (params.locality) queryParams.append('InLocality', params.locality)
    
    // SignalWire-specific parameters based on docs
    queryParams.append('Beta', 'true')  // Include new SignalWire numbers (default behavior)
    queryParams.append('VoiceEnabled', 'true')  // Only voice-capable numbers
    queryParams.append('SmsEnabled', 'true')   // Only SMS-capable numbers
    
    // Control result size
    const pageSize = params.limit || 200
    queryParams.append('PageSize', pageSize.toString())
    
    const country = params.country || 'US'
    const url = `${this.baseUrl}/AvailablePhoneNumbers/${country}/Local.json?${queryParams}`

    try {
      voiceLogger.debug('SignalWire search URL', { url })

      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to search numbers: ${response.statusText}`)
      }

      const data = await response.json()
      voiceLogger.debug('SignalWire search results', {
        count: data.available_phone_numbers?.length || 0,
        sample: data.available_phone_numbers?.[0] ? { phoneNumber: data.available_phone_numbers[0].phone_number } : null
      })
      
      // Transform SignalWire response to our format
      return (data.available_phone_numbers || []).map((num: SignalWireAvailableNumber) => {
        // Use rate_center as the city name when locality is not available
        // Rate center names are typically in uppercase, so we'll format them properly
        let cityName = num.locality || num.rate_center || 'Unknown'

        // Format rate center names (convert from UPPERCASE to Title Case)
        if (!num.locality && num.rate_center) {
          cityName = num.rate_center.split(' ')
            .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
        }

        return {
          phoneNumber: num.phone_number,
          friendlyName: num.friendly_name,
          locality: cityName,
          region: num.region || 'Unknown',
          postalCode: num.postal_code || '',
          rateCenter: num.rate_center || '',
          capabilities: {
            voice: num.capabilities?.voice || false,
            sms: num.capabilities?.SMS || false,
            mms: num.capabilities?.MMS || false
          },
          monthlyPrice: parseFloat(num.monthly_price || '0')
        }
      })
    } catch (error) {
      voiceLogger.error('SignalWire searchAvailableNumbers error', { error })
      throw new Error('Failed to search available numbers')
    }
  }

  // Purchase a phone number for the platform
  async purchaseNumber(phoneNumber: string, params?: {
    friendlyName?: string
    voiceUrl?: string
    smsUrl?: string
  }): Promise<SignalWireNumber> {
    const url = `${this.baseUrl}/IncomingPhoneNumbers.json`
    
    const body: Record<string, string> = {
      PhoneNumber: phoneNumber,
      FriendlyName: params?.friendlyName || `Platform Number ${phoneNumber}`
    }

    // Set webhook URLs for voice and SMS
    if (params?.voiceUrl) {
      body.VoiceUrl = params.voiceUrl
      body.VoiceMethod = 'POST'
    }
    if (params?.smsUrl) {
      body.SmsUrl = params.smsUrl
      body.SmsMethod = 'POST'
    }

    try {
      // Convert body to URLSearchParams for form-encoded data
      const formData = new URLSearchParams()
      Object.keys(body).forEach(key => {
        formData.append(key, body[key])
      })

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      })

      if (!response.ok) {
        const error = await response.text()
        voiceLogger.error('SignalWire purchase error', { error, status: response.status })
        
        // Parse common errors for better user messages
        if (response.status === 400) {
          throw new Error('This phone number is no longer available. Please search for a different number.')
        } else if (response.status === 401) {
          throw new Error('SignalWire authentication failed. Please check your configuration.')
        } else if (response.status === 403) {
          throw new Error('Account does not have permission to purchase numbers. Please check your SignalWire account settings.')
        } else if (response.status === 422) {
          throw new Error('Invalid phone number format. Please try a different number.')
        } else {
          throw new Error('Failed to purchase phone number. The number may no longer be available.')
        }
      }

      const data = await response.json()
      
      return {
        sid: data.sid,
        phoneNumber: data.phone_number,
        friendlyName: data.friendly_name,
        capabilities: data.capabilities,
        status: 'active'
      }
    } catch (error) {
      voiceLogger.error('SignalWire purchaseNumber error', { error, phoneNumber })
      throw new Error('Failed to purchase phone number')
    }
  }

  // Configure call forwarding for a number
  async configureForwarding(numberSid: string, forwardTo: string): Promise<void> {
    const url = `${this.baseUrl}/IncomingPhoneNumbers/${numberSid}.json`
    
    const voiceUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/forward?forward_to=${encodeURIComponent(forwardTo)}`
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          VoiceUrl: voiceUrl,
          VoiceMethod: 'POST',
          VoiceFallbackUrl: voiceUrl,
          StatusCallback: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/status`
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to configure forwarding: ${response.statusText}`)
      }
    } catch (error) {
      voiceLogger.error('SignalWire configureForwarding error', { error, numberSid, forwardTo })
      throw new Error('Failed to configure call forwarding')
    }
  }

  // Update webhook URLs for an existing number (for fixing webhook configurations)
  async updateWebhookUrls(numberSid: string, params?: {
    voiceUrl?: string
    smsUrl?: string
    statusCallback?: string
  }): Promise<void> {
    const url = `${this.baseUrl}/IncomingPhoneNumbers/${numberSid}.json`
    
    // Use provided URLs or default to current environment URLs
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
    const voiceUrl = params?.voiceUrl || `${baseUrl}/api/voice/webhook`
    const smsUrl = params?.smsUrl || `${baseUrl}/api/voice/sms`
    const statusCallback = params?.statusCallback || `${baseUrl}/api/voice/status`
    
    try {
      // Use form-encoded data like in purchaseNumber
      const formData = new URLSearchParams()
      formData.append('VoiceUrl', voiceUrl)
      formData.append('VoiceMethod', 'POST')
      formData.append('VoiceFallbackUrl', voiceUrl)
      formData.append('SmsUrl', smsUrl)
      formData.append('SmsMethod', 'POST')
      formData.append('StatusCallback', statusCallback)
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      })

      if (!response.ok) {
        const errorText = await response.text()
        voiceLogger.error('SignalWire API error updating webhooks', { errorText, status: response.status })
        throw new Error(`Failed to update webhook URLs: ${response.statusText} - ${errorText}`)
      }

      voiceLogger.info('Successfully updated webhook URLs', { numberSid, voiceUrl, smsUrl, statusCallback })
    } catch (error) {
      voiceLogger.error('SignalWire updateWebhookUrls error', { error, numberSid })
      throw new Error('Failed to update webhook URLs')
    }
  }

  // List all numbers owned by this account
  async listOwnedNumbers(): Promise<SignalWireOwnedNumber[]> {
    const url = `${this.baseUrl}/IncomingPhoneNumbers.json`

    voiceLogger.debug('Fetching owned numbers', { url })

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${this.auth}`
        }
      })

      voiceLogger.debug('listOwnedNumbers response', { status: response.status })

      if (!response.ok) {
        const errorText = await response.text()
        voiceLogger.error('listOwnedNumbers error response', { errorText, status: response.status })
        throw new Error(`Failed to list numbers: ${response.statusText}`)
      }

      const data = await response.json()
      return data.incoming_phone_numbers || []
    } catch (error) {
      voiceLogger.error('SignalWire listOwnedNumbers error', { error })
      throw new Error('Failed to list phone numbers')
    }
  }

  // Release a phone number
  async releaseNumber(numberSid: string): Promise<void> {
    const url = `${this.baseUrl}/IncomingPhoneNumbers/${numberSid}.json`
    
    try {
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Basic ${this.auth}`
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to release number: ${response.statusText}`)
      }
    } catch (error) {
      voiceLogger.error('SignalWire releaseNumber error', { error, numberSid })
      throw new Error('Failed to release phone number')
    }
  }

  // Send verification code via SMS
  async sendVerificationCode(to: string, code: string): Promise<void> {
    const url = `${this.baseUrl}/Messages.json`

    // Use the first configured number as the sender
    // In production, this should be a dedicated verification number
    const from = process.env.SIGNALWIRE_VERIFICATION_NUMBER || '+15555555555'

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          From: from,
          To: to,
          Body: `Your Call Helm verification code is: ${code}. This code expires in 10 minutes.`
        })
      })

      if (!response.ok) {
        throw new Error(`Failed to send verification: ${response.statusText}`)
      }
    } catch (error) {
      voiceLogger.error('SignalWire sendVerificationCode error', { error })
      throw new Error('Failed to send verification code')
    }
  }

  // Send verification code via voice call (works for landlines and mobile)
  async sendVerificationCall(to: string, code: string): Promise<void> {
    const url = `${this.baseUrl}/Calls.json`

    // Use the verification number as the caller ID
    const from = process.env.SIGNALWIRE_VERIFICATION_NUMBER || '+15555555555'

    // Create TwiML that speaks the verification code
    // Format code with pauses between digits for clarity
    const spokenCode = code.split('').join('. ')
    const twimlUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/twiml/verification?code=${encodeURIComponent(spokenCode)}`

    try {
      const formData = new URLSearchParams()
      formData.append('From', from)
      formData.append('To', to)
      formData.append('Url', twimlUrl)
      formData.append('Method', 'GET')
      // Timeout after 30 seconds if no answer
      formData.append('Timeout', '30')

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      })

      if (!response.ok) {
        const errorText = await response.text()
        voiceLogger.error('SignalWire verification call failed', { errorText, status: response.status })
        throw new Error(`Failed to initiate verification call: ${response.statusText}`)
      }

      const data = await response.json()
      voiceLogger.info('Verification call initiated', { callSid: data.sid })
    } catch (error) {
      voiceLogger.error('SignalWire sendVerificationCall error', { error })
      throw new Error('Failed to initiate verification call')
    }
  }

  // Lookup phone number type (mobile, landline, voip, etc.)
  async lookupPhoneNumber(phoneNumber: string): Promise<{
    type: 'mobile' | 'landline' | 'voip' | 'unknown'
    carrier?: string
    valid: boolean
  }> {
    // Use SignalWire's lookup API to determine number type
    const url = `https://${SIGNALWIRE_SPACE_URL}/api/relay/rest/lookup/phone_number/${encodeURIComponent(phoneNumber)}?include=carrier`

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        // If lookup fails, return unknown but still valid
        return { type: 'unknown', valid: true }
      }

      const data = await response.json()

      // Map carrier type to our simplified type
      let type: 'mobile' | 'landline' | 'voip' | 'unknown' = 'unknown'
      if (data.carrier?.type) {
        const carrierType = data.carrier.type.toLowerCase()
        if (carrierType === 'mobile' || carrierType === 'wireless') {
          type = 'mobile'
        } else if (carrierType === 'landline' || carrierType === 'fixed') {
          type = 'landline'
        } else if (carrierType === 'voip') {
          type = 'voip'
        }
      }

      return {
        type,
        carrier: data.carrier?.name,
        valid: data.valid !== false
      }
    } catch (error) {
      voiceLogger.error('SignalWire lookupPhoneNumber error', { error, phoneNumber })
      // Return unknown if lookup fails
      return { type: 'unknown', valid: true }
    }
  }

  // End an active call
  async endCall(callSid: string): Promise<void> {
    const url = `${this.baseUrl}/Calls/${callSid}.json`
    
    try {
      // SignalWire expects form-encoded data for Call updates
      const formData = new URLSearchParams()
      formData.append('Status', 'completed')
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      })

      if (!response.ok) {
        const error = await response.text()
        voiceLogger.error('SignalWire endCall API error', { error, status: response.status, callSid })
        throw new Error(`SignalWire API Error: ${response.status} - ${error}`)
      }

      voiceLogger.info('Successfully ended call', { callSid })
    } catch (error) {
      voiceLogger.error('SignalWire endCall error', { error, callSid })
      throw error
    }
  }

  // Make an outbound call with custom parameters
  async initiateCallWithParams(params: {
    from: string
    to: string
    recordingEnabled?: boolean
    callerId?: string
    params?: Record<string, string>
  }): Promise<string> {
    const url = `${this.baseUrl}/Calls.json`

    voiceLogger.debug('initiateCallWithParams called', { from: params.from, to: params.to })

    // Use APP_URL first (server-side), fallback to NEXT_PUBLIC_APP_URL
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL

    // Build TwiML URL with custom parameters
    const urlParams = new URLSearchParams(params.params || {})
    const twimlUrl = `${baseUrl}/api/voice/twiml?${urlParams.toString()}`
    const statusUrl = `${baseUrl}/api/voice/status`

    voiceLogger.debug('SignalWire call URLs', { twimlUrl, statusUrl })
    
    try {
      // SignalWire expects form-encoded data for Call creation
      const formData = new URLSearchParams()
      formData.append('From', params.callerId || params.from)
      formData.append('To', params.to)
      formData.append('Url', twimlUrl)
      formData.append('Method', 'POST')
      if (params.recordingEnabled !== false) {
        formData.append('Record', 'true')
      }
      formData.append('StatusCallback', statusUrl)
      formData.append('StatusCallbackEvent', 'initiated')
      formData.append('StatusCallbackEvent', 'ringing')
      formData.append('StatusCallbackEvent', 'answered')
      formData.append('StatusCallbackEvent', 'completed')
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      })

      if (!response.ok) {
        const error = await response.text()
        voiceLogger.error('SignalWire initiateCallWithParams API error', { error, status: response.status })
        throw new Error(`SignalWire API Error: ${response.status} - ${error}`)
      }

      const data = await response.json()
      return data.sid // Return call SID for tracking
    } catch (error) {
      voiceLogger.error('SignalWire initiateCallWithParams error', { error })
      throw error // Throw the original error for better debugging
    }
  }

  // Make an outbound call (legacy method for backwards compatibility)
  async initiateCall(params: {
    from: string
    to: string
    recordingEnabled?: boolean
    callerId?: string
  }): Promise<string> {
    const url = `${this.baseUrl}/Calls.json`
    
    // Use APP_URL first (server-side), fallback to NEXT_PUBLIC_APP_URL
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
    const twimlUrl = `${baseUrl}/api/voice/twiml`
    const statusUrl = `${baseUrl}/api/voice/status`
    
    try {
      // SignalWire expects form-encoded data for Call creation
      const formData = new URLSearchParams()
      formData.append('From', params.callerId || params.from)
      formData.append('To', params.to)
      formData.append('Url', twimlUrl)
      formData.append('Method', 'POST')
      if (params.recordingEnabled !== false) {
        formData.append('Record', 'true')
      }
      formData.append('StatusCallback', statusUrl)
      formData.append('StatusCallbackEvent', 'initiated')
      formData.append('StatusCallbackEvent', 'ringing')
      formData.append('StatusCallbackEvent', 'answered')
      formData.append('StatusCallbackEvent', 'completed')
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData.toString()
      })

      if (!response.ok) {
        const error = await response.text()
        voiceLogger.error('SignalWire initiateCall API error', { error, status: response.status })
        throw new Error(`SignalWire API Error: ${response.status} - ${error}`)
      }

      const data = await response.json()
      return data.sid // Return call SID for tracking
    } catch (error) {
      voiceLogger.error('SignalWire initiateCall error', { error })
      throw error // Throw the original error for better debugging
    }
  }

  // Get call recording
  async getCallRecording(callSid: string): Promise<string | null> {
    const url = `${this.baseUrl}/Calls/${callSid}/Recordings.json`
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${this.auth}`
        }
      })

      if (!response.ok) {
        return null
      }

      const data = await response.json()
      if (data.recordings && data.recordings.length > 0) {
        const recordingSid = data.recordings[0].sid
        return `${this.baseUrl}/Recordings/${recordingSid}.mp3`
      }

      return null
    } catch (error) {
      voiceLogger.error('SignalWire getCallRecording error', { error, callSid })
      return null
    }
  }

  // === SELF-SERVICE NUMBER MANAGEMENT METHODS ===
  
  // Configure webhooks for an organization's number automatically
  async configureOrganizationWebhooks(numberSid: string, organizationId: string): Promise<void> {
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
    
    // Organization-specific webhook URLs
    const webhookParams = new URLSearchParams({ org: organizationId })
    const voiceUrl = `${baseUrl}/api/voice/webhook?${webhookParams}`
    const smsReceiveUrl = `${baseUrl}/api/sms/receive?${webhookParams}`
    const statusUrl = `${baseUrl}/api/voice/status?${webhookParams}`
    
    await this.updateWebhookUrls(numberSid, {
      voiceUrl,
      smsUrl: smsReceiveUrl,
      statusCallback: statusUrl
    })
  }

  // Purchase a number for a specific organization
  async purchaseNumberForOrganization(phoneNumber: string, organizationId: string, params?: {
    friendlyName?: string
  }): Promise<SignalWireNumber> {
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
    const webhookParams = new URLSearchParams({ org: organizationId })
    
    const result = await this.purchaseNumber(phoneNumber, {
      friendlyName: params?.friendlyName || `Number for Organization ${organizationId}`,
      voiceUrl: `${baseUrl}/api/voice/webhook?${webhookParams}`,
      smsUrl: `${baseUrl}/api/sms/receive?${webhookParams}`
    })
    
    return result
  }

  // === NUMBER PORTING METHODS ===
  
  // Submit a porting request to SignalWire
  async submitPortingRequest(params: {
    phoneNumber: string
    currentProvider: string
    accountNumber: string
    pinCode: string
    authorizedContactName: string
    authorizedContactEmail: string
    authorizedContactPhone: string
    billingAddress: {
      street: string
      city: string
      state: string
      zip: string
      country: string
    }
    serviceAddress?: {
      street: string
      city: string
      state: string
      zip: string
      country: string
    }
    requestedPortDate?: string
    organizationId: string
  }): Promise<PortingRequest> {
    const url = `${this.baseUrl}/PortingRequests.json`
    
    try {
      const formData = new URLSearchParams()
      formData.append('PhoneNumber', params.phoneNumber)
      formData.append('CurrentProvider', params.currentProvider)
      formData.append('AccountNumber', params.accountNumber)
      formData.append('PinCode', params.pinCode)
      formData.append('AuthorizedContactName', params.authorizedContactName)
      formData.append('AuthorizedContactEmail', params.authorizedContactEmail)
      formData.append('AuthorizedContactPhone', params.authorizedContactPhone)
      
      // Billing address
      formData.append('BillingAddress[Street]', params.billingAddress.street)
      formData.append('BillingAddress[City]', params.billingAddress.city)
      formData.append('BillingAddress[State]', params.billingAddress.state)
      formData.append('BillingAddress[PostalCode]', params.billingAddress.zip)
      formData.append('BillingAddress[Country]', params.billingAddress.country)
      
      // Service address if different
      if (params.serviceAddress) {
        formData.append('ServiceAddress[Street]', params.serviceAddress.street)
        formData.append('ServiceAddress[City]', params.serviceAddress.city)
        formData.append('ServiceAddress[State]', params.serviceAddress.state)
        formData.append('ServiceAddress[PostalCode]', params.serviceAddress.zip)
        formData.append('ServiceAddress[Country]', params.serviceAddress.country)
      }
      
      if (params.requestedPortDate) {
        formData.append('RequestedPortDate', params.requestedPortDate)
      }
      
      // Configure webhooks for this organization when ported
      const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
      const webhookParams = new URLSearchParams({ org: params.organizationId })
      formData.append('VoiceUrl', `${baseUrl}/api/voice/webhook?${webhookParams}`)
      formData.append('SmsUrl', `${baseUrl}/api/sms/receive?${webhookParams}`)
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Porting request failed: ${error}`)
      }
      
      const data = await response.json()
      return {
        id: data.sid,
        phoneNumber: data.phone_number,
        status: data.status,
        statusDetails: data.status_details,
        requestedPortDate: data.requested_port_date,
        actualPortDate: data.actual_port_date
      }
    } catch (error) {
      voiceLogger.error('SignalWire submitPortingRequest error', { error })
      throw new Error('Failed to submit porting request')
    }
  }

  // Get porting request status
  async getPortingRequestStatus(portingRequestId: string): Promise<PortingRequest> {
    const url = `${this.baseUrl}/PortingRequests/${portingRequestId}.json`
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${this.auth}`
        }
      })
      
      if (!response.ok) {
        throw new Error(`Failed to get porting status: ${response.statusText}`)
      }
      
      const data = await response.json()
      return {
        id: data.sid,
        phoneNumber: data.phone_number,
        status: data.status,
        statusDetails: data.status_details,
        requestedPortDate: data.requested_port_date,
        actualPortDate: data.actual_port_date,
        rejectionReason: data.rejection_reason
      }
    } catch (error) {
      voiceLogger.error('SignalWire getPortingRequestStatus error', { error, portingRequestId })
      throw new Error('Failed to get porting request status')
    }
  }

  // === CAMPAIGN REGISTRY METHODS ===
  
  // Create a brand for 10DLC compliance
  async createBrand(params: {
    brandName: string
    legalCompanyName: string
    einTaxId: string
    businessType: string
    industry: string
    websiteUrl?: string
    address: {
      street: string
      city: string
      state: string
      zip: string
      country: string
    }
    phoneNumber: string
    email: string
  }): Promise<Brand> {
    const url = `${this.campaignRegistryUrl}/brands`
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          display_name: params.brandName,
          legal_company_name: params.legalCompanyName,
          ein_issuing_country: params.address.country,
          entity_type: params.businessType,
          vertical: params.industry,
          website_url: params.websiteUrl,
          address: {
            street: params.address.street,
            city: params.address.city,
            state: params.address.state,
            postal_code: params.address.zip,
            country: params.address.country
          },
          phone: params.phoneNumber,
          email: params.email,
          ein: params.einTaxId,
          brand_relationship: 'DIRECT'
        })
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Brand creation failed: ${error}`)
      }
      
      const data = await response.json()
      return {
        id: data.brand_id,
        brandName: data.display_name,
        legalCompanyName: data.legal_company_name,
        status: data.brand_registration_status?.toLowerCase() || 'pending'
      }
    } catch (error) {
      voiceLogger.error('SignalWire createBrand error', { error })
      throw new Error('Failed to create brand')
    }
  }

  // Create a campaign for 10DLC compliance
  async createCampaign(params: {
    brandId: string
    campaignName: string
    useCase: string
    useCaseDescription: string
    messageSamples: string[]
    optInKeywords: string[]
    optOutKeywords: string[]
    helpKeywords: string[]
    helpMessage: string
    optInMessage?: string
    optOutMessage: string
    monthlyMessageVolume: number
    subscriberOptinFlow: string
    subscriberOptinFlowDescription: string
    ageGating?: boolean
    directLending?: boolean
    embeddedLink?: boolean
    embeddedPhone?: boolean
    affiliateMarketing?: boolean
  }): Promise<Campaign> {
    const url = `${this.campaignRegistryUrl}/campaigns`
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          brand_id: params.brandId,
          campaign_id: params.campaignName,
          vertical: params.useCase,
          use_case: params.useCaseDescription,
          message_samples: params.messageSamples,
          opt_in_keywords: params.optInKeywords,
          opt_out_keywords: params.optOutKeywords,
          help_keywords: params.helpKeywords,
          help_message: params.helpMessage,
          opt_in_message: params.optInMessage,
          opt_out_message: params.optOutMessage,
          message_volume: params.monthlyMessageVolume,
          subscriber_opt_in: params.subscriberOptinFlow,
          subscriber_opt_in_description: params.subscriberOptinFlowDescription,
          age_gated: params.ageGating || false,
          direct_lending: params.directLending || false,
          embedded_link: params.embeddedLink || false,
          embedded_phone: params.embeddedPhone || false,
          affiliate_marketing: params.affiliateMarketing || false
        })
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Campaign creation failed: ${error}`)
      }
      
      const data = await response.json()
      return {
        id: data.campaign_id,
        campaignName: params.campaignName,
        brandId: params.brandId,
        useCase: params.useCase,
        status: data.campaign_status?.toLowerCase() || 'pending'
      }
    } catch (error) {
      voiceLogger.error('SignalWire createCampaign error', { error })
      throw new Error('Failed to create campaign')
    }
  }

  // Get brand status
  async getBrandStatus(brandId: string): Promise<Brand> {
    const url = `${this.campaignRegistryUrl}/brands/${brandId}`
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${this.auth}`
        }
      })
      
      if (!response.ok) {
        throw new Error(`Failed to get brand status: ${response.statusText}`)
      }
      
      const data = await response.json()
      return {
        id: data.brand_id,
        brandName: data.display_name,
        legalCompanyName: data.legal_company_name,
        status: data.brand_registration_status?.toLowerCase() || 'pending',
        approvalDate: data.approval_date,
        rejectionReason: data.rejection_reason
      }
    } catch (error) {
      voiceLogger.error('SignalWire getBrandStatus error', { error, brandId })
      throw new Error('Failed to get brand status')
    }
  }

  // Get campaign status
  async getCampaignStatus(campaignId: string): Promise<Campaign> {
    const url = `${this.campaignRegistryUrl}/campaigns/${campaignId}`
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${this.auth}`
        }
      })
      
      if (!response.ok) {
        throw new Error(`Failed to get campaign status: ${response.statusText}`)
      }
      
      const data = await response.json()
      return {
        id: data.campaign_id,
        campaignName: data.campaign_id,
        brandId: data.brand_id,
        useCase: data.vertical,
        status: data.campaign_status?.toLowerCase() || 'pending',
        approvalDate: data.approval_date,
        rejectionReason: data.rejection_reason
      }
    } catch (error) {
      voiceLogger.error('SignalWire getCampaignStatus error', { error, campaignId })
      throw new Error('Failed to get campaign status')
    }
  }

  // Validate that SignalWire is properly configured
  static isConfigured(): boolean {
    return !!(
      process.env.SIGNALWIRE_SPACE_URL &&
      process.env.SIGNALWIRE_PROJECT_ID &&
      process.env.SIGNALWIRE_API_TOKEN
    )
  }
}

// Export singleton instance
export const signalwireService = new SignalWireService()