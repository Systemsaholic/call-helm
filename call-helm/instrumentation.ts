/**
 * Next.js Instrumentation
 * Runs once when the server starts
 * Used for startup validation and initialization
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Only run on server startup, not in edge runtime
    const { logEnvValidation } = await import('@/lib/utils/env-validation')

    console.log('\n🚀 Starting Call Helm server...\n')
    logEnvValidation()
    console.log('\n✅ Server initialization complete\n')
  }
}
