/**
 * 3CX Agent Mappings API
 * Manages extension to user mappings
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  try {
    const organizationId = request.nextUrl.searchParams.get('organizationId');

    if (!organizationId) {
      return NextResponse.json(
        { error: 'Missing organization ID' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: mappings, error } = await supabase
      .from('three_cx_agent_mappings')
      .select('*')
      .eq('organization_id', organizationId)
      .order('three_cx_extension');

    if (error) {
      console.error('Error fetching agent mappings:', error);
      return NextResponse.json(
        { error: 'Failed to fetch agent mappings' },
        { status: 500 }
      );
    }

    return NextResponse.json({ mappings });

  } catch (error) {
    console.error('Error in agent mappings GET:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { organizationId, extension, agentEmail, agentFirstName, agentLastName, agentId } = body;

    if (!organizationId || !extension) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: mapping, error } = await supabase
      .from('three_cx_agent_mappings')
      .upsert({
        organization_id: organizationId,
        three_cx_extension: extension,
        agent_id: agentId || null,
        agent_email: agentEmail || null,
        agent_first_name: agentFirstName || null,
        agent_last_name: agentLastName || null
      }, {
        onConflict: 'organization_id,three_cx_extension'
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating agent mapping:', error);
      return NextResponse.json(
        { error: 'Failed to create agent mapping' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, mapping });

  } catch (error) {
    console.error('Error in agent mappings POST:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
