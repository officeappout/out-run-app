/**
 * API Route to trigger re-seed of authorities.
 * WARNING: a real (non-dry-run) call deletes all existing authorities and
 * re-creates them. Defaults to a dry run — see re-seed-authorities.ts's
 * safety gate for the full guard (env var + confirm phrase + a project-id
 * check that currently refuses unconditionally, since there is no separate
 * staging project). A request body is optional; omitting it is a dry run.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSection } from '@/lib/api-auth';
import { reSeedIsraeliAuthorities } from '@/features/admin/services/re-seed-authorities';

export async function POST(request: NextRequest) {
  const denied = await requireSection(request, 'system');
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const dryRun = body?.dryRun !== false;
    console.log(dryRun ? '[API] Re-seed dry run requested...' : '[API] Starting DESTRUCTIVE re-seed of authorities...');

    const result = await reSeedIsraeliAuthorities({ dryRun, confirmPhrase: body?.confirmPhrase });

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
