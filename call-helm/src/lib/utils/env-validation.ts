/**
 * Environment variable validation
 * Ensures all required environment variables are present at runtime
 */

interface EnvConfig {
  name: string
  required: boolean
  description: string
}

const ENV_VARS: EnvConfig[] = [
  // Supabase (Critical)
  { name: 'NEXT_PUBLIC_SUPABASE_URL', required: true, description: 'Supabase project URL' },
  { name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true, description: 'Supabase anonymous key' },
  { name: 'SUPABASE_SERVICE_ROLE_KEY', required: true, description: 'Supabase service role key' },

  // Telnyx (Critical for calling/SMS)
  { name: 'TELNYX_API_KEY', required: true, description: 'Telnyx API key' },
  { name: 'TELNYX_CONNECTION_ID', required: true, description: 'Telnyx connection ID for voice' },
  { name: 'TELNYX_MESSAGING_PROFILE_ID', required: true, description: 'Telnyx messaging profile ID for SMS' },

  // OpenAI (Required for AI features)
  { name: 'OPENAI_API_KEY', required: true, description: 'OpenAI API key for analysis' },

  // AssemblyAI (Required for transcription)
  { name: 'ASSEMBLYAI_API_KEY', required: true, description: 'AssemblyAI API key for transcription' },

  // Application
  { name: 'NEXT_PUBLIC_APP_URL', required: true, description: 'Application URL for webhooks' },

  // Optional but recommended
  { name: 'TELNYX_PUBLIC_KEY', required: false, description: 'Telnyx public key for webhook verification' },
]

interface ValidationResult {
  valid: boolean
  missing: string[]
  warnings: string[]
}

/**
 * Validate environment variables
 * @param throwOnError - Whether to throw an error if validation fails
 * @returns Validation result with missing/warning variables
 */
export function validateEnv(throwOnError = false): ValidationResult {
  const missing: string[] = []
  const warnings: string[] = []

  for (const envVar of ENV_VARS) {
    const value = process.env[envVar.name]

    if (!value || value.trim() === '') {
      if (envVar.required) {
        missing.push(`${envVar.name} - ${envVar.description}`)
      } else {
        warnings.push(`${envVar.name} - ${envVar.description}`)
      }
    }
  }

  const valid = missing.length === 0

  if (!valid && throwOnError) {
    const errorMessage = [
      '❌ Missing required environment variables:',
      ...missing.map(m => `  - ${m}`),
      '',
      'Please check your .env.local file or deployment configuration.',
    ].join('\n')

    throw new Error(errorMessage)
  }

  return { valid, missing, warnings }
}

/**
 * Log environment validation results
 * Useful for startup checks
 */
export function logEnvValidation(): void {
  const result = validateEnv(false)

  if (result.valid) {
    console.log('✅ All required environment variables are set')
  } else {
    console.error('❌ Missing required environment variables:')
    result.missing.forEach(m => console.error(`  - ${m}`))
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️  Optional environment variables not set:')
    result.warnings.forEach(w => console.warn(`  - ${w}`))
  }
}

/**
 * Get a required environment variable
 * Throws if not present
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name]

  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${name}`)
  }

  return value
}

/**
 * Get an optional environment variable with a default
 */
export function getOptionalEnv(name: string, defaultValue: string): string {
  const value = process.env[name]
  return value && value.trim() !== '' ? value : defaultValue
}
