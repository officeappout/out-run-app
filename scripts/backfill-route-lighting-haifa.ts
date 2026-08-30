/**
 * scripts/backfill-route-lighting-haifa.ts — persists qualitySignals.lighting
 * for Haifa's official_routes, computed from street_segments.tags.lit (the
 * denser, already-live source — see the consumer-pollution investigation:
 * Haifa's street network was already ingested weeks ago, no new ingestion
 * needed). Reuses route-comfort-tags.service.ts's computeLitCoverage/
 * shouldSuggestNightLighting via scripts/lib/route-lighting-street-
 * segments.node.ts — the SAME extraction backfill-route-lit-tag-tlv.ts's
 * future generalization will also call, not a second method.
 *
 * ADDITIVE ONLY: writes qualitySignals.lighting. qualitySignals.composition
 * (already live for every route, prior task) is read and re-included
 * UNCHANGED in the payload — buildValidatedDoc validates qualitySignals as
 * one nested object, so a partial dot-path update would bypass schema
 * validation for this field; the safe way to touch only `lighting` is to
 * carry the existing `composition` through untouched. Nothing else on the
 * route doc is touched.
 *
 * HONESTY: status:'unknown' ONLY when a route's sampled points found ZERO
 * same-city candidate street_segments at all (no data, not "computed and
 * happens to be low"). A route with real nearby segments but low coverage
 * gets status:'computed', isLit:false — a genuine result, never masked as
 * unknown.
 *
 * Dry-run default, explicit --apply, batched, before/after log — same
 * pattern as scripts/backfill-route-quality-signals.ts (composition).
 *
 * Usage:
 *   npx tsx scripts/backfill-route-lighting-haifa.ts             # dry-run (default)
 *   npx tsx scripts/backfill-route-lighting-haifa.ts --apply     # real write
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { computeRouteLighting } from './lib/route-lighting-street-segments.node';

const APPLY = process.argv.includes('--apply');
const HAIFA_CITY = 'חיפה';
// Haifa has only ever been ingested under one spelling (confirmed live,
// 30.08.2026 cityName breakdown) — unlike Tel Aviv's two-spelling debt
// (logged separately, not this task's concern). Still passed as an array —
// computeRouteLighting's signature is alias-list-shaped so a future TLV
// call passes ['תל אביב', 'תל אביב-יפו'] without a signature change.
const HAIFA_CITYNAME_ALIASES = ['חיפה'];

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

interface LogEntry {
  id: string; name: string;
  before: { status: string; litCoveragePct: number | null; isLit: boolean | null } | null;
  after: { status: string; litCoveragePct: number | null; isLit: boolean | null };
  candidateSegmentsFound: number; samplePointCount: number;
}

async function main() {
  const db = initFb();
  const { buildValidatedDoc } = await import('../src/lib/route-collections');
  console.log(`=== Haifa lighting backfill — ${APPLY ? '🔴 APPLY (real write)' : '🟢 DRY-RUN (no writes)'} ===\n`);

  const authoritySnap = await db.collection('authorities').get();
  const knownAuthorityIds = new Set(authoritySnap.docs.map((d) => d.id));

  const routesSnap = await db.collection('official_routes').where('city', '==', HAIFA_CITY).get();
  console.log(`Loaded ${routesSnap.size} Haifa official_routes.\n`);

  const logEntries: LogEntry[] = [];
  const toWrite: Array<{ ref: FirebaseFirestore.DocumentReference; validated: Record<string, unknown> }> = [];
  let skippedNoComposition = 0;
  let litCount = 0, unlitCount = 0, unknownCount = 0;
  const coverages: number[] = [];

  for (const doc of routesSnap.docs) {
    const data = doc.data();
    const rawPath = Array.isArray(data.path) ? data.path : [];
    const result = await computeRouteLighting(db, rawPath, HAIFA_CITYNAME_ALIASES);

    if (result.status === 'computed') coverages.push(result.litCoveragePct!);
    if (result.status === 'unknown') unknownCount++;
    else if (result.isLit) litCount++;
    else unlitCount++;

    console.log(
      `[${doc.id}] "${data.name}" — ${result.status}` +
      (result.status === 'computed' ? ` coverage=${result.litCoveragePct}% isLit=${result.isLit}` : ' (0 candidate segments found)') +
      ` (${result.samplePointCount} samples, ${result.candidateSegmentsFound} candidates)`,
    );

    const existingComposition = data.qualitySignals?.composition;
    if (!existingComposition) {
      console.warn(`  ⚠ SKIPPED — no existing qualitySignals.composition (expected from the prior backfill; investigate before writing lighting alone).`);
      skippedNoComposition++;
      continue;
    }
    const existingLighting = data.qualitySignals?.lighting
      ? { status: data.qualitySignals.lighting.status, litCoveragePct: data.qualitySignals.lighting.litCoveragePct, isLit: data.qualitySignals.lighting.isLit }
      : null;
    const newLighting = { status: result.status, litCoveragePct: result.litCoveragePct, isLit: result.isLit, source: 'street_segments_lit' as const };
    logEntries.push({ id: doc.id, name: data.name, before: existingLighting, after: { status: newLighting.status, litCoveragePct: newLighting.litCoveragePct, isLit: newLighting.isLit }, candidateSegmentsFound: result.candidateSegmentsFound, samplePointCount: result.samplePointCount });

    const payload = {
      qualitySignals: {
        composition: existingComposition,
        lighting: newLighting,
        computedAt: admin.firestore.FieldValue.serverTimestamp(),
        source: data.qualitySignals.source ?? 'osm_overpass_v1',
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const validated = buildValidatedDoc('official_routes', payload, {
      mode: 'update',
      knownAuthorityIds,
      existing: { authorityId: data.authorityId, city: data.city },
    });
    toWrite.push({ ref: doc.ref, validated });
  }

  console.log(`\n\n=== Per-route summary ===`);
  console.log(`lit (≥60%): ${litCount}`);
  console.log(`unlit (computed, <60%): ${unlitCount}`);
  console.log(`unknown (0 candidate segments): ${unknownCount}`);
  if (coverages.length > 0) {
    const avg = Math.round((coverages.reduce((s, c) => s + c, 0) / coverages.length) * 10) / 10;
    console.log(`avg coverage among computed routes: ${avg}%  (min=${Math.min(...coverages)}%  max=${Math.max(...coverages)}%)`);
  }
  if (skippedNoComposition > 0) console.log(`⚠ ${skippedNoComposition} route(s) skipped — no existing composition, needs investigation.`);

  console.log(`\n=== ${APPLY ? 'Writing' : 'Would write'} ${toWrite.length} doc(s) (lighting only, composition preserved unchanged) ===`);

  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const logPath = path.join(outDir, `haifa-lighting-backfill-log-${APPLY ? 'apply' : 'dryrun'}-${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify({ generatedAt: new Date().toISOString(), applied: APPLY, entries: logEntries }, null, 2));
  console.log(`Reversible before/after log written to: ${logPath}`);

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
  console.log(`\n✅ Applied qualitySignals.lighting to ${toWrite.length} Haifa route(s).`);
}

main().then(() => process.exit(0)).catch((e) => { console.error('FATAL:', e); process.exit(1); });
