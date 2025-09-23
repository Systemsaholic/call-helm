import { NextRequest, NextResponse } from 'next/server'
import { SECURITY } from '@/lib/constants'

// Security headers configuration
const SECURITY_HEADERS = {
  // Content Security Policy
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.openai.com",
    "media-src 'self' https:",
    "object-src 'none'",
    "frame-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join('; '),
  
  // Other security headers
  'X-DNS-Prefetch-Control': 'off',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
}

// Apply security headers to response
export function applySecurityHeaders(response: NextResponse): NextResponse {
  // Apply all security headers
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value)
  })
  
  return response
}

// CORS configuration
interface CORSConfig {
  allowedOrigins: string[]
  allowedMethods: string[]
  allowedHeaders: string[]
  exposedHeaders: string[]
  maxAge: number
  credentials: boolean
}

const DEFAULT_CORS_CONFIG: CORSConfig = {
  allowedOrigins: [
    process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3035',
    'https://app.call-helm.com' // Add your production domain
  ],
  allowedMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400, // 24 hours
  credentials: true
}

// CORS middleware
export function corsMiddleware(config: Partial<CORSConfig> = {}) {
  const corsConfig = { ...DEFAULT_CORS_CONFIG, ...config }
  
  return function applyCORS(req: NextRequest, res: NextResponse): NextResponse {
    const origin = req.headers.get('origin') || ''
    
    // Check if origin is allowed
    const isAllowed = corsConfig.allowedOrigins.includes('*') ||
                     corsConfig.allowedOrigins.includes(origin)
    
    if (isAllowed) {
      res.headers.set('Access-Control-Allow-Origin', origin)
    }
    
    // Set other CORS headers
    res.headers.set('Access-Control-Allow-Methods', corsConfig.allowedMethods.join(', '))
    res.headers.set('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '))
    res.headers.set('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '))
    res.headers.set('Access-Control-Max-Age', String(corsConfig.maxAge))
    
    if (corsConfig.credentials) {
      res.headers.set('Access-Control-Allow-Credentials', 'true')
    }
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: res.headers })
    }
    
    return res
  }
}

// Input sanitization
export function sanitizeInput(input: any): any {
  if (typeof input === 'string') {
    // Remove null bytes
    let sanitized = input.replace(/\0/g, '')
    
    // Trim whitespace
    sanitized = sanitized.trim()
    
    return sanitized
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput)
  }
  
  if (input && typeof input === 'object') {
    const sanitized: any = {}
    for (const [key, value] of Object.entries(input)) {
      // Don't alter object keys
      sanitized[key] = sanitizeInput(value)
    }
    return sanitized
  }
  
  return input
}

// XSS prevention for output
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}

// Alias for HTML escaping at render time
export const escapeForHtml = escapeHtml

// Path traversal prevention
export function sanitizePath(path: string): string {
  // Remove any path traversal attempts
  return path
    .replace(/\.\./g, '')
    .replace(/~\//g, '')
    .replace(/^\/+/, '')
}

// Request size limiting
export function requestSizeLimit(maxSize: number = 10 * 1024 * 1024) { // 10MB default
  return async function checkSize(req: NextRequest): Promise<boolean> {
    const contentLength = req.headers.get('content-length')
    
    if (contentLength && parseInt(contentLength, 10) > maxSize) {
      return false
    }
    
    return true
  }
}

// IP-based access control
export function ipAccessControl(allowedIPs: string[], blockedIPs: string[] = []) {
  return function checkIP(req: NextRequest): boolean {
    const clientIP = req.headers.get('x-forwarded-for')?.split(',')[0] || req.headers.get('x-real-ip') || ''
    
    // Check blocklist first
    if (blockedIPs.includes(clientIP)) {
      return false
    }
    
    // If allowlist is empty, allow all (except blocked)
    if (allowedIPs.length === 0) {
      return true
    }
    
    // Check allowlist
    return allowedIPs.includes(clientIP)
  }
}

// User agent validation
export function validateUserAgent(req: NextRequest): boolean {
  const userAgent = req.headers.get('user-agent') || ''
  
  // Block known bad user agents
  const blockedAgents = [
    'sqlmap', // SQL injection tool
    'nikto',  // Web scanner
    'nmap',   // Network scanner
    'masscan' // Port scanner
  ]
  
  const lowerUA = userAgent.toLowerCase()
  return !blockedAgents.some(agent => lowerUA.includes(agent))
}

// Combined security middleware
export function securityMiddleware(options: {
  enableCORS?: boolean
  corsConfig?: Partial<CORSConfig>
  maxRequestSize?: number
  allowedIPs?: string[]
  blockedIPs?: string[]
  checkUserAgent?: boolean
} = {}) {
  return async function applySecurity(
    req: NextRequest,
    handler: (req: NextRequest) => Promise<NextResponse>
  ): Promise<NextResponse> {
    // Check user agent
    if (options.checkUserAgent && !validateUserAgent(req)) {
      return NextResponse.json(
        { error: 'Invalid user agent' },
        { status: 403 }
      )
    }
    
    // Check IP access
    if (options.allowedIPs || options.blockedIPs) {
      const ipCheck = ipAccessControl(
        options.allowedIPs || [],
        options.blockedIPs || []
      )
      
      if (!ipCheck(req)) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        )
      }
    }
    
    // Check request size
    if (options.maxRequestSize) {
      const sizeCheck = requestSizeLimit(options.maxRequestSize)
      const isValid = await sizeCheck(req)
      
      if (!isValid) {
        return NextResponse.json(
          { error: 'Request too large' },
          { status: 413 }
        )
      }
    }
    
    // Process request
    const response = await handler(req)
    
    // Apply security headers
    applySecurityHeaders(response)
    
    // Apply CORS if enabled
    if (options.enableCORS) {
      corsMiddleware(options.corsConfig)(req, response)
    }
    
    return response
  }
}