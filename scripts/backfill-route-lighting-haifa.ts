/**
 * scripts/backfill-route-lighting-haifa.ts — persists qualitySignals.lighting
 * for a city's official_routes, computed from street_segments.tags.lit (the
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
 * CITY-PARAMETERIZED (Phase 0.3, 01.09.2026): the underlying classifier was
 * already city-agnostic — only this wrapper was Haifa-locked. --city=
 * defaults to 'חיפה', preserving today's exact behavior byte-for-byte when
 * run with no flags. File kept at its historical "-haifa" name (zero
 * external references, but not renamed here to hold invocation-path
 * compatibility maximally strict — a natural rename once Phase 1's
 * orchestrator calls this by path anyway).
 *
 * Usage:
 *   npx tsx scripts/backfill-route-lighting-haifa.ts                       # Haifa, dry-run (default)
 *   npx tsx scripts/backfill-route-lighting-haifa.ts --apply               # Haifa, real write
 *   npx tsx scripts/backfill-route-lighting-haifa.ts --city="רמת גן"        # another city, dry-run
 *   npx tsx scripts/backfill-route-lighting-haifa.ts --city="תל אביב,תל אביב-יפו" --apply
 *                                                                          # comma-separated aliases
 *                                                                          # (the two-spelling case)
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { computeRouteLighting, REAL_DATA_MIN_FRACTION } from './lib/route-lighting-street-segments.node';

const APPLY = process.argv.includes('--apply');

function argValue(flag: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg ? arg.slice(flag.length + 3) : undefined;
}

// City parameterization — defaults preserve today's exact Haifa behavior.
// Comma-separated so a future two-spelling city (e.g. Tel Aviv's own debt)
// can pass multiple aliases without a signature change — computeRouteLighting
// already expects an alias list for exactly this reason (see below).
const CITY_ALIASES = (argValue('city') ?? 'חיפה').split(',').map((s) => s.trim()).filter(Boolean);
// Filename tag for the reversible log (kept literally 'haifa' by default so
// the output path is byte-identical to today's; pass --label= to tag another
// city's log file distinctly).
const CITY_LABEL = argValue('label') ?? 'haifa';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

interface LogEntry {
  id: string; name: string;
  before: { status: string; litCoveragePct: number | null; isLit: boolean | null } | null;
  after: { status: string; litCoveragePct: number | null; isLit: boolean | null };
  candidateSegmentsFound: number; samplePointCount: number; realDataPointFraction: number;
}

async function main() {
  const db = initFb();
  const { buildValidatedDoc } = await import('../src/lib/route-collections');
  console.log(`=== ${CITY_ALIASES.join('/')} lighting backfill — ${APPLY ? '🔴 APPLY (real write)' : '🟢 DRY-RUN (no writes)'} ===\n`);

  const authoritySnap = await db.collection('authorities').get();
  const knownAuthorityIds = new Set(authoritySnap.docs.map((d) => d.id));

  const routesSnap = await db.collection('official_routes').where('city', 'in', CITY_ALIASES).get();
  console.log(`Loaded ${routesSnap.size} ${CITY_ALIASES.join('/')} official_routes.\n`);

  const logEntries: LogEntry[] = [];
  const toWrite: Array<{ ref: FirebaseFirestore.DocumentReference; validated: Record<string, unknown> }> = [];
  let skippedNoComposition = 0;
  let litCount = 0, unlitCount = 0, unknownCount = 0;
  let unknownZeroCandidates = 0, unknownLowRealData = 0;
  const coverages: number[] = [];

  for (const doc of routesSnap.docs) {
    const data = doc.data();
    const rawPath = Array.isArray(data.path) ? data.path : [];
    const result = await computeRouteLighting(db, rawPath, CITY_ALIASES);

    if (result.status === 'computed') coverages.push(result.litCoveragePct!);
    if (result.status === 'unknown') {
      unknownCount++;
      if (result.candidateSegmentsFound === 0) unknownZeroCandidates++; else unknownLowRealData++;
    }
    else if (result.isLit) litCount++;
    else unlitCount++;

    const realDataPct = Math.round(result.realDataPointFraction * 1000) / 10;
    console.log(
      `[${doc.id}] "${data.name}" — ${result.status}` +
      (result.status === 'computed'
        ? ` coverage=${result.litCoveragePct}% isLit=${result.isLit}`
        : result.candidateSegmentsFound === 0 ? ' (0 candidate segments found)' : ` (real-tag data only ${realDataPct}% of points — below the ${Math.round(50)}% trust floor)`) +
      ` (${result.samplePointCount} samples, ${result.candidateSegmentsFound} candidates, realDataPct=${realDataPct}%)`,
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
    logEntries.push({ id: doc.id, name: data.name, before: existingLighting, after: { status: newLighting.status, litCoveragePct: newLighting.litCoveragePct, isLit: newLighting.isLit }, candidateSegmentsFound: result.candidateSegmentsFound, samplePointCount: result.samplePointCount, realDataPointFraction: result.realDataPointFraction });

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
  console.log(`lit (≥60% of real-tagged points): ${litCount}`);
  console.log(`unlit (computed, real data present, <60%): ${unlitCount}`);
  console.log(`unknown: ${unknownCount}  (${unknownZeroCandidates} zero candidate segments, ${unknownLowRealData} real-tag data below the ${Math.round(REAL_DATA_MIN_FRACTION * 100)}% trust floor)`);
  if (coverages.length > 0) {
    const avg = Math.round((coverages.reduce((s, c) => s + c, 0) / coverages.length) * 10) / 10;
    console.log(`avg coverage among computed routes: ${avg}%  (min=${Math.min(...coverages)}%  max=${Math.max(...coverages)}%)`);
  }
  if (skippedNoComposition > 0) console.log(`⚠ ${skippedNoComposition} route(s) skipped — no existing composition, needs investigation.`);

  console.log(`\n=== ${APPLY ? 'Writing' : 'Would write'} ${toWrite.length} doc(s) (lighting only, composition preserved unchanged) ===`);

  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const logPath = path.join(outDir, `${CITY_LABEL}-lighting-backfill-log-${APPLY ? 'apply' : 'dryrun'}-${Date.now()}.json`);
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
