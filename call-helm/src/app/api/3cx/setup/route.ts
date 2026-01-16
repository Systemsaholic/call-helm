/**
 * 3CX Setup API
 * Generates a new API key for 3CX integration
 */

import { NextResponse } from 'next/server';
import { generateThreeCXApiKey, getThreeCXIntegration } from '@/lib/services/threeCX';
import { createClient } from '@supabase/supabase-js';
import { apiLogger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: Request) {
  try {
    // Get the authenticated user's organization
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // For now, we'll accept the organization ID from the request
    // In production, this should be validated against the authenticated user
    const body = await request.json().catch(() => ({}));
    const { organizationId } = body;

    if (!organizationId) {
      return NextResponse.json(
        { error: 'Missing organization ID' },
        { status: 400 }
      );
    }

    // Generate new API key
    const apiKey = await generateThreeCXApiKey(organizationId);

    // Get the full integration details
    const integration = await getThreeCXIntegration(organizationId);

    return NextResponse.json({
      success: true,
      apiKey,
      crmUrl: integration?.crm_url || process.env.NEXT_PUBLIC_APP_URL,
      downloadUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/3cx/template?apiKey=${apiKey}`
    });

  } catch (error) {
    apiLogger.error('Error in 3CX setup', { error });
    return NextResponse.json(
      { error: 'Failed to generate API key' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    // Get integration status
    const url = new URL(request.url);
    const organizationId = url.searchParams.get('organizationId');

    if (!organizationId) {
      return NextResponse.json(
        { error: 'Missing organization ID' },
        { status: 400 }
      );
    }

    const integration = await getThreeCXIntegration(organizationId);

    if (!integration) {
      return NextResponse.json({
        enabled: false,
        configured: false
      });
    }

    return NextResponse.json({
      enabled: integration.enabled,
      configured: !!integration.api_key,
      crmUrl: integration.crm_url,
      threeCxServerUrl: integration.three_cx_server_url,
      settings: integration.settings
    });

  } catch (error) {
    apiLogger.error('Error getting 3CX setup', { error });
    return NextResponse.json(
      { error: 'Failed to get integration status' },
      { status: 500 }
    );
  }
}
