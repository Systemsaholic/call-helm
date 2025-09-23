import { NextRequest, NextResponse } from 'next/server'
import { RateLimitError } from '@/lib/errors/handler'

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Max requests per window
  keyGenerator?: (req: NextRequest) => string // Function to generate rate limit key
  skipSuccessfulRequests?: boolean // Skip counting successful requests
  skipFailedRequests?: boolean // Skip counting failed requests
}

// In-memory store for rate limiting (consider using Redis in production)
class RateLimitStore {
  private store = new Map<string, { count: number; resetTime: number }>()

  increment(key: string, windowMs: number): number {
    const now = Date.now()
    const record = this.store.get(key)

    if (!record || record.resetTime < now) {
      // Create new record or reset expired one
      this.store.set(key, {
        count: 1,
        resetTime: now + windowMs
      })
      return 1
    }

    // Increment existing record
    record.count++
    return record.count
  }

  getRemainingTime(key: string): number {
    const record = this.store.get(key)
    if (!record) return 0
    
    const remaining = record.resetTime - Date.now()
    return remaining > 0 ? remaining : 0
  }

  // Clean up expired entries periodically
  cleanup() {
    const now = Date.now()
    for (const [key, record] of this.store.entries()) {
      if (record.resetTime < now) {
        this.store.delete(key)
      }
    }
  }
}

// Global store instance
const rateLimitStore = new RateLimitStore()

// Cleanup expired entries every minute
if (typeof setInterval !== 'undefined') {
  setInterval(() => rateLimitStore.cleanup(), 60000)
}

// Default key generator (by IP)
const defaultKeyGenerator = (req: NextRequest): string => {
  return req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
}

// Rate limiter middleware factory
export function createRateLimiter(config: RateLimitConfig) {
  const {
    windowMs,
    maxRequests,
    keyGenerator = defaultKeyGenerator,
    skipSuccessfulRequests = false,
    skipFailedRequests = false
  } = config

  return async function rateLimiter(
    req: NextRequest,
    handler: (req: NextRequest) => Promise<NextResponse>
  ): Promise<NextResponse> {
    const key = keyGenerator(req)
    const rateLimitKey = `ratelimit:${key}:${req.nextUrl.pathname}`

    // Check current count
    const count = rateLimitStore.increment(rateLimitKey, windowMs)

    if (count > maxRequests) {
      const retryAfter = Math.ceil(rateLimitStore.getRemainingTime(rateLimitKey) / 1000)
      
      return NextResponse.json(
        {
          error: 'Too many requests',
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfter),
            'X-RateLimit-Limit': String(maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Date.now() + retryAfter * 1000)
          }
        }
      )
    }

    // Add rate limit headers to response
    const response = await handler(req)
    
    response.headers.set('X-RateLimit-Limit', String(maxRequests))
    response.headers.set('X-RateLimit-Remaining', String(Math.max(0, maxRequests - count)))
    response.headers.set('X-RateLimit-Reset', String(Date.now() + windowMs))

    return response
  }
}

// Pre-configured rate limiters for different use cases
export const rateLimiters = {
  // Strict rate limit for auth endpoints
  auth: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5 // 5 requests per 15 minutes
  }),

  // Standard API rate limit
  api: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60 // 60 requests per minute
  }),

  // Strict rate limit for expensive operations
  expensive: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10 // 10 requests per minute
  }),

  // Very strict rate limit for critical operations
  critical: createRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10 // 10 requests per hour
  }),

  // Rate limit by user ID (requires auth)
  perUser: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 requests per minute per user
    keyGenerator: (req: NextRequest) => {
      // Extract user ID from auth header or session
      const authHeader = req.headers.get('authorization')
      if (authHeader) {
        // Parse JWT or session to get user ID
        // This is a placeholder - implement based on your auth method
        return `user:${authHeader}`
      }
      return defaultKeyGenerator(req)
    }
  }),

  // Rate limit by organization
  perOrg: createRateLimiter({
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute per org
    keyGenerator: (req: NextRequest) => {
      // Extract org ID from header or session
      const orgId = req.headers.get('x-organization-id')
      if (orgId) {
        return `org:${orgId}`
      }
      return defaultKeyGenerator(req)
    }
  })
}

// Helper function to apply rate limiting to an API route
export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  rateLimiter = rateLimiters.api
) {
  return (req: NextRequest) => rateLimiter(req, handler)
}