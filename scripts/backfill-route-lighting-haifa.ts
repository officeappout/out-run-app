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
 *
 * CALLABLE (Phase 1 Stage B, 02.09.2026): the core logic below is exported
 * as `runBackfillRouteLighting()` — same "CLI + importable function" split
 * established for osm-segment-importer.ts's runOsmImport, applied here so
 * the city-mapping orchestrator's thin API route can call this directly.
 * The CLI entry point at the bottom is now a thin argv-parsing wrapper
 * around the same function, zero behavior change — verified via a dry-run
 * before/after.
 *
 * CHUNKED (04.09.2026, lighting-step 504 fix, part 2): even with
 * concurrency-capped queries (route-lighting-street-segments.node.ts) and
 * the cityHasAnySegments short-circuit, a dense city (Haifa: 500-7,900
 * street-segment candidates per route) measured at 116-146s for 77 routes —
 * still over the API route's 60s maxDuration. `runBackfillRouteLightingChunk()`
 * is the new per-chunk core (bounded slice of a city's official_routes,
 * ordered by document id via a cursor so repeated calls never re-process or
 * skip a route); `runBackfillRouteLighting()` below is now a thin loop over
 * chunks that preserves 100% of the CLI's original single-shot behavior
 * (one process, one aggregated reversible log) — it has no maxDuration to
 * worry about, so it simply drains every chunk in one run. The API route
 * (src/app/api/admin/city-mapping/lighting/route.ts) calls the chunk
 * function directly, ONE chunk per HTTP call, and the orchestrator
 * (city-mapping-orchestrator.ts) drives the repeat-until-done loop
 * client-side, exactly mirroring this file's own internal loop.
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';
import { computeRouteLighting, cityHasAnySegments, REAL_DATA_MIN_FRACTION } from './lib/route-lighting-street-segments.node';

interface LogEntry {
  id: string; name: string;
  before: { status: string; litCoveragePct: number | null; isLit: boolean | null } | null;
  after: { status: string; litCoveragePct: number | null; isLit: boolean | null };
  candidateSegmentsFound: number; samplePointCount: number; realDataPointFraction: number;
}

/**
 * Target ~30-40s wall-clock per chunk on Haifa's density (measured ~1.9s/route
 * at concurrency=25 — see route-lighting-street-segments.node.ts). 22 routes
 * lands ~42s in the worst-measured case, leaving real margin under the 60s
 * API cap even if a chunk happens to draw several high-candidate routes.
 */
const DEFAULT_LIGHTING_CHUNK_SIZE = 15;

export interface LightingChunkOptions {
  cityAliases: string[];
  apply: boolean;
  db: admin.firestore.Firestore;
  /** Last-processed doc id from the previous chunk's response; omit/null to start from the beginning. */
  cursorId?: string | null;
  chunkSize?: number;
}

export interface LightingChunkResult {
  routesProcessedThisChunk: number;
  totalRoutesInCity: number;
  chunkSize: number;
  /** Pass this into the next call's cursorId; null when done. */
  cursorId: string | null;
  done: boolean;
  litCount: number;
  unlitCount: number;
  unknownCount: number;
  unknownZeroCandidates: number;
  unknownLowRealData: number;
  skippedNoComposition: number;
  writesApplied: number;
  hasSegments: boolean;
  coverages: number[];
  logEntries: LogEntry[];
}

/**
 * Processes ONE bounded, cursor-ordered slice of a city's official_routes —
 * the core chunking unit both the CLI's full-city loop and the API route's
 * single-HTTP-call handler share. Ordered by FieldPath.documentId() (stable,
 * index-free even combined with the `city in [...]` filter — confirmed live,
 * not assumed) so repeated calls with an advancing cursor partition the
 * city's routes exactly once each, in a fixed order, regardless of how many
 * chunks it takes.
 */
export async function runBackfillRouteLightingChunk(opts: LightingChunkOptions): Promise<LightingChunkResult> {
  const { db } = opts;
  const CITY_ALIASES = opts.cityAliases;
  const APPLY = opts.apply;
  const CHUNK_SIZE = opts.chunkSize ?? DEFAULT_LIGHTING_CHUNK_SIZE;
  const { buildValidatedDoc } = await import('../src/lib/route-collections');

  const authoritySnap = await db.collection('authorities').get();
  const knownAuthorityIds = new Set(authoritySnap.docs.map((d) => d.id));

  const totalSnap = await db.collection('official_routes').where('city', 'in', CITY_ALIASES).count().get();
  const totalRoutesInCity = totalSnap.data().count;

  let q = db.collection('official_routes')
    .where('city', 'in', CITY_ALIASES)
    .orderBy(admin.firestore.FieldPath.documentId())
    .limit(CHUNK_SIZE);
  if (opts.cursorId) q = q.startAfter(opts.cursorId);
  const chunkSnap = await q.get();

  // Cheap per-city short-circuit (04.09.2026, lighting-step 504 fix): a
  // virgin city with no street_segments at all can't produce lighting data
  // no matter how many routes it has, so skip computeRouteLighting's query
  // loop entirely for every route in THIS chunk. Re-checked per chunk
  // (stateless across HTTP calls) — a single limit(1) existence check, cost
  // is negligible next to the per-route query loop it replaces.
  const hasSegments = await cityHasAnySegments(db, CITY_ALIASES);

  const logEntries: LogEntry[] = [];
  const toWrite: Array<{ ref: FirebaseFirestore.DocumentReference; validated: Record<string, unknown> }> = [];
  let skippedNoComposition = 0;
  let litCount = 0, unlitCount = 0, unknownCount = 0;
  let unknownZeroCandidates = 0, unknownLowRealData = 0;
  const coverages: number[] = [];

  for (const doc of chunkSnap.docs) {
    const data = doc.data();
    const rawPath = Array.isArray(data.path) ? data.path : [];
    const result = hasSegments
      ? await computeRouteLighting(db, rawPath, CITY_ALIASES)
      : { status: 'unknown' as const, litCoveragePct: null, isLit: null, candidateSegmentsFound: 0, samplePointCount: 0, realDataPointFraction: 0 };

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

  let writesApplied = 0;
  if (APPLY && toWrite.length > 0) {
    // Chunk size is well under Firestore's 500-op batch limit — one batch per chunk.
    const batch = db.batch();
    toWrite.forEach(({ ref, validated }) => batch.update(ref, validated));
    await batch.commit();
    writesApplied = toWrite.length;
  }

  const done = chunkSnap.size < CHUNK_SIZE;
  const lastDoc = chunkSnap.docs[chunkSnap.docs.length - 1];
  return {
    routesProcessedThisChunk: chunkSnap.size,
    totalRoutesInCity,
    chunkSize: CHUNK_SIZE,
    cursorId: done ? null : (lastDoc?.id ?? null),
    done,
    litCount, unlitCount, unknownCount,
    unknownZeroCandidates, unknownLowRealData,
    skippedNoComposition,
    writesApplied,
    hasSegments,
    coverages,
    logEntries,
  };
}

export interface BackfillRouteLightingOptions {
  /** Comma-separated in the CLI; pass an array of aliases directly here
   *  (e.g. the two-spelling case) — see the header note above. */
  cityAliases: string[];
  /** Filename tag for the reversible log, defaults to the first alias. */
  cityLabel?: string;
  apply: boolean;
  db: admin.firestore.Firestore;
}

export interface BackfillRouteLightingResult {
  routesProcessed: number;
  litCount: number;
  unlitCount: number;
  unknownCount: number;
  skippedNoComposition: number;
  writesApplied: number;
  logPath: string;
}

/**
 * Full-city, single-process wrapper — drains runBackfillRouteLightingChunk()
 * in a loop until done, aggregating every chunk's counts/log entries into
 * one final result + one reversible log file, exactly matching this
 * function's pre-chunking behavior byte-for-byte (verified via a dry-run
 * before/after: same final counts, same log shape). Has no maxDuration
 * concern (bare CLI process), so it simply runs every chunk back-to-back.
 */
export async function runBackfillRouteLighting(opts: BackfillRouteLightingOptions): Promise<BackfillRouteLightingResult> {
  const { db } = opts;
  const CITY_ALIASES = opts.cityAliases;
  const CITY_LABEL = opts.cityLabel ?? CITY_ALIASES[0] ?? 'city';
  const APPLY = opts.apply;
  console.log(`=== ${CITY_ALIASES.join('/')} lighting backfill — ${APPLY ? '🔴 APPLY (real write)' : '🟢 DRY-RUN (no writes)'} ===\n`);

  let cursorId: string | null | undefined = undefined;
  let totalRoutesInCity = 0;
  let routesProcessed = 0;
  let litCount = 0, unlitCount = 0, unknownCount = 0, skippedNoComposition = 0, writesApplied = 0;
  let unknownZeroCandidates = 0, unknownLowRealData = 0;
  const coverages: number[] = [];
  const allLogEntries: LogEntry[] = [];
  let chunkNum = 0;
  let hasSegments = true;

  for (;;) {
    chunkNum++;
    const chunk = await runBackfillRouteLightingChunk({ cityAliases: CITY_ALIASES, apply: APPLY, db, cursorId });
    totalRoutesInCity = chunk.totalRoutesInCity;
    hasSegments = chunk.hasSegments;
    routesProcessed += chunk.routesProcessedThisChunk;
    litCount += chunk.litCount; unlitCount += chunk.unlitCount; unknownCount += chunk.unknownCount;
    unknownZeroCandidates += chunk.unknownZeroCandidates; unknownLowRealData += chunk.unknownLowRealData;
    skippedNoComposition += chunk.skippedNoComposition;
    writesApplied += chunk.writesApplied;
    coverages.push(...chunk.coverages);
    allLogEntries.push(...chunk.logEntries);
    console.log(`  — chunk ${chunkNum}: ${chunk.routesProcessedThisChunk} route(s) (${routesProcessed}/${totalRoutesInCity} total)`);
    if (chunk.done) break;
    cursorId = chunk.cursorId;
  }

  if (!hasSegments) {
    console.log(`\n⚠ 0 street_segments found for ${CITY_ALIASES.join('/')} — every route's query loop was short-circuited, all marked 'unknown'.`);
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

  console.log(`\n=== ${APPLY ? 'Writing' : 'Would write'} ${writesApplied || (routesProcessed - skippedNoComposition)} doc(s) (lighting only, composition preserved unchanged) ===`);

  const outDir = path.join(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const logPath = path.join(outDir, `${CITY_LABEL}-lighting-backfill-log-${APPLY ? 'apply' : 'dryrun'}-${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify({ generatedAt: new Date().toISOString(), applied: APPLY, entries: allLogEntries }, null, 2));
  console.log(`Reversible before/after log written to: ${logPath}`);

  if (!APPLY) {
    console.log('\n🟢 DRY-RUN complete — no writes made. Re-run with --apply to write for real.');
  } else {
    console.log(`\n✅ Applied qualitySignals.lighting to ${writesApplied} route(s).`);
  }

  return { routesProcessed, litCount, unlitCount, unknownCount, skippedNoComposition, writesApplied, logPath };
}

// ── CLI entry point — thin wrapper, zero behavior change ──────────────────
if (require.main === module) {
  const APPLY = process.argv.includes('--apply');
  const argValue = (flag: string): string | undefined => {
    const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
    return arg ? arg.slice(flag.length + 3) : undefined;
  };
  // City parameterization — defaults preserve today's exact Haifa behavior.
  const CITY_ALIASES = (argValue('city') ?? 'חיפה').split(',').map((s) => s.trim()).filter(Boolean);
  const CITY_LABEL = argValue('label') ?? 'haifa';

  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  const db = admin.firestore();

  runBackfillRouteLighting({ cityAliases: CITY_ALIASES, cityLabel: CITY_LABEL, apply: APPLY, db })
    .then(() => process.exit(0))
    .catch((e) => { console.error('FATAL:', e); process.exit(1); });
}
