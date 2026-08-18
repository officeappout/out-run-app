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
 * TODAY: TLV only (CITY_CONFIGS has exactly one entry), matching every
 * underlying script's own current scope — see
 * .claude/knowledge/autonomous-city-mapping-audit.md Gap #5 ("Region
 * hardcoding … single-city hardcoded"). Adding a real second city needs
 * BOTH a new CITY_CONFIGS entry here AND generalizing each currently-
 * TLV-hardcoded backfill script (populate-route-elevation-tlv.ts,
 * backfill-route-lit-tag-tlv.ts, backfill-route-enrichment-tlv.ts,
 * extract-osm-amenities-tlv.ts all read a literal TLV_CITY/hardcoded bbox
 * internally, not a CLI arg) — that generalization is separate, larger
 * work, not done as part of this orchestrator. Only the street-segment
 * import step (calm + arterial) is already bbox/city-parameterized today.
 *
 * Garden-proximity dedup backfill (backfill-parks-geohash.ts) is
 * deliberately NOT a step here — `parks` is admin-curated, global
 * content, not something re-discovered per city-mapping run (and the
 * amenity-extraction dedup gate brute-forces the check today regardless,
 * so it isn't even a hard prerequisite — see extract-osm-amenities-tlv.ts's
 * own header).
 *
 * Usage:
 *   DRY RUN (default — every step dry-run, zero writes anywhere):
 *     npx tsx scripts/map-city.ts --city=tlv
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
  /** Extra args always passed (bbox/city/authority for the bbox-driven
   *  street-segment step; empty for every TLV-hardcoded script). */
  baseArgs: string[];
  writeFlagStyle: WriteFlagStyle;
  /** Street-segment import requires exactly one of --dry-run/--commit
   *  (mutually exclusive, unlike every --apply-style script's implicit
   *  dry-run-when-omitted default) — this flag controls that quirk. */
  requiresExplicitDryRunFlag?: boolean;
}

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
    baseArgs: [],
    writeFlagStyle: 'apply',
  },
  {
    label: 'Lit-tag rollup (night_lighting auto-suggest)',
    script: 'scripts/backfill-route-lit-tag-tlv.ts',
    baseArgs: [],
    writeFlagStyle: 'apply',
  },
  {
    label: 'Route-enrichment join (climb ↔ route/segment)',
    script: 'scripts/backfill-route-enrichment-tlv.ts',
    baseArgs: [],
    writeFlagStyle: 'apply',
  },
  {
    label: 'Amenity extraction (courts/benches/drinking-water/fitness-stations)',
    script: 'scripts/extract-osm-amenities-tlv.ts',
    baseArgs: [],
    writeFlagStyle: 'apply',
  },
  {
    label: 'Route-adjacency recompute',
    script: 'scripts/backfill-route-adjacency.ts',
    baseArgs: [],
    writeFlagStyle: 'commit',
  },
];

function runStep(step: Step, index: number, total: number): void {
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

  execFileSync('npx', ['tsx', step.script, ...args], { stdio: 'inherit' });
}

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log(`║  Map City Pipeline — ${config.cityName.padEnd(20)} [${(isApply ? 'APPLY' : 'DRY-RUN').padEnd(7)}] ║`);
  console.log('╚══════════════════════════════════════════════════════════╝');

  if (isApply) {
    console.log('\n⚠️  APPLY mode — every step below WILL write to production Firestore.');
    console.log('   This is a hard-stop action. Confirm this was explicitly approved,');
    console.log('   step by step, before running with --apply.\n');
  } else {
    console.log('\n✅  DRY-RUN mode — every step is read-only. No Firestore writes.\n');
  }

  for (let i = 0; i < steps.length; i++) {
    runStep(steps[i], i, steps.length);
  }

  console.log('\n' + '═'.repeat(70));
  console.log(`  Pipeline complete for ${config.cityName} (${steps.length} steps, ${isApply ? 'APPLY' : 'DRY-RUN'}).`);
  console.log('═'.repeat(70));
}

main().catch((err) => {
  console.error('\n❌  Pipeline step failed:', err?.message ?? err);
  process.exit(1);
});
