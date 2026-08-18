/**
 * scripts/backfill-route-shape.ts — Stage 3 Phase 3.2 of the
 * route-enrichment-pipeline plan (17.08.2026).
 *
 * `Route.routeShape` (route.types.ts) has been populated at every live
 * write path since Stage 1A (16.08.2026) — geo-discovery-routes.ts,
 * import-osm-routes-tlv.ts, RouteEditor's manual save, and every generator
 * construction site. This script is the one-time catch-up for docs that
 * predate that: existing `official_routes`/`curated_routes` docs still
 * missing `routeShape` entirely.
 *
 * TLV ONLY this round — not "per city" as the original Stage 3 outline
 * said. The build-out arc is explicitly TLV-prove-every-layer-first;
 * Haifa (or any other city) is a deliberate separate future run once every
 * layer (this one included) is proven end-to-end here.
 *
 * Reuses classifyRouteShape/isLoopPath (geoUtils.ts) — the exact primitives
 * Stage 1A already wired into every live write path, not re-derived.
 * Writes go through the Stage 1B chokepoint (buildValidatedDoc, UPDATE
 * mode) — this payload only ever touches `routeShape`, never
 * authorityId/city, so the chokepoint's lock-check is a no-op regardless,
 * but `existing`/`knownAuthorityIds` are still passed faithfully, matching
 * every other migrated writer's calling convention.
 *
 * Usage:
 *   DRY RUN (default — no writes, prints every affected doc + computed shape):
 *     npx tsx scripts/backfill-route-shape.ts
 *
 *   LIVE RUN (commits changes — requires explicit --apply):
 *     npx tsx scripts/backfill-route-shape.ts --apply
 *
 * Prerequisites:
 *   - FIREBASE_SERVICE_ACCOUNT_KEY set in .env.local
 *   - Run from the repo root so dotenv/.env.local resolves.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import { classifyRouteShape } from '../src/features/parks/core/services/geoUtils';
import { buildValidatedDoc } from '../src/lib/route-collections';

const isApply = process.argv.includes('--apply');
const mode = isApply ? 'APPLY' : 'DRY-RUN';

const TLV_CITY = 'תל אביב-יפו';
const COLLECTIONS = ['official_routes', 'curated_routes'] as const;

const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
if (!rawKey) {
  console.error('❌  FIREBASE_SERVICE_ACCOUNT_KEY not set (expected in .env.local)');
  process.exit(1);
}
const cred = JSON.parse(rawKey);
if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
}
const db = admin.firestore();

interface AffectedDoc {
  collection: (typeof COLLECTIONS)[number];
  id: string;
  name: string;
  authorityId?: string;
  city?: string;
  computedShape: 'loop' | 'out_and_back' | undefined;
}

async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  routeShape Backfill — Tel Aviv only   [${mode.padEnd(8)}]         ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (!isApply) {
    console.log('\n⚠️  DRY-RUN mode — no changes will be written.');
    console.log('   Run with --apply to write changes (only after review).\n');
  }

  const authoritySnap = await db.collection('authorities').get();
  const knownAuthorityIds = new Set(authoritySnap.docs.map((d) => d.id));

  const affected: AffectedDoc[] = [];
  let neitherShapeApplies = 0;

  for (const collectionName of COLLECTIONS) {
    console.log(`\n📊 Scanning ${collectionName} (city="${TLV_CITY}")...`);
    const snap = await db.collection(collectionName).where('city', '==', TLV_CITY).get();
    console.log(`   ${snap.size} TLV doc(s) total.`);

    for (const d of snap.docs) {
      const data = d.data();
      if (data.routeShape !== undefined) continue; // already has it — nothing to do

      const rawPath = data.path;
      if (!Array.isArray(rawPath) || rawPath.length < 2) continue; // no usable geometry
      const path: [number, number][] = rawPath.map((p: any) => [Number(p.lng) || 0, Number(p.lat) || 0]);
      const computedShape = classifyRouteShape(path);
      if (computedShape === undefined) {
        neitherShapeApplies++;
        continue; // genuine point-to-point path — routeShape correctly stays undefined, not a bug
      }

      affected.push({
        collection: collectionName,
        id: d.id,
        name: data.name ?? '(no name)',
        authorityId: data.authorityId,
        city: data.city,
        computedShape,
      });
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  AFFECTED DOCS — routeShape missing, geometry classifiable  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  if (affected.length === 0) {
    console.log('  (none found)');
  } else {
    for (const e of affected) {
      console.log(`  [${e.collection}] ${e.id}  shape=${e.computedShape}  authorityId=${e.authorityId ?? '(none)'}  "${e.name}"`);
    }
  }
  console.log(`\n(${neitherShapeApplies} doc(s) scanned had usable geometry but neither loop nor out-and-back applies — routeShape correctly stays undefined for those, not counted as affected.)`);

  console.log(`\n${isApply ? 'Applying' : '[dry-run] would apply'} ${affected.length} routeShape write(s).`);

  if (isApply && affected.length > 0) {
    const CHUNK = 500;
    let applied = 0;
    for (let i = 0; i < affected.length; i += CHUNK) {
      const chunk = affected.slice(i, i + CHUNK);
      const batch = db.batch();
      for (const e of chunk) {
        const validated = buildValidatedDoc(
          e.collection,
          { routeShape: e.computedShape, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
          { mode: 'update', knownAuthorityIds, existing: { authorityId: e.authorityId, city: e.city } },
        );
        batch.update(db.collection(e.collection).doc(e.id), validated as Record<string, unknown>);
      }
      await batch.commit();
      applied += chunk.length;
      console.log(`  ✔ committed ${applied}/${affected.length}`);
    }
  }

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                        SUMMARY                              ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║  Mode:                    ${mode.padEnd(31)}║`);
  console.log(`║  Docs missing routeShape: ${String(affected.length).padEnd(31)}║`);
  console.log(`║  ${isApply ? 'Fixed this run:            ' + String(affected.length).padEnd(31) : 'Run with --apply to fix' + ' '.padEnd(35)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
