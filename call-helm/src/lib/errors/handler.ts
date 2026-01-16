import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { apiLogger } from '@/lib/logger'

// Custom error classes
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public isOperational = true
  ) {
    super(message)
    this.name = this.constructor.name
    Error.captureStackTrace(this, this.constructor)
  }
}

export interface ValidationErrorDetails {
  field: string
  message: string
}

export class ValidationError extends AppError {
  constructor(message: string, public details?: ValidationErrorDetails[] | Record<string, string>) {
    super(message, 400, 'VALIDATION_ERROR')
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTHENTICATION_ERROR')
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'AUTHORIZATION_ERROR')
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND')
  }
}

export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED')
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource conflict') {
    super(message, 409, 'CONFLICT')
  }
}

export interface QuotaInfo {
  used: number
  limit: number
  resource: string
}

export class QuotaExceededError extends AppError {
  constructor(message: string, public quota?: QuotaInfo) {
    super(message, 402, 'QUOTA_EXCEEDED')
  }
}

// Error handler function
export function errorHandler(error: unknown): NextResponse {
  // Log error for monitoring
  apiLogger.error('Unhandled error', { error })

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const formattedErrors = error.issues.map(err => ({
      field: err.path.join('.'),
      message: err.message
    }))
    
    return NextResponse.json(
      {
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: formattedErrors
      },
      { status: 400 }
    )
  }

  // Handle custom app errors
  if (error instanceof AppError) {
    const response: {
      error: string
      code?: string
      details?: ValidationErrorDetails[] | Record<string, string>
      quota?: QuotaInfo
    } = {
      error: error.message,
      code: error.code
    }

    // Add additional details for specific error types
    if (error instanceof ValidationError && error.details) {
      response.details = error.details
    }

    if (error instanceof QuotaExceededError && error.quota) {
      response.quota = error.quota
    }

    return NextResponse.json(response, { status: error.statusCode })
  }

  // Handle Supabase errors
  if (error && typeof error === 'object' && 'code' in error) {
    const supabaseError = error as { code: string; message?: string }

    // Map common Supabase error codes
    if (supabaseError.code === 'PGRST116') {
      return NextResponse.json(
        { error: 'Resource not found', code: 'NOT_FOUND' },
        { status: 404 }
      )
    }

    if (supabaseError.code === '23505') {
      return NextResponse.json(
        { error: 'Resource already exists', code: 'DUPLICATE' },
        { status: 409 }
      )
    }

    // Generic Supabase error
    return NextResponse.json(
      { error: 'Database error', code: supabaseError.code },
      { status: 500 }
    )
  }

  // Handle standard errors
  if (error instanceof Error) {
    // Don't expose internal error messages in production
    const message = process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : error.message

    return NextResponse.json(
      { error: message, code: 'INTERNAL_ERROR' },
      { status: 500 }
    )
  }

  // Fallback for unknown errors
  return NextResponse.json(
    { error: 'An unexpected error occurred', code: 'UNKNOWN_ERROR' },
    { status: 500 }
  )
}

// Async error wrapper for route handlers
export function asyncHandler<T, Args extends unknown[]>(
  handler: (...args: Args) => Promise<T>
) {
  return async (...args: Args): Promise<T | NextResponse> => {
    try {
      return await handler(...args)
    } catch (error) {
      return errorHandler(error)
    }
  }
}

// Type guard functions
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

export function isOperationalError(error: unknown): boolean {
  if (isAppError(error)) {
    return error.isOperational
  }
  return false
}