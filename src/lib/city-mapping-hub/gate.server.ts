/**
 * The hub's server-side flag gate: enable_city_mapping_hub, the REAL value
 * (no super-admin override). Hub-only reads/writes answer 403 while it is
 * off, so the page and its routes never disagree. Runs AFTER
 * requireSuperAdminApi (the flag is not an auth check). Fail-closed: a read
 * error returns the default (false).
 */
import 'server-only';
import { NextResponse } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { getServerFeatureFlags } from '@/lib/ai/entitlement.server';

export async function hubFlagDenied(db: Firestore): Promise<NextResponse | null> {
  const flags = await getServerFeatureFlags(db);
  return flags.enableCityMappingHub === true
    ? null
    : NextResponse.json({ error: 'city mapping hub is off (enable_city_mapping_hub)' }, { status: 403 });
}
