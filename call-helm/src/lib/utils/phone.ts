/**
 * Phone number validation and formatting utilities
 */

// E.164 phone number regex
const E164_REGEX = /^\+[1-9]\d{1,14}$/

// US phone number regex (with or without country code)
const US_PHONE_REGEX = /^(\+1)?[\s-.]?(\(?\d{3}\)?[\s-.]?\d{3}[\s-.]?\d{4})$/

/**
 * Validates if a phone number is in valid E.164 format
 */
export function isValidE164(phoneNumber: string): boolean {
  return E164_REGEX.test(phoneNumber)
}

/**
 * Validates if a phone number looks like a valid US number
 */
export function isValidUSPhone(phoneNumber: string): boolean {
  return US_PHONE_REGEX.test(phoneNumber)
}

/**
 * Formats a US phone number for display
 * @param phoneNumber - Phone number to format
 * @returns Formatted phone number like (555) 123-4567
 */
export function formatUSPhone(phoneNumber: string): string {
  // Remove all non-digits
  const cleaned = phoneNumber.replace(/\D/g, '')
  
  // Remove leading 1 if present (US country code)
  const number = cleaned.startsWith('1') ? cleaned.slice(1) : cleaned
  
  if (number.length !== 10) {
    return phoneNumber // Return original if not 10 digits
  }
  
  return `(${number.slice(0, 3)}) ${number.slice(3, 6)}-${number.slice(6)}`
}

/**
 * Converts a phone number to E.164 format
 * @param phoneNumber - Phone number to convert
 * @param countryCode - Country code (default: +1 for US)
 * @returns Phone number in E.164 format
 */
export function toE164(phoneNumber: string, countryCode = '+1'): string {
  // Remove all non-digits
  const cleaned = phoneNumber.replace(/\D/g, '')
  
  // If it already starts with country code digits, add +
  if (cleaned.startsWith('1') && cleaned.length === 11) {
    return `+${cleaned}`
  }
  
  // If it's 10 digits, assume US number
  if (cleaned.length === 10) {
    return `${countryCode}${cleaned}`
  }
  
  // Return as-is if we can't determine format
  return phoneNumber
}

/**
 * Extracts area code from a phone number
 */
export function getAreaCode(phoneNumber: string): string | null {
  const cleaned = phoneNumber.replace(/\D/g, '')
  const number = cleaned.startsWith('1') ? cleaned.slice(1) : cleaned
  
  if (number.length >= 3) {
    return number.slice(0, 3)
  }
  
  return null
}

/**
 * Validates phone number format and returns validation result
 */
export interface PhoneValidationResult {
  isValid: boolean
  formatted: string
  e164: string
  areaCode: string | null
  errors: string[]
}

export function validatePhone(phoneNumber: string): PhoneValidationResult {
  const errors: string[] = []
  let isValid = true
  
  if (!phoneNumber || phoneNumber.trim().length === 0) {
    errors.push('Phone number is required')
    isValid = false
  }
  
  const cleaned = phoneNumber.replace(/\D/g, '')
  
  if (cleaned.length < 10) {
    errors.push('Phone number must be at least 10 digits')
    isValid = false
  }
  
  if (cleaned.length > 11) {
    errors.push('Phone number is too long')
    isValid = false
  }
  
  if (cleaned.length === 11 && !cleaned.startsWith('1')) {
    errors.push('11-digit number must start with 1 (US country code)')
    isValid = false
  }
  
  const e164 = toE164(phoneNumber)
  const formatted = formatUSPhone(phoneNumber)
  const areaCode = getAreaCode(phoneNumber)
  
  // Additional validation for US numbers
  if (isValid && areaCode) {
    const areaCodeNum = parseInt(areaCode, 10)
    if (areaCodeNum < 200 || areaCodeNum > 999) {
      errors.push('Invalid area code')
      isValid = false
    }
  }
  
  return {
    isValid,
    formatted,
    e164,
    areaCode,
    errors
  }
}

/**
 * Masks a phone number for display (shows only last 4 digits)
 */
export function maskPhoneNumber(phoneNumber: string): string {
  const formatted = formatUSPhone(phoneNumber)
  return formatted.replace(/\d(?=.*\d{4})/g, '*')
}

/**
 * Gets phone number type description
 */
export function getPhoneType(capabilities: { voice?: boolean; sms?: boolean; mms?: boolean }): string {
  const types: string[] = []

  if (capabilities.voice) types.push('Voice')
  if (capabilities.sms) types.push('SMS')
  if (capabilities.mms) types.push('MMS')

  return types.length > 0 ? types.join(' + ') : 'Unknown'
}

/**
 * Normalizes a phone number by removing all non-digit characters
 * and ensuring E.164 format for US numbers
 * Alias for toE164 for convenience
 */
export function normalizePhoneNumber(phoneNumber: string): string {
  return toE164(phoneNumber)
}