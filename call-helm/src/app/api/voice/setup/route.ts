import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import crypto from 'crypto'
import { voiceLogger } from '@/lib/logger'

// Encrypt sensitive data
function encrypt(text: string, key: string): string {
  const algorithm = 'aes-256-cbc'
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(key, 'hex'), iv)
  let encrypted = cipher.update(text)
  encrypted = Buffer.concat([encrypted, cipher.final()])
  return iv.toString('hex') + ':' + encrypted.toString('hex')
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()

    // Check authentication
    const {
      data: { user }
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's organization and check admin role
    const { data: member } = await supabase.from("organization_members").select("organization_id, role").eq("user_id", user.id).single()

    if (!member || (member.role !== "org_admin" && member.role !== "super_admin")) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 })
    }

    // Get request body
    const body = await request.json()
    const { spaceUrl, projectId, apiToken, phoneNumbers, webhookUrl } = body

    // Validate required fields
    if (!spaceUrl || !projectId || !apiToken) {
      return NextResponse.json(
        {
          error: "Missing required fields: spaceUrl, projectId, apiToken"
        },
        { status: 400 }
      )
    }

    // Encrypt the API token - require a persistent ENCRYPTION_KEY
    const encryptionKey = process.env.ENCRYPTION_KEY
    if (!encryptionKey) {
      voiceLogger.error("ENCRYPTION_KEY is required for voice setup")
      return NextResponse.json({ error: "Server not configured" }, { status: 500 })
    }
    const encryptedToken = encrypt(apiToken, encryptionKey)

    // Generate webhook secret
    const webhookSecret = crypto.randomBytes(32).toString("hex")

    // Store or update voice integration settings
    const { data, error } = await supabase
      .from("voice_integrations")
      .upsert(
        {
          organization_id: member.organization_id,
          provider: "internal", // White-labeled - hide SignalWire
          is_active: true,
          space_url: spaceUrl,
          project_id: projectId,
          api_token_encrypted: encryptedToken,
          phone_numbers: phoneNumbers || [],
          webhook_url: webhookUrl || `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/webhook`,
          webhook_secret: webhookSecret,
          status_callback_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/voice/status`,
          recording_enabled: true,
          transcription_enabled: false,
          voicemail_enabled: true,
          settings: {
            max_call_duration: 3600, // 1 hour
            recording_format: "mp3",
            voicemail_max_duration: 180 // 3 minutes
          },
          last_verified_at: new Date().toISOString()
        },
        {
          onConflict: "organization_id"
        }
      )
      .select()
      .single()

    if (error) {
      voiceLogger.error("Voice integration error", { error })
      return NextResponse.json({ error: "Failed to save voice settings" }, { status: 500 })
    }

    // Return success without exposing provider details
    return NextResponse.json({
      success: true,
      message: "Voice integration configured successfully",
      webhookUrl: data.webhook_url,
      webhookSecret: webhookSecret
    })
  } catch (error) {
    voiceLogger.error('Voice setup error', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's organization
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Check if admin for sensitive data
    const isAdmin = member.role === 'org_admin' || member.role === 'super_admin'

    // Get voice integration settings
    const { data, error } = await supabase
      .from('voice_integrations')
      .select('*')
      .eq('organization_id', member.organization_id)
      .single()

    if (error || !data) {
      return NextResponse.json({
        configured: false,
        message: 'Voice integration not configured'
      })
    }

    // Return settings (hide sensitive data for non-admins)
    return NextResponse.json({
      configured: true,
      isActive: data.is_active,
      phoneNumbers: data.phone_numbers,
      recordingEnabled: data.recording_enabled,
      voicemailEnabled: data.voicemail_enabled,
      // Only show sensitive data to admins
      ...(isAdmin && {
        spaceUrl: data.space_url,
        projectId: data.project_id,
        webhookUrl: data.webhook_url
      })
    })

  } catch (error) {
    voiceLogger.error('Get voice settings error', { error })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}