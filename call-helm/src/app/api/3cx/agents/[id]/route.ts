/**
 * 3CX Agent Mapping DELETE endpoint
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { apiLogger } from '@/lib/logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: 'Missing mapping ID' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabase
      .from('three_cx_agent_mappings')
      .delete()
      .eq('id', id);

    if (error) {
      apiLogger.error('Error deleting agent mapping', { error });
      return NextResponse.json(
        { error: 'Failed to delete agent mapping' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    apiLogger.error('Error in agent mapping DELETE', { error });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
