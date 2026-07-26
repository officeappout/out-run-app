/**
 * POST /api/admin/finance/seed-vendors
 * Body: { dryRun?: boolean }   (default dryRun: true — safe by default)
 *
 * Plants the version-controlled vendor catalog into Firestore `finance_vendors`.
 * Idempotent: only absent vendors are created; panel-edited docs are never
 * clobbered. dryRun reports what WOULD be created without writing.
 *
 * Auth: requireAdminApi (agent key or admin session). No side effects beyond
 * creating missing vendor docs.
 */
import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { seedFinanceVendors, FINANCE_VENDORS_SEED } from '@/features/admin/services/finance/finance-vendors.seed';

export async function POST(request: NextRequest) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  let body: { dryRun?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body → defaults */
  }
  // Safe by default: only writes when the caller explicitly passes dryRun:false.
  const dryRun = body.dryRun ?? true;

  try {
    const result = await seedFinanceVendors(getAdminDb(), { dryRun });
    return NextResponse.json({
      ok: true,
      catalogSize: FINANCE_VENDORS_SEED.length,
      ...result,
    });
  } catch (err: any) {
    console.error('[finance/seed-vendors]', err);
    return NextResponse.json({ ok: false, error: err?.message ?? 'seed error' }, { status: 500 });
  }
}
