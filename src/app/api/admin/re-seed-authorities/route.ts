/**
 * API Route to trigger re-seed of authorities
 * WARNING: This will delete all existing authorities and re-create them
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSection } from '@/lib/api-auth';
import { reSeedIsraeliAuthorities } from '@/features/admin/services/re-seed-authorities';

export async function POST(request: NextRequest) {
  const denied = await requireSection(request, 'system');
  if (denied) return denied;
  try {
    console.log('[API] Starting re-seed of authorities...');
    
    const result = await reSeedIsraeliAuthorities();
    
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('[API] Error re-seeding authorities:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to re-seed authorities',
      },
      { status: 500 }
    );
  }
}
