/**
 * scripts/backfill-route-quality-signals.ts — Stage 2 of the quality-
 * certificate v1. Persists Route.qualitySignals.composition (sidewalkPct/
 * genuinePct/ordinaryPct/otherPct) to every official_routes/curated_routes
 * doc. COMPOSITION ONLY — lighting is a separate, later task; this script
 * never writes qualitySignals.lighting.
 *
 * DETERMINISTIC RECOMPUTE: uses the EXACT SAME per-city Overpass-fetch +
 * grid-build + composition-compute path as scripts/audit-route-quality-
 * signals.ts (Stage 1) — both import from scripts/lib/route-quality-osm-
 * fetch.node.ts and scripts/lib/route-composition-classify.ts, not two
 * hand-typed copies of the same algorithm. Re-fetches OSM fresh every run
 * (not a one-time stamp) — running this twice back to back should reproduce
 * the same numbers modulo any real OSM edits between runs.
 *
 * CHOKEPOINT: every write goes through buildValidatedDoc('official_routes'
 * | 'curated_routes', payload, {mode:'update', ...}) before being batched —
 * axioms.md §23. NOT InventoryService.updateRoute: that function is client-
 * SDK (`db` from '@/lib/firebase', firebase/firestore's updateDoc/getDoc),
 * only touches 'official_routes' (no curated_routes support), and cannot
 * run in a Node/tsx script context. buildValidatedDoc itself has zero
 * firebase imports (importable from both) — it IS the chokepoint per its
 * own header comment ("Every writer — InventoryService methods,
 * geo-discovery-routes.ts and friends — calls this immediately before the
 * actual Firestore write"). This script follows the SAME pattern
 * geo-discovery-routes.ts (an already axioms-§23-compliant writer) uses:
 * buildValidatedDoc() to validate, then a plain Admin SDK db.batch() to
 * write. The payload never touches authorityId/city, so the chokepoint's
 * lock-check is a no-op regardless — `existing` is still passed faithfully.
 *
 * REVERSIBLE: FieldValue.delete('qualitySignals') restores the pre-backfill
 * state exactly, since nothing occupied that key before this script. Every
 * write is logged (old presence + new value) BEFORE the batch commits.
 *
 * IDEMPOTENT: re-running overwrites qualitySignals.composition with a fresh
 * recompute (and a fresh computedAt) — never skips a doc just because it
 * already has a value, since "already computed" isn't "still correct" if
 * OSM data or the classifier changes.
 *
 * Usage:
 *   npx tsx scripts/backfill-route-quality-signals.ts             # dry-run (default)
 *   npx tsx scripts/backfill-route-quality-signals.ts --apply     # real write
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { deriveCityBbox, fetchCityWayGrid, computeCityComposition } from './lib/route-quality-osm-fetch.node';
import type { RouteComposition } from './lib/route-composition-classify';

const APPLY = process.argv.includes('--apply');

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

interface LogEntry {
  id: string; collection: 'official_routes' | 'curated_routes'; name: string; city: string;
  before: { sidewalkPct: number; genuinePct: number; ordinaryPct: number; otherPct: number } | null;
  after: { sidewalkPct: number; genuinePct: number; ordinaryPct: number; otherPct: number };
}

async function main() {
  const db = initFb();
  const { buildValidatedDoc } = await import('../src/lib/route-collections');
  console.log(`=== Quality-certificate v1 backfill (composition only) — ${APPLY ? '🔴 APPLY (real write)' : '🟢 DRY-RUN (no writes)'} ===\n`);

  const authoritySnap = await db.collection('authorities').get();
  const knownAuthorityIds = new Set(authoritySnap.docs.map(d => d.id));

  const [officialSnap, curatedSnap] = await Promise.all([
    db.collection('official_routes').get(),
    db.collection('curated_routes').get(),
  ]);
  console.log(`Loaded: ${officialSnap.size} official_routes, ${curatedSnap.size} curated_routes.\n`);

  type RouteRow = {
    id: string; collection: 'official_routes' | 'curated_routes'; ref: FirebaseFirestore.DocumentReference;
    name: string; city: string; path: [number, number][]; existingAuthorityId?: string; existingCity?: string;
    existingQualitySignals?: any;
  };
  const allRoutes: RouteRow[] = [];
  for (const [snap, collection] of [[officialSnap, 'official_routes'], [curatedSnap, 'curated_routes']] as const) {
    for (const d of snap.docs) {
      const data: any = d.data();
      const path: [number, number][] = Array.isArray(data.path) ? data.path.map((p: any) => [Number(p.lat), Number(p.lng)]) : [];
      allRoutes.push({
        id: d.id, collection, ref: d.ref, name: data.name || '(unnamed)', city: data.city || '(none)', path,
        existingAuthorityId: data.authorityId, existingCity: data.city,
        existingQualitySignals: data.qualitySignals,
      });
    }
  }

  const byCity = new Map<string, RouteRow[]>();
  for (const r of allRoutes) {
    if (!byCity.has(r.city)) byCity.set(r.city, []);
    byCity.get(r.city)!.push(r);
  }

  const logEntries: LogEntry[] = [];
  const toWrite: Array<{ ref: FirebaseFirestore.DocumentReference; validated: Record<string, unknown> }> = [];
  let noPathCount = 0;

  for (const [city, cityRoutes] of Array.from(byCity.entries())) {
    console.log(`\n=== ${city} (${cityRoutes.length} routes) ===`);
    const validRoutes = cityRoutes.filter(r => r.path.length >= 2);
    noPathCount += cityRoutes.length - validRoutes.length;
    if (validRoutes.length === 0) { console.log('  No routes with a usable path — skipping.'); continue; }

    const { bboxStr } = deriveCityBbox(validRoutes.map(r => r.path));
    console.log(`  bbox: ${bboxStr}`);
    console.log('  Fetching highway ways …');
    const grid = await fetchCityWayGrid(bboxStr);
    console.log(`  ${grid.wayCount} ways fetched (${grid.roadWayCount} road-category).`);

    const compositionByRouteId = computeCityComposition(validRoutes.map(r => ({ id: r.id, path: r.path })), grid);

    for (const r of validRoutes) {
      const comp = compositionByRouteId.get(r.id)! as RouteComposition;
      const composition = { sidewalkPct: comp.sidewalkPct, genuinePct: comp.genuinePct, ordinaryPct: comp.ordinaryPct, otherPct: comp.otherPct + comp.unmatchedPct };

      const existingComposition = r.existingQualitySignals?.composition
        ? {
            sidewalkPct: r.existingQualitySignals.composition.sidewalkPct,
            genuinePct: r.existingQualitySignals.composition.genuinePct,
            ordinaryPct: r.existingQualitySignals.composition.ordinaryPct,
            otherPct: r.existingQualitySignals.composition.otherPct,
          }
        : null;
      logEntries.push({ id: r.id, collection: r.collection, name: r.name, city, before: existingComposition, after: composition });

      const payload = {
        qualitySignals: {
          composition,
          ...(r.existingQualitySignals?.lighting ? { lighting: r.existingQualitySignals.lighting } : {}),
          computedAt: admin.firestore.FieldValue.serverTimestamp(),
          source: 'osm_overpass_v1' as const,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      const validated = buildValidatedDoc(r.collection, payload, {
        mode: 'update',
        knownAuthorityIds,
        existing: { authorityId: r.existingAuthorityId, city: r.existingCity },
      });
      toWrite.push({ ref: r.ref, validated });
    }
  }

  console.log(`\n\n=== ${APPLY ? 'Writing' : 'Would write'} ${toWrite.length} doc(s) (composition only, lighting untouched) ===`);
  console.log(`(${noPathCount} route(s) skipped — no usable path.)`);

  // Log BEFORE writing — reversible even if the script is interrupted mid-batch.
  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const logPath = path.join(outDir, `quality-signals-backfill-log-${APPLY ? 'apply' : 'dryrun'}-${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify({ generatedAt: new Date().toISOString(), applied: APPLY, entries: logEntries }, null, 2));
  console.log(`Reversible before/after log written to: ${logPath}`);
  console.log(`Reversal (if ever needed): FieldValue.delete('qualitySignals') on each doc listed above restores the pre-backfill state exactly.`);

  if (!APPLY) {
    console.log('\n🟢 DRY-RUN complete — no writes made. Re-run with --apply to write for real.');
    return;
  }

  console.log('\n🔴 Applying writes...');
  for (let i = 0; i < toWrite.length; i += 500) {
    const batch = db.batch();
    const chunk = toWrite.slice(i, i + 500);
    chunk.forEach(({ ref, validated }) => batch.update(ref, validated));
    await batch.commit();
    console.log(`  committed ${Math.min(i + 500, toWrite.length)}/${toWrite.length}`);
  }
  console.log(`\n✅ Applied qualitySignals.composition to ${toWrite.length} route(s).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e); process.exit(1); });
