/**
 * 3CX Integration Statistics API
 * Returns usage statistics for the 3CX integration
 */

import { NextRequest, NextResponse } from 'next/server';
import { getThreeCXStats } from '@/lib/services/threeCX';
import { apiLogger } from '@/lib/logger';

export async function GET(request: NextRequest) {
  try {
    const organizationId = request.nextUrl.searchParams.get('organizationId');
    const daysParam = request.nextUrl.searchParams.get('days');
    const days = daysParam ? parseInt(daysParam, 10) : 30;

    if (!organizationId) {
      return NextResponse.json(
        { error: 'Missing organization ID' },
        { status: 400 }
      );
    }

    const stats = await getThreeCXStats(organizationId, days);

    return NextResponse.json(stats);

  } catch (error) {
    apiLogger.error('Error fetching 3CX stats', { error });
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}
