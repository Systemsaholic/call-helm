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
    this.baseUrl = `https://${SIGNALWIRE_SPACE_URL}/api/relay/rest`
    this.auth = Buffer.from(`${SIGNALWIRE_PROJECT_ID}:${SIGNALWIRE_API_TOKEN}`).toString('base64')
  }

  // Search for available phone numbers by area code or region
  async searchAvailableNumbers(params: {
    areaCode?: string
    region?: string
    country?: string
    contains?: string
  }): Promise<AvailableNumber[]> {
    const queryParams = new URLSearchParams()
    if (params.areaCode) queryParams.append('AreaCode', params.areaCode)
    if (params.region) queryParams.append('InRegion', params.region)
    if (params.contains) queryParams.append('Contains', params.contains)
    
    const country = params.country || 'US'
    const url = `${this.baseUrl}/availablePhoneNumbers/${country}/local?${queryParams}`

    try {
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
      
      // Transform SignalWire response to our format
      return data.available_phone_numbers.map((num: any) => ({
        phoneNumber: num.phone_number,
        friendlyName: num.friendly_name,
        locality: num.locality || 'Unknown',
        region: num.region || 'Unknown',
        postalCode: num.postal_code || '',
        capabilities: {
          voice: num.capabilities?.voice || false,
          sms: num.capabilities?.sms || false,
          mms: num.capabilities?.mms || false
        },
        monthlyPrice: parseFloat(num.monthly_price || '0')
      }))
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
    const url = `${this.baseUrl}/incomingPhoneNumbers`
    
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
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to purchase number: ${error}`)
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
    const url = `${this.baseUrl}/incomingPhoneNumbers/${numberSid}`
    
    const voiceUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/forward`
    
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

  // Release a phone number
  async releaseNumber(numberSid: string): Promise<void> {
    const url = `${this.baseUrl}/incomingPhoneNumbers/${numberSid}`
    
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
    const url = `${this.baseUrl}/messages`
    
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

  // Make an outbound call
  async initiateCall(params: {
    from: string
    to: string
    recordingEnabled?: boolean
    callerId?: string
  }): Promise<string> {
    const url = `${this.baseUrl}/calls`
    
    const twimlUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/twiml`
    const statusUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/status`
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${this.auth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          From: params.callerId || params.from,
          To: params.to,
          Url: twimlUrl,
          Method: 'POST',
          Record: params.recordingEnabled !== false,
          StatusCallback: statusUrl,
          StatusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`Failed to initiate call: ${error}`)
      }

      const data = await response.json()
      return data.sid // Return call SID for tracking
    } catch (error) {
      console.error('SignalWire initiateCall error:', error)
      throw new Error('Failed to initiate call')
    }
  }

  // Get call recording
  async getCallRecording(callSid: string): Promise<string | null> {
    const url = `${this.baseUrl}/calls/${callSid}/recordings`
    
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
        return `${this.baseUrl}/recordings/${recordingSid}.mp3`
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