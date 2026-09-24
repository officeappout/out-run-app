/**
 * scripts/backfill-authority-boundary.ts — city-mapping pipeline, new step
 * "authorityBoundary" (23.09.2026). Fetches an authority's real OSM
 * admin_level=8 boundary via scripts/lib/osm-boundary-fetch.node.ts's
 * `fetchCityBoundary` (extracted verbatim from extract-osm-amenities-tlv.ts —
 * proven code, not rewritten) and writes it to `authorities/{id}.boundaryGeoJSON`
 * so `resolveAuthorityForPoint` (src/lib/route-collections/authority-resolution.ts)
 * has real polygon data to match against — today EVERY authority doc has
 * neither `boundaryGeoJSON` nor `radiusKm`, so automatic authority
 * identification for a new park/route point has nothing to resolve against.
 *
 * Scope (David, 23.09.2026): the 6 operational cities only — שדרות, אשקלון,
 * חיפה, הרצליה, תל אביב, זכרון (NOT all ~2,755 authority docs — most are
 * neighborhoods/non-operational and get boundaries in a future batch, see
 * this run's own report for the ~10-authority list prepared as sales
 * material, not run here). Runs per-city, like every other city-mapping step.
 *
 * Field contract: writes `authorities/{id}.boundaryGeoJSON` as a JSON
 * STRING (`JSON.stringify(feature)`), not a raw object — Firestore rejects
 * nested arrays at any depth ("Property boundaryGeoJSON contains an invalid
 * nested entity"), verified empirically 23.09.2026 (a raw GeoJSON
 * Polygon/MultiPolygon's `coordinates` is inherently array-of-arrays). The
 * in-memory `AuthorityBoundary.boundaryGeoJSON: Feature<Polygon |
 * MultiPolygon>` shape `resolveAuthorityForPoint` consumes is unchanged —
 * `parseBoundaryGeoJSON` (authority-resolution.ts) is the one place that
 * parses this string back into an object, called from
 * authority.service.ts's `Authority` mapper. Any other reader of this field
 * (including the parallel contribution-flow work) must go through that same
 * parse step — see this task's chat log, 23.09.2026, for the explicit
 * field-format handoff.
 *
 * CLI + importable function, same split as every other city-mapping step
 * (runExtractOsmAmenities, runOsmImport, ...).
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import { fetchCityBoundary } from './lib/osm-boundary-fetch.node';
import { findAuthorityByCityName } from '../src/lib/route-collections/authority-resolution';

export interface BackfillAuthorityBoundaryOptions {
  city: string;
  adminRelationId: number;
  apply: boolean;
  db: admin.firestore.Firestore;
}

export interface BackfillAuthorityBoundaryResult {
  authorityId: string;
  cityName: string;
  geometryType: 'Polygon' | 'MultiPolygon';
  partCount: number;
  alreadyHadBoundary: boolean;
  writesApplied: number;
}

export async function runBackfillAuthorityBoundary(opts: BackfillAuthorityBoundaryOptions): Promise<BackfillAuthorityBoundaryResult> {
  const { db, city, adminRelationId } = opts;
  const isApply = opts.apply;

  // Same authority-resolution as every other city-mapping step — never a
  // hardcoded/guessed authorityId.
  const authoritySnap = await db.collection('authorities').get();
  const authorities = authoritySnap.docs.map((d) => ({ id: d.id, name: (d.data().label as string) ?? (d.data().name as string) ?? '' }));
  const authorityId = findAuthorityByCityName(city, authorities);
  if (!authorityId) {
    throw new Error(`Could not resolve an authority for "${city}" — aborting (never guessing an authorityId).`);
  }

  const authorityDocRef = db.collection('authorities').doc(authorityId);
  const existing = await authorityDocRef.get();
  const alreadyHadBoundary = !!existing.data()?.boundaryGeoJSON;

  console.log(`📍 ${city} → authorityId ${authorityId}${alreadyHadBoundary ? ' (already has a boundaryGeoJSON — will overwrite with fresh OSM fetch)' : ''}`);
  console.log(`   Fetching admin_level=8 boundary for relation/${adminRelationId}...`);

  const feature = await fetchCityBoundary(adminRelationId, city);
  const partCount = feature.geometry.type === 'Polygon' ? 1 : feature.geometry.coordinates.length;
  console.log(`   ✅ ${feature.geometry.type} (${partCount} part${partCount === 1 ? '' : 's'}).`);

  let writesApplied = 0;
  if (isApply) {
    // JSON string, not the raw feature object — Firestore rejects nested
    // arrays (see this file's header comment). authority.service.ts's
    // Authority mapper parses it back via parseBoundaryGeoJSON.
    await authorityDocRef.update({
      boundaryGeoJSON: JSON.stringify(feature),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    writesApplied = 1;
    console.log(`   💾 Written to authorities/${authorityId}.boundaryGeoJSON (${Buffer.byteLength(JSON.stringify(feature), 'utf8')} bytes, JSON string)`);
  } else {
    console.log('   ⚠️  DRY-RUN — not written. Run with --apply to write.');
  }

  return {
    authorityId,
    cityName: city,
    geometryType: feature.geometry.type,
    partCount,
    alreadyHadBoundary,
    writesApplied,
  };
}

// ── CLI entry point ─────────────────────────────────────────────────────
if (require.main === module) {
  const isApply = process.argv.includes('--apply');
  const argValue = (flag: string): string | undefined => {
    const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
    return arg ? arg.slice(flag.length + 3) : undefined;
  };
  const CITY = argValue('city');
  const relationIdArg = argValue('relationId');
  if (!CITY || !relationIdArg) {
    console.error('❌  Usage: npx tsx scripts/backfill-authority-boundary.ts --city="<name>" --relationId=<osm_admin_level_8_relation_id> [--apply]');
    process.exit(1);
  }
  const ADMIN_RELATION_ID = Number(relationIdArg);

  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) { console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set in .env.local.'); process.exit(1); }
  const cred = JSON.parse(rawKey);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
  const db = admin.firestore();

  runBackfillAuthorityBoundary({ city: CITY, adminRelationId: ADMIN_RELATION_ID, apply: isApply, db })
    .then((result) => {
      console.log('\n' + JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
