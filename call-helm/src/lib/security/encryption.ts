/**
 * Encryption utilities for sensitive data (EIN, SSN, etc.)
 *
 * Uses AES-256-GCM for authenticated encryption.
 * Each encryption generates a random IV for security.
 *
 * Environment variable required:
 * - DATA_ENCRYPTION_KEY: 32-byte hex-encoded key (64 hex characters)
 *
 * To generate a key: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16 // 16 bytes for GCM
const AUTH_TAG_LENGTH = 16 // 16 bytes authentication tag

/**
 * Get the encryption key from environment variables
 * @throws Error if key is not configured or invalid
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.DATA_ENCRYPTION_KEY

  if (!keyHex) {
    throw new Error('DATA_ENCRYPTION_KEY environment variable is not configured')
  }

  // Key should be 64 hex characters (32 bytes)
  if (keyHex.length !== 64) {
    throw new Error('DATA_ENCRYPTION_KEY must be 64 hex characters (32 bytes)')
  }

  return Buffer.from(keyHex, 'hex')
}

/**
 * Check if encryption is configured
 */
export function isEncryptionConfigured(): boolean {
  const keyHex = process.env.DATA_ENCRYPTION_KEY
  return !!keyHex && keyHex.length === 64
}

/**
 * Encrypt sensitive data
 *
 * @param plaintext - The data to encrypt
 * @returns Encrypted data in format: iv:authTag:ciphertext (all base64)
 * @throws Error if encryption key is not configured
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)

  const cipher = createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(plaintext, 'utf8', 'base64')
  encrypted += cipher.final('base64')

  const authTag = cipher.getAuthTag()

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`
}

/**
 * Decrypt sensitive data
 *
 * @param encryptedData - Data in format: iv:authTag:ciphertext
 * @returns Decrypted plaintext
 * @throws Error if decryption fails or data is corrupted
 */
export function decrypt(encryptedData: string): string {
  const key = getEncryptionKey()

  const parts = encryptedData.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format')
  }

  const [ivBase64, authTagBase64, ciphertext] = parts

  const iv = Buffer.from(ivBase64, 'base64')
  const authTag = Buffer.from(authTagBase64, 'base64')

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length')
  }

  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid authentication tag length')
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

/**
 * Encrypt an EIN (Employer Identification Number)
 * Validates EIN format before encryption
 *
 * @param ein - EIN in format XX-XXXXXXX or XXXXXXXXX
 * @returns Encrypted EIN or null if encryption not configured
 */
export function encryptEIN(ein: string): string | null {
  // Normalize EIN (remove dashes)
  const normalizedEIN = ein.replace(/-/g, '')

  // Validate EIN format (9 digits)
  if (!/^\d{9}$/.test(normalizedEIN)) {
    throw new Error('Invalid EIN format. Must be 9 digits.')
  }

  if (!isEncryptionConfigured()) {
    console.warn('DATA_ENCRYPTION_KEY not configured - EIN will be stored unencrypted')
    return null
  }

  return encrypt(normalizedEIN)
}

/**
 * Decrypt an EIN
 *
 * @param encryptedEIN - Encrypted EIN string
 * @returns Decrypted EIN in format XX-XXXXXXX
 */
export function decryptEIN(encryptedEIN: string): string {
  // Check if this looks like encrypted data (has colons for our format)
  if (!encryptedEIN.includes(':')) {
    // Probably unencrypted (legacy data), return as-is with formatting
    const normalized = encryptedEIN.replace(/-/g, '')
    if (/^\d{9}$/.test(normalized)) {
      return `${normalized.slice(0, 2)}-${normalized.slice(2)}`
    }
    return encryptedEIN
  }

  const decrypted = decrypt(encryptedEIN)

  // Format as XX-XXXXXXX
  return `${decrypted.slice(0, 2)}-${decrypted.slice(2)}`
}

/**
 * Mask an EIN for display (XX-XXX**XX)
 * Works with both encrypted and decrypted EINs
 *
 * @param ein - EIN (encrypted or plain)
 * @param isEncrypted - Whether the EIN is encrypted
 * @returns Masked EIN for safe display
 */
export function maskEIN(ein: string, isEncrypted: boolean = false): string {
  let plainEIN = ein

  if (isEncrypted && ein.includes(':')) {
    try {
      plainEIN = decryptEIN(ein)
    } catch {
      return '**-*******'
    }
  }

  // Remove any dashes and validate
  const normalized = plainEIN.replace(/-/g, '')
  if (!/^\d{9}$/.test(normalized)) {
    return '**-*******'
  }

  // Show first 2 and last 2 digits: XX-XXX**XX
  return `${normalized.slice(0, 2)}-${normalized.slice(2, 5)}**${normalized.slice(7)}`
}

/**
 * Check if a string appears to be encrypted data
 */
export function isEncrypted(data: string): boolean {
  // Our format uses colons as separators
  const parts = data.split(':')
  if (parts.length !== 3) return false

  // Check if parts look like base64
  const base64Regex = /^[A-Za-z0-9+/]+=*$/
  return parts.every(part => base64Regex.test(part))
}
