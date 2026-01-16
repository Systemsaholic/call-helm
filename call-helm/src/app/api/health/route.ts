import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateEnv } from '@/lib/utils/env-validation'

/**
 * Health check endpoint
 * Returns system status and dependencies
 */
export async function GET() {
  const startTime = Date.now()
  const checks: Record<string, any> = {}

  // 1. Environment variables check
  const envValidation = validateEnv(false)
  checks.environment = {
    status: envValidation.valid ? 'healthy' : 'unhealthy',
    missing: envValidation.missing,
    warnings: envValidation.warnings,
  }

  // 2. Supabase connection check
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { error } = await supabase
      .from('organizations')
      .select('id')
      .limit(1)

    checks.database = {
      status: error ? 'unhealthy' : 'healthy',
      message: error ? error.message : 'Connected',
    }
  } catch (error) {
    checks.database = {
      status: 'unhealthy',
      message: error instanceof Error ? error.message : 'Unknown error',
    }
  }

  // 3. Telnyx connectivity check (basic)
  checks.telnyx = {
    status: process.env.TELNYX_API_KEY ? 'configured' : 'unconfigured',
    message: process.env.TELNYX_API_KEY ? 'API key present' : 'API key missing',
  }

  // 4. OpenAI check
  checks.openai = {
    status: process.env.OPENAI_API_KEY ? 'configured' : 'unconfigured',
    message: process.env.OPENAI_API_KEY ? 'API key present' : 'API key missing',
  }

  // 5. AssemblyAI check
  checks.assemblyai = {
    status: process.env.ASSEMBLYAI_API_KEY ? 'configured' : 'unconfigured',
    message: process.env.ASSEMBLYAI_API_KEY ? 'API key present' : 'API key missing',
  }

  // Overall health status
  const isHealthy =
    checks.environment.status === 'healthy' &&
    checks.database.status === 'healthy' &&
    checks.telnyx.status === 'configured' &&
    checks.openai.status === 'configured'

  const responseTime = Date.now() - startTime

  return NextResponse.json(
    {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      version: process.env.npm_package_version || '0.1.0',
      environment: process.env.NODE_ENV || 'development',
      checks,
    },
    { status: isHealthy ? 200 : 503 }
  )
}
