/**
 * scripts/map-city.ts — per-city mapping pipeline orchestrator.
 *
 * Sequences every import/backfill step a city goes through when it's
 * "mapped": street segments (calm-street pass, then the arterial
 * primary|secondary pass — road-hierarchy flowScore, runner-flow
 * investigation Tier 1, 19.08.2026), DEM elevation, lit-tag rollup,
 * climb↔route/segment enrichment join, amenity extraction, and a final
 * route-adjacency recompute. This is the concrete "scripts-and-moderation
 * workflow" the route-enrichment-pipeline merge (20899b56) was staged for
 * — city-mapping stops being a manually-remembered sequence of separate
 * `npx tsx scripts/…` invocations and becomes one ordered pipeline.
 *
 * Each step is DRY-RUN by default (every underlying script already
 * defaults to dry-run on its own — this orchestrator does not change
 * that). --apply cascades the equivalent write-flag to every step
 * (--apply for the 4 --apply-style scripts, --commit for the 2 scripts
 * that use that older convention: street-segment import and route-
 * adjacency) — a genuine, deliberate hard-stop. This orchestrator does
 * not gate --apply itself; the discipline is procedural (David's
 * explicit go per the route-enrichment-pipeline plan's "Consolidated
 * Destructive/Irreversible-Step Register"), same as every other backfill
 * script in this plan.
 *
 * City-parameterization (19.08.2026, first real second-city run — Haifa):
 * all 4 previously-TLV-hardcoded backfill scripts (populate-route-
 * elevation-tlv.ts, backfill-route-lit-tag-tlv.ts, backfill-route-
 * enrichment-tlv.ts, extract-osm-amenities-tlv.ts) now accept a
 * `--city <name>` override, space-separated (defaults to the original TLV
 * literal when omitted — byte-identical for any direct invocation that
 * doesn't pass it). extract-osm-amenities-tlv.ts also accepts
 * `--bbox <s,w,n,e>` (also space-separated — not `--flag=value`, a real
 * bug found+fixed this run: the scripts were first written expecting
 * `=`-joined args while this orchestrator always passes space-separated
 * ones, silently falling back to the TLV default every time) — it
 * derives its extraction bbox from EXISTING official_routes geometry by
 * default (fine for TLV), but a brand-new city has none yet, so this
 * orchestrator passes CITY_CONFIGS' own bbox explicitly as a fallback
 * that skips the route-geometry derivation entirely. The other 3 scripts
 * degrade gracefully to "0 routes found, nothing to do" on a city with no
 * existing official_routes — a real, valid, reportable result for a
 * first-ever run, not an error.
 *
 * Script filenames themselves stay TLV-suffixed (not renamed) — only the
 * internal hardcoded constant was generalized; renaming 4 files is out of
 * scope for this change and would touch every existing reference to them.
 *
 * Garden-proximity dedup backfill (backfill-parks-geohash.ts) is
 * deliberately NOT a step here — `parks` is admin-curated, global
 * content, not something re-discovered per city-mapping run (and the
 * amenity-extraction dedup gate brute-forces the check today regardless,
 * so it isn't even a hard prerequisite — see extract-osm-amenities-tlv.ts's
 * own header).
 *
 * Usage:
 *   DRY RUN (default — every step dry-run, zero writes anywhere; prints
 *   per-step counts AND per-step wall-clock timing):
 *     npx tsx scripts/map-city.ts --city=tlv
 *     npx tsx scripts/map-city.ts --city=haifa
 *
 *   APPLY (cascades --apply/--commit to EVERY step — HARD STOP. Each
 *   underlying script still prints its own report; nothing here skips
 *   that. Do not run this without explicit per-step review, same
 *   discipline as running any of the underlying scripts directly):
 *     npx tsx scripts/map-city.ts --city=tlv --apply
 *
 * Prerequisites: same as every step it wraps — FIREBASE_SERVICE_ACCOUNT_KEY
 * (all steps except street-segment import), FIREBASE_ID_TOKEN (only needed
 * for the street-segment import step's --commit — a REST-API/ID-token auth
 * path, different from every other step's Admin-SDK service-account path;
 * not needed for that step's own --dry-run), NEXT_PUBLIC_MAPBOX_TOKEN
 * (street segments, DEM elevation, amenity dedup's Overpass-adjacent calls).
 */

import { execFileSync } from 'child_process';

interface CityConfig {
  cityName: string;
  authorityId: string;
  bbox: { south: number; west: number; north: number; east: number };
  /** True when this bbox is derived from the authority's registered point
   *  coordinate + an estimated margin, NOT from real route/segment
   *  geometry (which doesn't exist yet for a brand-new city). Surfaced in
   *  the run banner so an authority-coordinate estimate is never mistaken
   *  for TLV's own route-geometry-precise bbox. */
  bboxIsEstimated?: boolean;
}

// Bbox/authorityId already established+verified live this session
// (populate-route-elevation-tlv.ts's own derived-from-real-route-geometry
// bbox; t9hiRkDnJtgZESlNCBp8 is TLV's real authorities doc id, already used
// by scripts/import-neighborhoods-tel-aviv-reconcile.ts) — not guessed.
const CITY_CONFIGS: Record<string, CityConfig> = {
  tlv: {
    cityName: 'תל אביב-יפו',
    authorityId: 't9hiRkDnJtgZESlNCBp8',
    bbox: { south: 32.0319, west: 34.7418, north: 32.1421, east: 34.828 },
  },
  // Haifa (19.08.2026, first real second-city dry-run): authorityId +
  // center coordinate read directly from the live `authorities` doc
  // (id=9ZdWFmlkP0njOyFPceEw, name="חיפה", coordinates={lat:32.794,
  // lng:34.9896}) — real, not guessed. UNLIKE tlv's bbox above, Haifa has
  // zero existing official_routes/street_segments to derive a precise bbox
  // from (verified live — 0 official_routes, 0 curated_routes, 0
  // street_segments, 0 climb_segments for city="חיפה"; 31 existing `parks`
  // docs do match, useful for the amenity-dedup gate), so this bbox is an
  // ESTIMATED ±0.06°/±0.06° box around the authority's center point
  // (~13km span, roughly matching TLV's own route-derived bbox scale) —
  // flagged via bboxIsEstimated, not asserted as route-precise. Also note:
  // this authority's own doc has `status:'inactive'`, `isActiveClient:
  // false` — this dry-run is purely a geo-data pipeline test, not a signal
  // Haifa is going live as a paying city (axioms.md §6 — isActiveClient
  // untouched either way, this pipeline never writes to it).
  haifa: {
    cityName: 'חיפה',
    authorityId: '9ZdWFmlkP0njOyFPceEw',
    bbox: { south: 32.734, west: 34.9296, north: 32.854, east: 35.0496 },
    bboxIsEstimated: true,
  },
};

const isApply = process.argv.includes('--apply');
const cityKey = process.argv.find((a) => a.startsWith('--city='))?.split('=')[1] ?? 'tlv';
const config = CITY_CONFIGS[cityKey];

if (!config) {
  console.error(`❌  Unknown --city="${cityKey}". Known cities: ${Object.keys(CITY_CONFIGS).join(', ')}`);
  process.exit(1);
}

type WriteFlagStyle = 'apply' | 'commit';

interface Step {
  label: string;
  script: string;
  baseArgs: string[];
  writeFlagStyle: WriteFlagStyle;
  /** Street-segment import requires exactly one of --dry-run/--commit
   *  (mutually exclusive, unlike every --apply-style script's implicit
   *  dry-run-when-omitted default) — this flag controls that quirk. */
  requiresExplicitDryRunFlag?: boolean;
}

const bboxArg = `${config.bbox.south},${config.bbox.west},${config.bbox.north},${config.bbox.east}`;

const steps: Step[] = [
  {
    label: 'Street segments — calm-street pass',
    script: 'src/scripts/import-osm-segments.ts',
    baseArgs: [
      '--city', config.cityName,
      '--authority', config.authorityId,
      '--south', String(config.bbox.south),
      '--west', String(config.bbox.west),
      '--north', String(config.bbox.north),
      '--east', String(config.bbox.east),
    ],
    writeFlagStyle: 'commit',
    requiresExplicitDryRunFlag: true,
  },
  {
    label: 'Street segments — arterial pass (primary|secondary, flowScore)',
    script: 'src/scripts/import-osm-segments.ts',
    baseArgs: [
      '--city', config.cityName,
      '--authority', config.authorityId,
      '--south', String(config.bbox.south),
      '--west', String(config.bbox.west),
      '--north', String(config.bbox.north),
      '--east', String(config.bbox.east),
      '--arterial',
    ],
    writeFlagStyle: 'commit',
    requiresExplicitDryRunFlag: true,
  },
  {
    label: 'DEM elevation (route difficulty)',
    script: 'scripts/populate-route-elevation-tlv.ts',
    // No --bbox needed: this script derives its own bbox from existing
    // official_routes and gracefully no-ops ("nothing to do") when there
    // are none yet — nothing to fall back to since there's no route data
    // to sample DEM elevation FOR regardless of bbox.
    baseArgs: ['--city', config.cityName],
    writeFlagStyle: 'apply',
  },
  {
    label: 'Lit-tag rollup (night_lighting auto-suggest)',
    script: 'scripts/backfill-route-lit-tag-tlv.ts',
    baseArgs: ['--city', config.cityName],
    writeFlagStyle: 'apply',
  },
  {
    label: 'Route-enrichment join (climb ↔ route/segment)',
    script: 'scripts/backfill-route-enrichment-tlv.ts',
    baseArgs: ['--city', config.cityName],
    writeFlagStyle: 'apply',
  },
  {
    label: 'Amenity extraction (courts/benches/drinking-water/fitness-stations)',
    script: 'scripts/extract-osm-amenities-tlv.ts',
    // --bbox is REQUIRED here for a city with no existing official_routes
    // (the script hard-fails without a route-geometry-derived bbox
    // otherwise) — always passed explicitly so this orchestrator works
    // identically for a brand-new city and an established one.
    baseArgs: ['--city', config.cityName, '--bbox', bboxArg],
    writeFlagStyle: 'apply',
  },
  {
    label: 'Route-adjacency recompute',
    script: 'scripts/backfill-route-adjacency.ts',
    // City-agnostic by design — processes ALL cities' official_routes in
    // one pass (see its own dry-run output's per-city breakdown). No
    // --city arg exists or is needed; included as the pipeline's last step
    // since it's the one place a newly-mapped city's routes (once curated)
    // would show up.
    baseArgs: [],
    writeFlagStyle: 'commit',
  },
];

interface StepResult {
  label: string;
  durationMs: number;
  exitCode: number;
}

function runStep(step: Step, index: number, total: number): StepResult {
  const args = [...step.baseArgs];
  if (isApply) {
    args.push(step.writeFlagStyle === 'apply' ? '--apply' : '--commit');
  } else if (step.requiresExplicitDryRunFlag) {
    args.push('--dry-run');
  }

  console.log('\n' + '━'.repeat(70));
  console.log(`  [${index + 1}/${total}] ${step.label}`);
  console.log(`  ${isApply ? '⚠️  APPLY' : 'DRY-RUN'} — npx tsx ${step.script} ${args.join(' ')}`);
  console.log('━'.repeat(70));

  const startedAt = Date.now();
  let exitCode = 0;
  try {
    execFileSync('npx', ['tsx', step.script, ...args], { stdio: 'inherit' });
  } catch (err: any) {
    exitCode = typeof err?.status === 'number' ? err.status : 1;
    throw err;
  } finally {
    const durationMs = Date.now() - startedAt;
    console.log(`  ⏱  ${step.label}: ${(durationMs / 1000).toFixed(1)}s`);
  }
  return { label: step.label, durationMs: Date.now() - startedAt, exitCode };
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Map City Pipeline — ${config.cityName.padEnd(20)} [${(isApply ? 'APPLY' : 'DRY-RUN').padEnd(7)}] ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`\n  City:      ${config.cityName}`);
  console.log(`  Authority: ${config.authorityId}`);
  console.log(`  BBox:      S=${config.bbox.south} W=${config.bbox.west} N=${config.bbox.north} E=${config.bbox.east}${config.bboxIsEstimated ? '  (⚠️  ESTIMATED — no existing route geometry to derive it from)' : ''}`);

  if (isApply) {
    console.log('\n⚠️  APPLY mode — every step below WILL write to production Firestore.');
    console.log('   This is a hard-stop action. Confirm this was explicitly approved,');
    console.log('   step by step, before running with --apply.\n');
  } else {
    console.log('\n✅  DRY-RUN mode — every step is read-only. No Firestore writes.\n');
  }

  const results: StepResult[] = [];
  const pipelineStartedAt = Date.now();
  for (let i = 0; i < steps.length; i++) {
    results.push(runStep(steps[i], i, steps.length));
  }
  const totalDurationMs = Date.now() - pipelineStartedAt;

  console.log('\n' + '═'.repeat(70));
  console.log(`  Pipeline complete for ${config.cityName} (${steps.length} steps, ${isApply ? 'APPLY' : 'DRY-RUN'}).`);
  console.log('═'.repeat(70));
  console.log('  Per-step timing:');
  for (const r of results) {
    console.log(`    ${(r.durationMs / 1000).toFixed(1).padStart(7)}s   ${r.label}`);
  }
  console.log(`    ${'─'.repeat(9)}`);
  console.log(`    ${(totalDurationMs / 1000).toFixed(1).padStart(7)}s   TOTAL`);
}

main().catch((err) => {
  console.error('\n❌  Pipeline step failed:', err?.message ?? err);
  process.exit(1);
});
