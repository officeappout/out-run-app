/**
 * API Route: Master Evolution Sync
 * POST /api/admin/master-evolution-sync
 *
 * Fills programLevelSettings with tiered incentive data (8/6/4/2% baseGain).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { runMasterEvolutionSync } from '@/features/admin/services/master-evolution-sync.service';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;
  try {
    console.log('[API] Starting Master Evolution Sync...');
    const result = await runMasterEvolutionSync();
    console.log('[API] Master Evolution Sync complete:', result);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('[API] Master Evolution Sync error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Sync failed',
      },
      { status: 500 }
    );
  }
}
