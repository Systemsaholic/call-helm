import crypto from 'crypto'
import { NextRequest } from 'next/server'
import { AuthorizationError } from '@/lib/errors/handler'
import { webhookLogger } from '@/lib/logger'

interface WebhookConfig {
  secret: string
  algorithm?: 'sha256' | 'sha1'
  headerName?: string
  encoding?: 'hex' | 'base64'
  tolerance?: number // Time tolerance in seconds
}

// Verify webhook signature using timing-safe comparison
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string,
  secret: string,
  algorithm: 'sha256' | 'sha1' = 'sha256'
): boolean {
  try {
    const expectedSignature = crypto
      .createHmac(algorithm, secret)
      .update(payload)
      .digest('hex')
    
    // Convert both to buffers for timing-safe comparison
    const signatureBuffer = Buffer.from(signature, 'hex')
    const expectedBuffer = Buffer.from(expectedSignature, 'hex')
    
    // Must be same length for timing-safe comparison
    if (signatureBuffer.length !== expectedBuffer.length) {
      return false
    }
    
    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  } catch (error) {
    webhookLogger.error('Error verifying webhook signature', { error })
    return false
  }
}

// Twilio webhook signature verification
export function verifyTwilioWebhook(
  authToken: string,
  twilioSignature: string,
  url: string,
  params: Record<string, any>
): boolean {
  // Sort parameters alphabetically
  const sortedParams = Object.keys(params)
    .sort()
    .reduce((acc, key) => {
      acc[key] = params[key]
      return acc
    }, {} as Record<string, any>)
  
  // Build the validation string
  let data = url
  for (const key in sortedParams) {
    data += key + sortedParams[key]
  }
  
  // Calculate expected signature
  const expectedSignature = crypto
    .createHmac('sha1', authToken)
    .update(data)
    .digest('base64')
  
  // Timing-safe comparison
  const sigBuffer = Buffer.from(twilioSignature, 'base64')
  const expectedBuffer = Buffer.from(expectedSignature, 'base64')
  
  if (sigBuffer.length !== expectedBuffer.length) {
    return false
  }
  
  return crypto.timingSafeEqual(sigBuffer, expectedBuffer)
}

// SignalWire webhook signature verification (similar to Twilio)
export function verifySignalWireWebhook(
  projectKey: string,
  signature: string,
  url: string,
  params: Record<string, any>
): boolean {
  // SignalWire uses the same signature method as Twilio
  return verifyTwilioWebhook(projectKey, signature, url, params)
}

// Generic webhook verification middleware
export function createWebhookVerifier(config: WebhookConfig) {
  return async function verifyWebhook(
    req: NextRequest,
    rawBody: string
  ): Promise<boolean> {
    const signature = req.headers.get(config.headerName || 'x-webhook-signature')
    
    if (!signature) {
      webhookLogger.warn('Webhook signature missing')
      return false
    }
    
    // Remove any prefix from signature (e.g., "sha256=")
    const cleanSignature = signature.replace(/^sha\d+=/, '')
    
    // Verify signature
    const isValid = verifyWebhookSignature(
      rawBody,
      cleanSignature,
      config.secret,
      config.algorithm || 'sha256'
    )
    
    if (!isValid) {
      webhookLogger.warn('Invalid webhook signature')
    }
    
    return isValid
  }
}

// Webhook timestamp validation (prevent replay attacks)
export function validateWebhookTimestamp(
  timestamp: string | number,
  tolerance: number = 300 // 5 minutes default
): boolean {
  const webhookTime = typeof timestamp === 'string' 
    ? parseInt(timestamp, 10) 
    : timestamp
  
  if (isNaN(webhookTime)) {
    return false
  }
  
  const currentTime = Math.floor(Date.now() / 1000)
  const timeDiff = Math.abs(currentTime - webhookTime)
  
  return timeDiff <= tolerance
}

// Stripe-style webhook signature verification (with timestamp)
export function verifyTimestampedWebhook(
  payload: string,
  signatureHeader: string,
  secret: string,
  tolerance: number = 300
): boolean {
  // Parse signature header (format: "t=timestamp,v1=signature")
  const elements = signatureHeader.split(',')
  let timestamp: string | undefined
  let signature: string | undefined
  
  for (const element of elements) {
    const [key, value] = element.split('=')
    if (key === 't') {
      timestamp = value
    } else if (key === 'v1') {
      signature = value
    }
  }
  
  if (!timestamp || !signature) {
    return false
  }
  
  // Validate timestamp
  if (!validateWebhookTimestamp(timestamp, tolerance)) {
    webhookLogger.warn('Webhook timestamp outside tolerance window')
    return false
  }
  
  // Create signed payload
  const signedPayload = `${timestamp}.${payload}`
  
  // Verify signature
  return verifyWebhookSignature(signedPayload, signature, secret)
}

// Webhook IP allowlist verification
export function verifyWebhookIP(
  clientIP: string | null,
  allowedIPs: string[]
): boolean {
  if (!clientIP) {
    webhookLogger.warn('Client IP not available for webhook verification')
    return false
  }
  
  // Check if IP is in allowlist
  return allowedIPs.includes(clientIP)
}

// Common webhook IP ranges for popular services
export const WEBHOOK_IP_RANGES = {
  // Twilio IP ranges (examples - check Twilio docs for current list)
  twilio: [
    '54.172.60.0/23',
    '54.244.51.0/24',
    // ... more ranges
  ],
  
  // SignalWire IP ranges (examples - check SignalWire docs for current list)
  signalwire: [
    '34.203.250.0/23',
    '35.156.191.128/25',
    // ... more ranges
  ],
  
  // Stripe IP ranges
  stripe: [
    '3.18.12.32/27',
    '3.130.192.128/26',
    // ... more ranges
  ]
}

// Helper to check if IP is in CIDR range
export function isIPInRange(ip: string, cidr: string): boolean {
  const [range, bitsStr] = cidr.split('/')
  const bits = parseInt(bitsStr, 10)
  
  // Validate bits is in range
  if (isNaN(bits) || bits < 0 || bits > 32) {
    return false
  }
  
  // Create mask using bitwise operations (avoid floating point)
  const mask = bits === 0 ? 0 : (0xFFFFFFFF << (32 - bits)) >>> 0
  
  const ipNum = ipToNumber(ip) >>> 0  // Ensure unsigned 32-bit
  const rangeNum = ipToNumber(range) >>> 0  // Ensure unsigned 32-bit
  
  return (ipNum & mask) === (rangeNum & mask)
}

// Convert IP address to number for comparison
function ipToNumber(ip: string): number {
  const parts = ip.split('.')
  return parts.reduce((acc, part, index) => {
    return acc + parseInt(part, 10) * (256 ** (3 - index))
  }, 0)
}

// Webhook request logger
export function logWebhookRequest(
  provider: string,
  eventType: string,
  payload: any,
  isValid: boolean
): void {
  const log = {
    timestamp: new Date().toISOString(),
    provider,
    eventType,
    isValid,
    payloadSize: JSON.stringify(payload).length
  }
  
  if (isValid) {
    webhookLogger.info('Webhook request received', log)
  } else {
    webhookLogger.error('Webhook security validation failed', { ...log, payload })
  }
}