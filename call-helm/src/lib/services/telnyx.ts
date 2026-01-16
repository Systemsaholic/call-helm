/**
 * Telnyx Service
 *
 * Handles all Telnyx API interactions for voice calls, SMS, and phone number management.
 * Uses Call Control API for voice (best quality/latency) and REST API for messaging.
 *
 * Key features:
 * - Call Control API for real-time voice control
 * - Dual-channel recording for AI analysis
 * - Hosted numbers (BYON) support
 * - Optimal codec selection (OPUS/G.722)
 */

// Environment variables
const TELNYX_API_KEY = process.env.TELNYX_API_KEY || ''
const TELNYX_CONNECTION_ID = process.env.TELNYX_CONNECTION_ID || ''
const TELNYX_MESSAGING_PROFILE_ID = process.env.TELNYX_MESSAGING_PROFILE_ID || ''

// API base URLs
const TELNYX_API_BASE = 'https://api.telnyx.com/v2'

// Types
export interface TelnyxNumber {
  id: string
  phoneNumber: string
  status: string
  connectionId?: string
  messagingProfileId?: string
  features: {
    voice: boolean
    sms: boolean
    mms: boolean
    fax: boolean
  }
  monthlyPrice?: number
}

export interface AvailableNumber {
  phoneNumber: string
  locality: string
  region: string
  postalCode?: string
  rateCenter?: string
  features: string[]
  monthlyPrice: number
  upfrontPrice: number
  reservable: boolean
}

export interface CallOptions {
  from: string
  to: string
  connectionId?: string
  webhookUrl?: string
  recordingEnabled?: boolean
  recordingChannels?: 'single' | 'dual'
  recordingFormat?: 'wav' | 'mp3'
  answeringMachineDetection?: boolean
  clientState?: string
  customHeaders?: Record<string, string>
}

export interface CallControlId {
  callControlId: string
  callSessionId: string
  callLegId: string
}

export interface MessageOptions {
  from: string
  to: string
  text: string
  messagingProfileId?: string
  webhookUrl?: string
  mediaUrls?: string[]
}

export interface MessageResult {
  id: string
  to: string
  from: string
  text: string
  status: string
  direction: string
  parts?: number
  encoding?: string
  cost?: {
    amount: string
    currency: string
  }
}

export interface RecordingOptions {
  format?: 'wav' | 'mp3'
  channels?: 'single' | 'dual'
  playBeep?: boolean
  maxLength?: number
  transcription?: boolean
  transcriptionEngine?: 'A' | 'B'
  transcriptionLanguage?: string
}

export interface Recording {
  id: string
  callControlId: string
  callSessionId: string
  channels: string
  format: string
  urls: {
    wav?: string
    mp3?: string
  }
  startedAt: string
  endedAt: string
  durationSeconds: number
}

export interface HostedNumberOrder {
  id: string
  messagingProfileId: string
  status: string
  phoneNumbers: {
    id: string
    phoneNumber: string
    status: string
  }[]
}

export interface PortingOrder {
  id: string
  status: string
  phoneNumbers: {
    phoneNumber: string
    status: string
  }[]
  createdAt: string
}

export interface CallQualityStats {
  inbound: {
    mos: string
    jitter: string
    packetCount: string
    skipPacketCount: string
  }
  outbound: {
    packetCount: string
    skipPacketCount: string
  }
}

export interface WebhookEvent {
  eventType: string
  id: string
  occurredAt: string
  payload: Record<string, unknown>
  recordType: string
}

/**
 * Main Telnyx Service Class
 *
 * Implements Call Control API for voice and REST API for messaging.
 */
export class TelnyxService {
  private apiKey: string
  private connectionId: string
  private messagingProfileId: string
  private baseUrl: string

  constructor(options?: {
    apiKey?: string
    connectionId?: string
    messagingProfileId?: string
  }) {
    this.apiKey = options?.apiKey || TELNYX_API_KEY
    this.connectionId = options?.connectionId || TELNYX_CONNECTION_ID
    this.messagingProfileId = options?.messagingProfileId || TELNYX_MESSAGING_PROFILE_ID
    this.baseUrl = TELNYX_API_BASE

    if (!this.apiKey) {
      console.warn('TelnyxService: No API key configured')
    }
  }

  /**
   * Make authenticated API request to Telnyx
   */
  private async request<T>(
    endpoint: string,
    options: {
      method?: string
      body?: Record<string, unknown>
      params?: Record<string, string>
    } = {}
  ): Promise<T> {
    const { method = 'GET', body, params } = options

    let url = `${this.baseUrl}${endpoint}`
    if (params) {
      const searchParams = new URLSearchParams(params)
      url += `?${searchParams.toString()}`
    }

    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`Telnyx API Error [${response.status}]:`, errorText)

      let errorMessage = `Telnyx API Error: ${response.status}`
      try {
        const errorJson = JSON.parse(errorText)
        if (errorJson.errors?.[0]?.detail) {
          errorMessage = errorJson.errors[0].detail
        } else if (errorJson.errors?.[0]?.title) {
          errorMessage = errorJson.errors[0].title
        }
      } catch {
        // Use default error message
      }

      throw new Error(errorMessage)
    }

    const data = await response.json()
    return data.data || data
  }

  // ============================================
  // VOICE - CALL CONTROL API
  // ============================================

  /**
   * Initiate an outbound call using Call Control API
   * Uses optimal settings for quality and AI analysis
   */
  async initiateCall(options: CallOptions): Promise<CallControlId> {
    const webhookUrl = options.webhookUrl ||
      `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/voice/telnyx/webhook`

    const body: Record<string, unknown> = {
      connection_id: options.connectionId || this.connectionId,
      to: options.to,
      from: options.from,
      webhook_url: webhookUrl,
      webhook_url_method: 'POST'
    }

    // Add answering machine detection if enabled
    if (options.answeringMachineDetection) {
      body.answering_machine_detection = 'detect'
      body.answering_machine_detection_config = {
        after_greeting_silence_millis: 800,
        total_analysis_time_millis: 5000
      }
    }

    // Add client state for tracking (base64 encoded)
    if (options.clientState) {
      body.client_state = Buffer.from(options.clientState).toString('base64')
    }

    // Add custom SIP headers if provided
    if (options.customHeaders) {
      body.custom_headers = Object.entries(options.customHeaders).map(([name, value]) => ({
        name,
        value
      }))
    }

    console.log('[Telnyx] Initiating call:', { to: options.to, from: options.from })

    const result = await this.request<{
      call_control_id: string
      call_session_id: string
      call_leg_id: string
    }>('/calls', { method: 'POST', body })

    return {
      callControlId: result.call_control_id,
      callSessionId: result.call_session_id,
      callLegId: result.call_leg_id
    }
  }

  /**
   * Answer an incoming call
   */
  async answerCall(callControlId: string, clientState?: string): Promise<void> {
    const body: Record<string, unknown> = {}

    if (clientState) {
      body.client_state = Buffer.from(clientState).toString('base64')
    }

    await this.request(`/calls/${callControlId}/actions/answer`, {
      method: 'POST',
      body
    })

    console.log('[Telnyx] Call answered:', callControlId)
  }

  /**
   * Hang up a call
   */
  async hangupCall(callControlId: string): Promise<void> {
    await this.request(`/calls/${callControlId}/actions/hangup`, {
      method: 'POST',
      body: {}
    })

    console.log('[Telnyx] Call hung up:', callControlId)
  }

  /**
   * Start recording with optimal settings for AI analysis
   * Uses dual-channel WAV for best quality
   */
  async startRecording(callControlId: string, options: RecordingOptions = {}): Promise<void> {
    const body: Record<string, unknown> = {
      format: options.format || 'wav',
      channels: options.channels || 'dual', // Dual for AI analysis
      play_beep: options.playBeep ?? false,
      max_length: options.maxLength || 0, // 0 = no limit
    }

    // Enable transcription if requested (uses Telnyx engine B for lower latency)
    if (options.transcription) {
      body.transcription = true
      body.transcription_engine = options.transcriptionEngine || 'B'
      body.transcription_language = options.transcriptionLanguage || 'en-US'
    }

    await this.request(`/calls/${callControlId}/actions/record_start`, {
      method: 'POST',
      body
    })

    console.log('[Telnyx] Recording started:', callControlId, { channels: body.channels, format: body.format })
  }

  /**
   * Stop recording
   */
  async stopRecording(callControlId: string): Promise<void> {
    await this.request(`/calls/${callControlId}/actions/record_stop`, {
      method: 'POST',
      body: {}
    })

    console.log('[Telnyx] Recording stopped:', callControlId)
  }

  /**
   * Play text-to-speech
   */
  async speak(
    callControlId: string,
    text: string,
    options: {
      voice?: string
      language?: string
      clientState?: string
    } = {}
  ): Promise<void> {
    const body: Record<string, unknown> = {
      payload: text,
      voice: options.voice || 'female',
      language: options.language || 'en-US'
    }

    if (options.clientState) {
      body.client_state = Buffer.from(options.clientState).toString('base64')
    }

    await this.request(`/calls/${callControlId}/actions/speak`, {
      method: 'POST',
      body
    })
  }

  /**
   * Play audio file
   */
  async playAudio(
    callControlId: string,
    audioUrl: string,
    options: {
      loop?: boolean
      clientState?: string
    } = {}
  ): Promise<void> {
    const body: Record<string, unknown> = {
      audio_url: audioUrl,
      loop: options.loop ? 'infinity' : undefined
    }

    if (options.clientState) {
      body.client_state = Buffer.from(options.clientState).toString('base64')
    }

    await this.request(`/calls/${callControlId}/actions/playback_start`, {
      method: 'POST',
      body
    })
  }

  /**
   * Stop audio playback
   */
  async stopAudio(callControlId: string): Promise<void> {
    await this.request(`/calls/${callControlId}/actions/playback_stop`, {
      method: 'POST',
      body: {}
    })
  }

  /**
   * Gather DTMF digits
   */
  async gatherDTMF(
    callControlId: string,
    options: {
      validDigits?: string
      minDigits?: number
      maxDigits?: number
      timeoutMillis?: number
      interDigitTimeoutMillis?: number
      clientState?: string
    } = {}
  ): Promise<void> {
    const body: Record<string, unknown> = {
      valid_digits: options.validDigits || '0123456789*#',
      min_digits: options.minDigits || 1,
      max_digits: options.maxDigits || 128,
      timeout_millis: options.timeoutMillis || 60000,
      inter_digit_timeout_millis: options.interDigitTimeoutMillis || 5000
    }

    if (options.clientState) {
      body.client_state = Buffer.from(options.clientState).toString('base64')
    }

    await this.request(`/calls/${callControlId}/actions/gather`, {
      method: 'POST',
      body
    })
  }

  /**
   * Transfer call to another number
   */
  async transferCall(
    callControlId: string,
    to: string,
    options: {
      from?: string
      webhookUrl?: string
      clientState?: string
    } = {}
  ): Promise<void> {
    const body: Record<string, unknown> = {
      to
    }

    if (options.from) body.from = options.from
    if (options.webhookUrl) body.webhook_url = options.webhookUrl
    if (options.clientState) {
      body.client_state = Buffer.from(options.clientState).toString('base64')
    }

    await this.request(`/calls/${callControlId}/actions/transfer`, {
      method: 'POST',
      body
    })

    console.log('[Telnyx] Call transferred:', callControlId, '-> ', to)
  }

  /**
   * Bridge two calls together
   */
  async bridgeCalls(callControlId: string, targetCallControlId: string): Promise<void> {
    await this.request(`/calls/${callControlId}/actions/bridge`, {
      method: 'POST',
      body: {
        call_control_id: targetCallControlId
      }
    })

    console.log('[Telnyx] Calls bridged:', callControlId, '<->', targetCallControlId)
  }

  /**
   * Put call on hold
   */
  async holdCall(callControlId: string, audioUrl?: string): Promise<void> {
    const body: Record<string, unknown> = {}
    if (audioUrl) {
      body.audio_url = audioUrl
    }

    await this.request(`/calls/${callControlId}/actions/hold`, {
      method: 'POST',
      body
    })
  }

  /**
   * Resume call from hold
   */
  async unholdCall(callControlId: string): Promise<void> {
    await this.request(`/calls/${callControlId}/actions/unhold`, {
      method: 'POST',
      body: {}
    })
  }

  // ============================================
  // SMS MESSAGING
  // ============================================

  /**
   * Send an SMS message
   */
  async sendMessage(options: MessageOptions): Promise<MessageResult> {
    const body: Record<string, unknown> = {
      from: options.from,
      to: options.to,
      text: options.text
    }

    // Use messaging profile if provided or default
    if (options.messagingProfileId || this.messagingProfileId) {
      body.messaging_profile_id = options.messagingProfileId || this.messagingProfileId
    }

    // Add webhook URL for delivery status
    if (options.webhookUrl) {
      body.webhook_url = options.webhookUrl
    }

    // Add media URLs for MMS
    if (options.mediaUrls?.length) {
      body.media_urls = options.mediaUrls
    }

    console.log('[Telnyx] Sending message:', { to: options.to, from: options.from })

    const result = await this.request<{
      id: string
      to: { phone_number: string; status: string }[]
      from: { phone_number: string }
      text: string
      direction: string
      parts?: number
      encoding?: string
      cost?: { amount: string; currency: string }
    }>('/messages', { method: 'POST', body })

    return {
      id: result.id,
      to: result.to[0]?.phone_number || options.to,
      from: result.from?.phone_number || options.from,
      text: result.text,
      status: result.to[0]?.status || 'queued',
      direction: result.direction,
      parts: result.parts || 1,
      encoding: result.encoding,
      cost: result.cost
    }
  }

  /**
   * Send verification code via SMS
   */
  async sendVerificationSMS(to: string, code: string, from?: string): Promise<MessageResult> {
    const verificationFrom = from || process.env.TELNYX_VERIFICATION_NUMBER || ''

    return this.sendMessage({
      from: verificationFrom,
      to,
      text: `Your Call Helm verification code is: ${code}. This code expires in 10 minutes.`
    })
  }

  // ============================================
  // PHONE NUMBER MANAGEMENT
  // ============================================

  /**
   * Search for available phone numbers
   */
  async searchAvailableNumbers(options: {
    countryCode?: string
    locality?: string
    administrativeArea?: string
    areaCode?: string
    contains?: string
    limit?: number
    features?: ('voice' | 'sms' | 'mms' | 'fax')[]
  }): Promise<AvailableNumber[]> {
    const params: Record<string, string> = {}

    params['filter[country_code]'] = options.countryCode || 'US'

    if (options.locality) {
      params['filter[locality]'] = options.locality
    }
    if (options.administrativeArea) {
      params['filter[administrative_area]'] = options.administrativeArea
    }
    if (options.areaCode) {
      params['filter[national_destination_code]'] = options.areaCode
    }
    if (options.contains) {
      params['filter[phone_number][contains]'] = options.contains
    }
    if (options.limit) {
      params['filter[limit]'] = options.limit.toString()
    }

    // Filter by features if specified
    if (options.features?.length) {
      options.features.forEach(feature => {
        params[`filter[features][]`] = feature
      })
    }

    console.log('[Telnyx] Searching available numbers:', params)

    const result = await this.request<{
      phone_number: string
      region_information: { region_name: string; region_type: string }[]
      cost_information: { monthly_cost: string; upfront_cost: string; currency: string }
      features: { name: string }[]
      reservable: boolean
    }[]>('/available_phone_numbers', { params })

    return (result || []).map(num => {
      const locality = num.region_information?.find(r => r.region_type === 'rate_center')?.region_name || ''
      const region = num.region_information?.find(r => r.region_type === 'state')?.region_name || ''

      return {
        phoneNumber: num.phone_number,
        locality: this.formatRateCenter(locality),
        region,
        features: num.features?.map(f => f.name) || [],
        monthlyPrice: parseFloat(num.cost_information?.monthly_cost || '0'),
        upfrontPrice: parseFloat(num.cost_information?.upfront_cost || '0'),
        reservable: num.reservable
      }
    })
  }

  /**
   * Purchase a phone number
   */
  async purchaseNumber(
    phoneNumber: string,
    options?: {
      connectionId?: string
      messagingProfileId?: string
    }
  ): Promise<TelnyxNumber> {
    const body: Record<string, unknown> = {
      phone_numbers: [{ phone_number: phoneNumber }]
    }

    // Optionally assign to connection and messaging profile
    if (options?.connectionId) {
      body.connection_id = options.connectionId
    }
    if (options?.messagingProfileId) {
      body.messaging_profile_id = options.messagingProfileId
    }

    console.log('[Telnyx] Purchasing number:', phoneNumber)

    const result = await this.request<{
      id: string
      phone_numbers: {
        id: string
        phone_number: string
        status: string
      }[]
    }>('/number_orders', { method: 'POST', body })

    const purchasedNumber = result.phone_numbers?.[0]

    return {
      id: purchasedNumber?.id || result.id,
      phoneNumber: purchasedNumber?.phone_number || phoneNumber,
      status: purchasedNumber?.status || 'pending',
      features: { voice: true, sms: true, mms: true, fax: false }
    }
  }

  /**
   * List owned phone numbers
   */
  async listOwnedNumbers(options?: {
    status?: string
    connectionId?: string
    limit?: number
  }): Promise<TelnyxNumber[]> {
    const params: Record<string, string> = {}

    if (options?.status) {
      params['filter[status]'] = options.status
    }
    if (options?.connectionId) {
      params['filter[connection_id]'] = options.connectionId
    }
    if (options?.limit) {
      params['page[size]'] = options.limit.toString()
    }

    const result = await this.request<{
      id: string
      phone_number: string
      status: string
      connection_id?: string
      messaging_profile_id?: string
      purchased_at: string
    }[]>('/phone_numbers', { params })

    return (result || []).map(num => ({
      id: num.id,
      phoneNumber: num.phone_number,
      status: num.status,
      connectionId: num.connection_id,
      messagingProfileId: num.messaging_profile_id,
      features: { voice: true, sms: true, mms: true, fax: false }
    }))
  }

  /**
   * Update phone number configuration
   */
  async updateNumber(
    numberId: string,
    options: {
      connectionId?: string
      messagingProfileId?: string
      tags?: string[]
    }
  ): Promise<void> {
    const body: Record<string, unknown> = {}

    if (options.connectionId) {
      body.connection_id = options.connectionId
    }
    if (options.messagingProfileId) {
      body.messaging_profile_id = options.messagingProfileId
    }
    if (options.tags) {
      body.tags = options.tags
    }

    await this.request(`/phone_numbers/${numberId}`, {
      method: 'PATCH',
      body
    })

    console.log('[Telnyx] Number updated:', numberId)
  }

  /**
   * Release (delete) a phone number
   */
  async releaseNumber(numberId: string): Promise<void> {
    await this.request(`/phone_numbers/${numberId}`, {
      method: 'DELETE'
    })

    console.log('[Telnyx] Number released:', numberId)
  }

  // ============================================
  // HOSTED NUMBERS (BYON - Bring Your Own Number)
  // ============================================

  /**
   * Check if phone numbers are eligible for hosted messaging
   */
  async checkHostedNumberEligibility(phoneNumbers: string[]): Promise<{
    phoneNumber: string
    eligible: boolean
    status: string
    detail: string
  }[]> {
    const result = await this.request<{
      phone_numbers: {
        phone_number: string
        eligible: boolean
        eligible_status: string
        detail: string
      }[]
    }>('/messaging_hosted_number_orders/eligibility_numbers_check', {
      method: 'POST',
      body: { phone_numbers: phoneNumbers }
    })

    return (result.phone_numbers || []).map(num => ({
      phoneNumber: num.phone_number,
      eligible: num.eligible,
      status: num.eligible_status,
      detail: num.detail
    }))
  }

  /**
   * Create hosted number order (for BYON)
   */
  async createHostedNumberOrder(
    phoneNumbers: string[],
    messagingProfileId?: string
  ): Promise<HostedNumberOrder> {
    const result = await this.request<{
      id: string
      messaging_profile_id: string
      status: string
      phone_numbers: {
        id: string
        phone_number: string
        status: string
      }[]
    }>('/messaging_hosted_number_orders', {
      method: 'POST',
      body: {
        messaging_profile_id: messagingProfileId || this.messagingProfileId,
        phone_numbers: phoneNumbers
      }
    })

    console.log('[Telnyx] Hosted number order created:', result.id)

    return {
      id: result.id,
      messagingProfileId: result.messaging_profile_id,
      status: result.status,
      phoneNumbers: result.phone_numbers.map(pn => ({
        id: pn.id,
        phoneNumber: pn.phone_number,
        status: pn.status
      }))
    }
  }

  /**
   * Upload LOA documents for hosted number order
   * Note: This requires multipart/form-data - implementation varies by framework
   */
  async uploadHostedNumberDocuments(
    orderId: string,
    loaFile: Blob,
    billFile: Blob
  ): Promise<void> {
    const formData = new FormData()
    formData.append('loa', loaFile)
    formData.append('bill', billFile)

    const response = await fetch(
      `${this.baseUrl}/messaging_hosted_number_orders/${orderId}/actions/file_upload`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to upload documents: ${error}`)
    }

    console.log('[Telnyx] Hosted number documents uploaded:', orderId)
  }

  /**
   * Get hosted number order status
   */
  async getHostedNumberOrder(orderId: string): Promise<HostedNumberOrder> {
    const result = await this.request<{
      id: string
      messaging_profile_id: string
      status: string
      phone_numbers: {
        id: string
        phone_number: string
        status: string
      }[]
    }>(`/messaging_hosted_number_orders/${orderId}`)

    return {
      id: result.id,
      messagingProfileId: result.messaging_profile_id,
      status: result.status,
      phoneNumbers: result.phone_numbers.map(pn => ({
        id: pn.id,
        phoneNumber: pn.phone_number,
        status: pn.status
      }))
    }
  }

  // ============================================
  // NUMBER PORTING
  // ============================================

  /**
   * Check if numbers can be ported to Telnyx
   */
  async checkPortability(phoneNumbers: string[]): Promise<{
    phoneNumber: string
    portable: boolean
    fastPortEligible: boolean
    portingTimeframe?: string
  }[]> {
    const result = await this.request<{
      data: {
        phone_number: string
        portable: boolean
        fast_port_eligible: boolean
        portability_details?: {
          porting_timeframe: string
        }
      }[]
    }>('/portability_checks', {
      method: 'POST',
      body: { phone_numbers: phoneNumbers }
    })

    return (result.data || []).map(num => ({
      phoneNumber: num.phone_number,
      portable: num.portable,
      fastPortEligible: num.fast_port_eligible,
      portingTimeframe: num.portability_details?.porting_timeframe
    }))
  }

  /**
   * Create a porting order
   */
  async createPortingOrder(phoneNumbers: string[]): Promise<PortingOrder> {
    const result = await this.request<{
      data: {
        id: string
        status: string
        phone_numbers: {
          phone_number: string
          status: string
        }[]
        created_at: string
      }[]
    }>('/porting_orders', {
      method: 'POST',
      body: { phone_numbers: phoneNumbers }
    })

    const order = result.data[0]

    console.log('[Telnyx] Porting order created:', order.id)

    return {
      id: order.id,
      status: order.status,
      phoneNumbers: order.phone_numbers.map(pn => ({
        phoneNumber: pn.phone_number,
        status: pn.status
      })),
      createdAt: order.created_at
    }
  }

  // ============================================
  // MESSAGING PROFILES
  // ============================================

  /**
   * Create a messaging profile
   */
  async createMessagingProfile(options: {
    name: string
    webhookUrl?: string
    webhookFailoverUrl?: string
  }): Promise<{ id: string; name: string }> {
    const body: Record<string, unknown> = {
      name: options.name
    }

    if (options.webhookUrl) {
      body.webhook_url = options.webhookUrl
      body.webhook_api_version = '2'
    }
    if (options.webhookFailoverUrl) {
      body.webhook_failover_url = options.webhookFailoverUrl
    }

    const result = await this.request<{
      id: string
      name: string
    }>('/messaging_profiles', { method: 'POST', body })

    console.log('[Telnyx] Messaging profile created:', result.id)

    return {
      id: result.id,
      name: result.name
    }
  }

  /**
   * Update messaging profile webhooks
   */
  async updateMessagingProfile(
    profileId: string,
    options: {
      webhookUrl?: string
      webhookFailoverUrl?: string
    }
  ): Promise<void> {
    const body: Record<string, unknown> = {}

    if (options.webhookUrl) {
      body.webhook_url = options.webhookUrl
    }
    if (options.webhookFailoverUrl) {
      body.webhook_failover_url = options.webhookFailoverUrl
    }

    await this.request(`/messaging_profiles/${profileId}`, {
      method: 'PATCH',
      body
    })
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  /**
   * Format rate center name to title case
   */
  private formatRateCenter(rateCenter: string): string {
    if (!rateCenter) return ''
    return rateCenter
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ')
  }

  /**
   * Parse webhook event from Telnyx
   */
  static parseWebhookEvent(body: Record<string, unknown>): WebhookEvent {
    const data = body.data as Record<string, unknown>
    return {
      eventType: data.event_type as string,
      id: data.id as string,
      occurredAt: data.occurred_at as string,
      payload: data.payload as Record<string, unknown>,
      recordType: data.record_type as string
    }
  }

  /**
   * Decode client state from base64
   */
  static decodeClientState(clientState: string): string {
    try {
      return Buffer.from(clientState, 'base64').toString('utf-8')
    } catch {
      return clientState
    }
  }

  /**
   * Check if Telnyx service is properly configured
   */
  static isConfigured(): boolean {
    return !!(
      process.env.TELNYX_API_KEY &&
      process.env.TELNYX_CONNECTION_ID
    )
  }

  /**
   * Get configuration status for debugging
   */
  static getConfigurationStatus(): {
    apiKey: boolean
    connectionId: boolean
    messagingProfileId: boolean
  } {
    return {
      apiKey: !!process.env.TELNYX_API_KEY,
      connectionId: !!process.env.TELNYX_CONNECTION_ID,
      messagingProfileId: !!process.env.TELNYX_MESSAGING_PROFILE_ID
    }
  }
}

// Export singleton instance
export const telnyxService = new TelnyxService()
