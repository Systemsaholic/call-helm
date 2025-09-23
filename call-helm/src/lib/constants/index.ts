// Billing Constants
export const BILLING = {
  TIERS: {
    STARTER: {
      name: 'starter' as const,
      limits: {
        llm_tokens: 5000,
        analytics_tokens: 0,
        call_minutes: 0,
        sms_messages: 0,
        agents: 5
      },
      overage_rates: {
        llm_tokens: 0.000001,      // $0.000001 per token
        analytics_tokens: 0.0000005, // $0.0000005 per token
        call_minutes: 0.025,        // $0.025 per minute
        sms_messages: 0.03          // $0.03 per message
      },
      monthly_price: 0
    },
    PROFESSIONAL: {
      name: 'professional' as const,
      limits: {
        llm_tokens: 100000,
        analytics_tokens: 50000,
        call_minutes: 500,
        sms_messages: 1000,
        agents: 25
      },
      overage_rates: {
        llm_tokens: 0.000001,
        analytics_tokens: 0.0000005,
        call_minutes: 0.02,         // $0.02 per minute
        sms_messages: 0.025         // $0.025 per message
      },
      monthly_price: 99
    },
    ENTERPRISE: {
      name: 'enterprise' as const,
      limits: {
        llm_tokens: 1000000,
        analytics_tokens: 500000,
        call_minutes: 2000,
        sms_messages: 5000,
        agents: -1 // Unlimited
      },
      overage_rates: {
        llm_tokens: 0.0000008,
        analytics_tokens: 0.0000004,
        call_minutes: 0.015,        // $0.015 per minute
        sms_messages: 0.02          // $0.02 per message
      },
      monthly_price: 499
    }
  },
  DEFAULT_UNIT_COSTS: {
    llm_tokens: 0.000001,
    analytics_tokens: 0.0000005,
    call_minutes: 0.025,
    sms_messages: 0.03
  }
} as const

// Rate Limiting Constants
export const RATE_LIMITS = {
  AUTH: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5
  },
  API: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 60
  },
  EXPENSIVE_OPERATIONS: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10
  },
  CRITICAL_OPERATIONS: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10
  },
  BULK_OPERATIONS: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 5
  },
  WEBHOOKS: {
    windowMs: 1000, // 1 second
    maxRequests: 100
  }
} as const

// Email Rate Limits (for invitations)
export const EMAIL_LIMITS = {
  DEFAULT_SMTP: {
    hourly: 4, // Supabase default SMTP limit
    daily: 100
  },
  CUSTOM_SMTP: {
    hourly: 100,
    daily: 1000
  }
} as const

// Timeout Constants (in milliseconds)
export const TIMEOUTS = {
  API_CALL: 30000, // 30 seconds
  DATABASE_QUERY: 10000, // 10 seconds
  WEBHOOK_PROCESSING: 5000, // 5 seconds
  EXTERNAL_SERVICE: 15000, // 15 seconds
  LONG_RUNNING_JOB: 300000 // 5 minutes
} as const

// Pagination Constants
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,
  MIN_PAGE_SIZE: 1
} as const

// Validation Constants
export const VALIDATION = {
  PHONE_NUMBER: {
    MIN_LENGTH: 10,
    MAX_LENGTH: 20,
    REGEX: /^\+?[1-9]\d{1,14}$/
  },
  PASSWORD: {
    MIN_LENGTH: 8,
    MAX_LENGTH: 128,
    REQUIRE_UPPERCASE: true,
    REQUIRE_LOWERCASE: true,
    REQUIRE_NUMBER: true,
    REQUIRE_SPECIAL: true
  },
  EMAIL: {
    MAX_LENGTH: 255,
    REGEX: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  NAME: {
    MIN_LENGTH: 1,
    MAX_LENGTH: 100
  },
  DESCRIPTION: {
    MAX_LENGTH: 1000
  }
} as const

// Security Constants
export const SECURITY = {
  WEBHOOK_TIMESTAMP_TOLERANCE: 300, // 5 minutes in seconds
  SESSION_DURATION: 24 * 60 * 60 * 1000, // 24 hours
  TOKEN_EXPIRY: 60 * 60 * 1000, // 1 hour
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 30 * 60 * 1000, // 30 minutes
  BCRYPT_ROUNDS: 10
} as const

// Call Constants
export const CALLS = {
  STATUSES: {
    INITIATED: 'initiated',
    RINGING: 'ringing',
    ANSWERED: 'answered',
    COMPLETED: 'completed',
    FAILED: 'failed',
    BUSY: 'busy',
    NO_ANSWER: 'no_answer',
    CANCELED: 'canceled'
  },
  DIRECTIONS: {
    INBOUND: 'inbound',
    OUTBOUND: 'outbound',
    INTERNAL: 'internal'
  },
  MAX_DURATION: 3600, // 1 hour in seconds
  MIN_DURATION: 1, // 1 second
  RECORDING_FORMATS: ['mp3', 'wav', 'ogg']
} as const

// Agent Constants
export const AGENTS = {
  ROLES: {
    SUPER_ADMIN: 'super_admin',
    ORG_ADMIN: 'org_admin',
    TEAM_LEAD: 'team_lead',
    BILLING_ADMIN: 'billing_admin',
    AGENT: 'agent'
  },
  STATUSES: {
    PENDING_INVITATION: 'pending_invitation',
    INVITED: 'invited',
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    SUSPENDED: 'suspended'
  },
  BULK_OPERATION_LIMIT: 100, // Max agents per bulk operation
  INVITATION_EXPIRY: 7 * 24 * 60 * 60 * 1000 // 7 days
} as const

// File Upload Constants
export const FILE_UPLOAD = {
  MAX_SIZE: 10 * 1024 * 1024, // 10MB
  ALLOWED_MIME_TYPES: {
    CSV: ['text/csv', 'application/csv'],
    IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    AUDIO: ['audio/mpeg', 'audio/wav', 'audio/ogg']
  },
  CSV: {
    MAX_ROWS: 10000,
    MAX_COLUMNS: 50
  }
} as const

// Cache Constants
export const CACHE = {
  TTL: {
    SHORT: 60, // 1 minute
    MEDIUM: 300, // 5 minutes
    LONG: 3600, // 1 hour
    VERY_LONG: 86400 // 24 hours
  },
  KEYS: {
    ORG_SETTINGS: (orgId: string) => `org:${orgId}:settings`,
    USER_PERMISSIONS: (userId: string) => `user:${userId}:permissions`,
    PHONE_NUMBERS: (orgId: string) => `org:${orgId}:phone_numbers`,
    USAGE_STATS: (orgId: string, period: string) => `org:${orgId}:usage:${period}`
  }
} as const

// Error Codes
export const ERROR_CODES = {
  // Authentication & Authorization
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Rate Limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  
  // Resources
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',
  
  // Operations
  OPERATION_FAILED: 'OPERATION_FAILED',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  TIMEOUT: 'TIMEOUT',
  
  // System
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR'
} as const

// Environment Variables
export const ENV_VARS = {
  REQUIRED: [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  ],
  OPTIONAL: [
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
    'SIGNALWIRE_SPACE_URL',
    'SIGNALWIRE_PROJECT_ID',
    'SIGNALWIRE_API_TOKEN',
    'ENCRYPTION_KEY',
    'ORGANIZATION_ID'
  ]
} as const