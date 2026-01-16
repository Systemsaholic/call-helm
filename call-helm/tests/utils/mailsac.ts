/**
 * Mailsac API utilities for email testing
 * https://docs.mailsac.com/api
 */

import * as fs from 'fs'
import * as path from 'path'

// Mailsac API configuration
const MAILSAC_BASE_URL = 'https://mailsac.com/api'

// Cache for the API key to avoid repeated file reads
let _cachedApiKey: string | null = null

function getApiKey(): string {
  if (_cachedApiKey !== null) {
    return _cachedApiKey
  }

  // First check process.env
  if (process.env.MAILSAC_API_KEY) {
    _cachedApiKey = process.env.MAILSAC_API_KEY
    return _cachedApiKey
  }

  // Try to read from the temp env file created by global-setup
  try {
    const envFilePath = path.resolve(process.cwd(), '.env.test.json')
    if (fs.existsSync(envFilePath)) {
      const envVars = JSON.parse(fs.readFileSync(envFilePath, 'utf-8'))
      if (envVars.MAILSAC_API_KEY) {
        _cachedApiKey = envVars.MAILSAC_API_KEY as string
        console.log('Loaded MAILSAC_API_KEY from .env.test.json')
        return _cachedApiKey as string
      }
    } else {
      console.warn('File not found:', envFilePath, 'cwd:', process.cwd())
    }
  } catch (error) {
    console.warn('Failed to read .env.test.json:', error)
  }

  console.warn('MAILSAC_API_KEY not found. Ensure global-setup ran successfully.')
  _cachedApiKey = ''
  return _cachedApiKey
}

export interface MailsacMessage {
  _id: string
  from: { address: string; name?: string }[]
  to: { address: string; name?: string }[]
  subject: string
  inbox: string
  originalInbox: string
  domain: string
  received: string
  size: number
  rtls: boolean
  ip: string
  via: string
  folder: string
  labels: string[]
  read: boolean
  savedBy?: string
}

export interface MailsacMessageContent extends MailsacMessage {
  text?: string
  html?: string
  body?: string
  raw?: string
  links?: string[]
}

/**
 * Generate a unique Mailsac inbox address
 */
export function generateMailsacEmail(prefix: string = 'test'): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(2, 8)
  return `${prefix}-${timestamp}-${random}@mailsac.com`
}

/**
 * Fetch messages from a Mailsac inbox
 */
export async function getInboxMessages(email: string): Promise<MailsacMessage[]> {
  const inbox = email.split('@')[0]

  const response = await fetch(`${MAILSAC_BASE_URL}/addresses/${inbox}@mailsac.com/messages`, {
    headers: {
      'Mailsac-Key': getApiKey(),
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch messages: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

/**
 * Get a specific message by ID
 */
export async function getMessage(email: string, messageId: string): Promise<MailsacMessageContent> {
  const inbox = email.split('@')[0]

  const response = await fetch(`${MAILSAC_BASE_URL}/addresses/${inbox}@mailsac.com/messages/${messageId}`, {
    headers: {
      'Mailsac-Key': getApiKey(),
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch message: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

/**
 * Get the full message content including HTML/text body
 */
export async function getMessageBody(email: string, messageId: string, format: 'text' | 'html' = 'html'): Promise<string> {
  const inbox = email.split('@')[0]

  const response = await fetch(`${MAILSAC_BASE_URL}/text/${inbox}@mailsac.com/${messageId}`, {
    headers: {
      'Mailsac-Key': getApiKey(),
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch message body: ${response.status} ${response.statusText}`)
  }

  return response.text()
}

/**
 * Delete a message from inbox
 */
export async function deleteMessage(email: string, messageId: string): Promise<void> {
  const inbox = email.split('@')[0]

  const response = await fetch(`${MAILSAC_BASE_URL}/addresses/${inbox}@mailsac.com/messages/${messageId}`, {
    method: 'DELETE',
    headers: {
      'Mailsac-Key': getApiKey(),
    },
  })

  if (!response.ok) {
    throw new Error(`Failed to delete message: ${response.status} ${response.statusText}`)
  }
}

/**
 * Delete all messages from an inbox
 * Note: This only works for inboxes owned by your Mailsac account.
 * Public @mailsac.com inboxes cannot be deleted - this will silently fail.
 */
export async function clearInbox(email: string): Promise<void> {
  const inbox = email.split('@')[0]

  try {
    const response = await fetch(`${MAILSAC_BASE_URL}/addresses/${inbox}@mailsac.com/messages`, {
      method: 'DELETE',
      headers: {
        'Mailsac-Key': getApiKey(),
      },
    })

    // 401 means the inbox is not owned by this account (public inbox) - this is expected
    if (!response.ok && response.status !== 401) {
      console.warn(`Could not clear inbox: ${response.status} ${response.statusText}`)
    }
  } catch (error) {
    // Silently fail - inbox cleanup is optional
    console.warn('Error clearing inbox:', error)
  }
}

/**
 * Wait for an email to arrive in the inbox with polling
 */
export async function waitForEmail(
  email: string,
  options: {
    timeout?: number
    pollInterval?: number
    subjectContains?: string
    fromContains?: string
  } = {}
): Promise<MailsacMessage | null> {
  const {
    timeout = 60000, // 60 seconds default
    pollInterval = 3000, // 3 seconds between checks
    subjectContains,
    fromContains,
  } = options

  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      const messages = await getInboxMessages(email)

      if (messages.length > 0) {
        // Filter messages if criteria specified
        const matchingMessage = messages.find((msg) => {
          if (subjectContains && !msg.subject?.toLowerCase().includes(subjectContains.toLowerCase())) {
            return false
          }
          if (fromContains) {
            const fromAddresses = msg.from?.map((f) => f.address.toLowerCase()) || []
            if (!fromAddresses.some((addr) => addr.includes(fromContains.toLowerCase()))) {
              return false
            }
          }
          return true
        })

        if (matchingMessage) {
          return matchingMessage
        }
      }
    } catch (error) {
      console.error('Error polling for email:', error)
    }

    // Wait before next poll
    await new Promise((resolve) => setTimeout(resolve, pollInterval))
  }

  return null // Timeout reached
}

/**
 * Extract all links from email HTML content
 */
export function extractLinksFromHtml(html: string): string[] {
  const linkRegex = /href=["']([^"']+)["']/gi
  const links: string[] = []
  let match

  while ((match = linkRegex.exec(html)) !== null) {
    links.push(match[1])
  }

  return links
}

/**
 * Extract invite/confirmation link from email
 */
export function extractInviteLink(html: string, baseUrl?: string): string | null {
  const links = extractLinksFromHtml(html)

  // Look for links containing common invite/confirmation patterns
  const invitePatterns = [
    '/auth/callback',
    '/invite',
    '/confirm',
    '/accept',
    'token=',
    'type=invite',
  ]

  for (const link of links) {
    const lowerLink = link.toLowerCase()
    if (invitePatterns.some((pattern) => lowerLink.includes(pattern.toLowerCase()))) {
      return link
    }
  }

  // If baseUrl is provided, look for any link from that domain
  if (baseUrl) {
    const baseDomain = new URL(baseUrl).hostname
    for (const link of links) {
      try {
        const linkDomain = new URL(link).hostname
        if (linkDomain === baseDomain || linkDomain.includes(baseDomain)) {
          return link
        }
      } catch {
        // Not a valid URL, skip
      }
    }
  }

  return null
}

/**
 * Get the raw HTML content of an email message
 */
export async function getMessageHtml(email: string, messageId: string): Promise<string> {
  const inbox = email.split('@')[0]

  // Try to get the parsed message with HTML
  const response = await fetch(`${MAILSAC_BASE_URL}/dirty/${inbox}@mailsac.com/${messageId}`, {
    headers: {
      'Mailsac-Key': getApiKey(),
    },
  })

  if (!response.ok) {
    // Fallback to text endpoint
    return getMessageBody(email, messageId, 'html')
  }

  return response.text()
}

/**
 * Check if Mailsac API is configured and accessible
 */
export async function checkMailsacConnection(): Promise<boolean> {
  const apiKey = getApiKey()
  console.log(`[Mailsac] API key: ${apiKey ? apiKey.substring(0, 10) + '...' : 'EMPTY'}`)

  if (!apiKey) {
    console.error('MAILSAC_API_KEY not configured')
    return false
  }

  try {
    const response = await fetch(`${MAILSAC_BASE_URL}/me`, {
      headers: {
        'Mailsac-Key': apiKey,
      },
    })
    console.log(`[Mailsac] API response status: ${response.status}`)
    return response.ok
  } catch (error) {
    console.error('Failed to connect to Mailsac:', error)
    return false
  }
}
