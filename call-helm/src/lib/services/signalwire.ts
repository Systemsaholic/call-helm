import crypto from 'crypto'

// This service handles all SignalWire interactions server-side
// Users never see or interact with SignalWire directly

const SIGNALWIRE_SPACE_URL = process.env.SIGNALWIRE_SPACE_URL || 'call-helm.signalwire.com'
const SIGNALWIRE_PROJECT_ID = process.env.SIGNALWIRE_PROJECT_ID || ''
const SIGNALWIRE_API_TOKEN = process.env.SIGNALWIRE_API_TOKEN || ''

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

interface SignalWireNumber {
  sid: string
  phoneNumber: string
  friendlyName: string
  capabilities: any
  status: string
}

export class SignalWireService {
  private baseUrl: string
  private auth: string

  constructor() {
    console.log(`DEBUG: Constructor values:`)
    console.log(`- SIGNALWIRE_SPACE_URL: ${SIGNALWIRE_SPACE_URL}`)
    console.log(`- SIGNALWIRE_PROJECT_ID: ${SIGNALWIRE_PROJECT_ID}`)
    console.log(`- SIGNALWIRE_API_TOKEN: ${SIGNALWIRE_API_TOKEN ? 'SET' : 'NOT SET'}`)
    
    this.baseUrl = `https://${SIGNALWIRE_SPACE_URL}/api/laml/2010-04-01/Accounts/${SIGNALWIRE_PROJECT_ID}`
    this.auth = Buffer.from(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`).toString('base64')
    
    console.log(`DEBUG: Constructed baseUrl: ${this.baseUrl}`)
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
      console.log(`SignalWire search URL: ${url}`)
      
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
      console.log(`SignalWire returned ${data.available_phone_numbers?.length || 0} local numbers`)
      
      // Debug: Log sample data to see what SignalWire returns
      if (data.available_phone_numbers?.length > 0) {
        console.log('Sample SignalWire number data:', JSON.stringify(data.available_phone_numbers[0], null, 2))
      }
      
      // Transform SignalWire response to our format
      return (data.available_phone_numbers || []).map((num: any) => {
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
      console.error('SignalWire searchAvailableNumbers error:', error)
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
    
    const body: any = {
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
        console.error('SignalWire purchase error:', error)
        
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
      console.error('SignalWire purchaseNumber error:', error)
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
      console.error('SignalWire configureForwarding error:', error)
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
        console.error('SignalWire API Error:', errorText)
        throw new Error(`Failed to update webhook URLs: ${response.statusText} - ${errorText}`)
      }
      
      console.log(`Successfully updated webhook URLs for ${numberSid}:`)
      console.log(`- Voice URL: ${voiceUrl}`)
      console.log(`- SMS URL: ${smsUrl}`)
      console.log(`- Status Callback: ${statusCallback}`)
    } catch (error) {
      console.error('SignalWire updateWebhookUrls error:', error)
      throw new Error('Failed to update webhook URLs')
    }
  }

  // List all numbers owned by this account
  async listOwnedNumbers(): Promise<any[]> {
    const url = `${this.baseUrl}/IncomingPhoneNumbers.json`
    
    console.log(`DEBUG: Attempting to fetch from URL: ${url}`)
    console.log(`DEBUG: Base URL: ${this.baseUrl}`)
    
    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Basic ${this.auth}`
        }
      })

      console.log(`DEBUG: Response status: ${response.status} ${response.statusText}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`DEBUG: Error response body: ${errorText}`)
        throw new Error(`Failed to list numbers: ${response.statusText}`)
      }

      const data = await response.json()
      return data.incoming_phone_numbers || []
    } catch (error) {
      console.error('SignalWire listOwnedNumbers error:', error)
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
      console.error('SignalWire releaseNumber error:', error)
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
      console.error('SignalWire sendVerificationCode error:', error)
      throw new Error('Failed to send verification code')
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
        console.error('SignalWire API Error Response:', error)
        throw new Error(`SignalWire API Error: ${response.status} - ${error}`)
      }

      console.log(`Successfully ended call ${callSid}`)
    } catch (error) {
      console.error('SignalWire endCall error:', error)
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
    
    console.log('[SignalWire] initiateCallWithParams called with:', params)
    
    // Use APP_URL first (server-side), fallback to NEXT_PUBLIC_APP_URL
    const baseUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
    
    // Build TwiML URL with custom parameters
    const urlParams = new URLSearchParams(params.params || {})
    const twimlUrl = `${baseUrl}/api/voice/twiml?${urlParams.toString()}`
    const statusUrl = `${baseUrl}/api/voice/status`
    
    console.log('[SignalWire] TwiML URL:', twimlUrl)
    console.log('[SignalWire] Status URL:', statusUrl)
    
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
        console.error('SignalWire API Error Response:', error)
        throw new Error(`SignalWire API Error: ${response.status} - ${error}`)
      }

      const data = await response.json()
      return data.sid // Return call SID for tracking
    } catch (error) {
      console.error('SignalWire initiateCallWithParams error:', error)
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
        console.error('SignalWire API Error Response:', error)
        throw new Error(`SignalWire API Error: ${response.status} - ${error}`)
      }

      const data = await response.json()
      return data.sid // Return call SID for tracking
    } catch (error) {
      console.error('SignalWire initiateCall error:', error)
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
      console.error('SignalWire getCallRecording error:', error)
      return null
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