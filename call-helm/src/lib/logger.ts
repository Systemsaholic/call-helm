/**
 * Centralized Logging Service
 *
 * Provides structured logging with levels, timestamps, and context.
 * Replaces direct console.log usage throughout the application.
 *
 * Features:
 * - Log levels: debug, info, warn, error
 * - Automatic timestamps
 * - Context tagging (component/service names)
 * - Environment-aware (verbose in dev, minimal in prod)
 * - Structured metadata support
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogContext {
  component?: string
  action?: string
  userId?: string
  organizationId?: string
  requestId?: string
  [key: string]: unknown
}

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: LogContext
  error?: Error | unknown
  data?: unknown
}

// Log level priorities (higher = more severe)
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

// Get minimum log level from environment
function getMinLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined
  if (envLevel && LOG_LEVEL_PRIORITY[envLevel] !== undefined) {
    return envLevel
  }
  // Default: debug in development, info in production
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

// Format log entry for output
function formatLogEntry(entry: LogEntry): string {
  const { level, message, timestamp, context, data, error } = entry

  // Build log prefix
  const levelEmoji = {
    debug: '🔍',
    info: '📘',
    warn: '⚠️',
    error: '❌',
  }[level]

  const contextStr = context?.component ? `[${context.component}]` : ''
  const actionStr = context?.action ? ` ${context.action}:` : ''

  // Base message
  let output = `${levelEmoji} ${timestamp} ${level.toUpperCase()} ${contextStr}${actionStr} ${message}`

  // Add metadata if present
  if (data !== undefined) {
    try {
      const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data)
      output += `\n  Data: ${dataStr}`
    } catch {
      output += `\n  Data: [Unable to serialize]`
    }
  }

  // Add error details if present
  if (error) {
    if (error instanceof Error) {
      output += `\n  Error: ${error.message}`
      if (error.stack && process.env.NODE_ENV !== 'production') {
        output += `\n  Stack: ${error.stack}`
      }
    } else {
      output += `\n  Error: ${String(error)}`
    }
  }

  return output
}

// Core logging function
function log(level: LogLevel, message: string, options?: { context?: LogContext; data?: unknown; error?: unknown }) {
  const minLevel = getMinLogLevel()

  // Skip if below minimum level
  if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[minLevel]) {
    return
  }

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    context: options?.context,
    data: options?.data,
    error: options?.error,
  }

  const formattedMessage = formatLogEntry(entry)

  // Use appropriate console method
  switch (level) {
    case 'debug':
      console.debug(formattedMessage)
      break
    case 'info':
      console.info(formattedMessage)
      break
    case 'warn':
      console.warn(formattedMessage)
      break
    case 'error':
      console.error(formattedMessage)
      break
  }

  // In production, could also send to external logging service
  // if (process.env.NODE_ENV === 'production' && level === 'error') {
  //   sendToExternalService(entry)
  // }
}

/**
 * Create a logger instance with a default context
 * Useful for creating component/service-specific loggers
 *
 * Options can include:
 * - error: Error object or error data
 * - context: Additional LogContext properties
 * - Any other key-value pairs will be included as data
 */
export function createLogger(defaultContext: LogContext) {
  // Helper to extract error, context, and data from options
  const extractOptions = (options?: Record<string, unknown>) => {
    if (!options) return { error: undefined, context: undefined, data: undefined }

    const { error, context, ...rest } = options
    return {
      error,
      context: context as LogContext | undefined,
      data: Object.keys(rest).length > 0 ? rest : undefined,
    }
  }

  return {
    debug: (message: string, options?: Record<string, unknown>) => {
      const { context, data } = extractOptions(options)
      log('debug', message, { context: { ...defaultContext, ...context }, data })
    },

    info: (message: string, options?: Record<string, unknown>) => {
      const { context, data } = extractOptions(options)
      log('info', message, { context: { ...defaultContext, ...context }, data })
    },

    warn: (message: string, options?: Record<string, unknown>) => {
      const { error, context, data } = extractOptions(options)
      log('warn', message, { context: { ...defaultContext, ...context }, data, error })
    },

    error: (message: string, options?: Record<string, unknown>) => {
      const { error, context, data } = extractOptions(options)
      log('error', message, { context: { ...defaultContext, ...context }, data, error })
    },
  }
}

// Default logger instance for quick access
export const logger = createLogger({ component: 'App' })

// Pre-configured loggers for common services
export const apiLogger = createLogger({ component: 'API' })
export const dbLogger = createLogger({ component: 'Database' })
export const authLogger = createLogger({ component: 'Auth' })
export const billingLogger = createLogger({ component: 'Billing' })
export const smsLogger = createLogger({ component: 'SMS' })
export const voiceLogger = createLogger({ component: 'Voice' })
export const realtimeLogger = createLogger({ component: 'Realtime' })
export const webhookLogger = createLogger({ component: 'Webhook' })

export type { LogLevel, LogContext, LogEntry }
