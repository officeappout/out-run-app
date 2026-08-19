/**
 * import-osm-segments.ts
 *
 * Imports OSM highway segments inside a bounding box, scores each one
 * 0–10, and (optionally) writes them to the `street_segments` Firestore
 * collection.
 *
 * Two modes:
 *   --dry-run   Fetch + score + print histogram. NO Firestore writes.
 *   --commit    Same as dry-run, then writes via the Admin SDK.
 *
 * Auth history (19.08.2026, full city-mapping build): --commit used to
 * write via a raw Firestore REST call authenticated with a browser-obtained
 * FIREBASE_ID_TOKEN — the ONLY script in this whole pipeline that needed a
 * live admin browser session rather than the standard FIREBASE_SERVICE_
 * ACCOUNT_KEY every other script uses. Investigated before converting:
 * the code's own comment stated the real reason was pure historical
 * convenience ("the client SDK can't auth from a bare Node process, so REST
 * is the simplest path that doesn't require a service account file") — NOT
 * a security-rule requirement (Admin SDK writes bypass Firestore rules
 * entirely, same as every other script here already does) and NOT audit
 * attribution (no createdBy/importedBy UID field exists anywhere in the
 * written doc). No hard reason found — converted to Admin SDK, matching
 * every other script's `write-climb-segments-tlv.ts`/
 * `extract-osm-amenities-tlv.ts`-style init. This also fixes a real,
 * separate gap this file always had: unlike every other script here, it
 * never self-loaded `.env.local` (it depended on being invoked via
 * `node --env-file=.env.local ...`, a different convention than every
 * other script's own `dotenv.config()` self-load + plain `npx tsx <script>`
 * invocation) — orchestrators like map-city.ts invoke every step the
 * second way, so this was a real, if previously unexercised, gap.
 *
 * NOT chokepoint-validated (known gap, flagged not fixed — surface-type
 * phase of the route-enrichment-pipeline plan): unlike
 * commitSegmentsToFirestore (osm-segment-importer.ts, the admin UI's
 * client-SDK writer), this Admin-SDK --commit path does NOT call
 * buildValidatedDoc before writing. Restructuring it to validate a plain
 * ScoredSegment object before writing is a real, doable fix — just a
 * bigger lift than this conversion's scope (auth mechanism only, same doc
 * shape as before, not a new validation layer). buildSegmentDoc below
 * is kept in sync field-by-field with ScoredSegment manually instead (see
 * inclinePct's and surfaceType's comments) — same "explicit field list can
 * silently drop a new field" risk the chokepoint exists to close for every
 * OTHER migrated writer, just not closed here yet.
 *
 * ── Required args ─────────────────────────────────────────────────────────
 *   --city <string>          City name (Hebrew OK, will be wrapped in quotes)
 *   --authority <string>     Authority document id (or a placeholder)
 *   --south <number>         BBox south latitude
 *   --west  <number>         BBox west longitude
 *   --north <number>         BBox north latitude
 *   --east  <number>         BBox east longitude
 *
 * ── Optional args ─────────────────────────────────────────────────────────
 *   --min-score <number>     Drop segments below this score (default 3)
 *   --min-nodes <number>     Drop segments with fewer than N nodes (default 3)
 *   --arterial                Fetch primary|secondary instead of the default
 *                              calm-street set (footway/cycleway/path/
 *                              pedestrian/residential/living_street/tertiary).
 *                              Separate pass, not merged — re-run without
 *                              this flag to keep importing calm streets.
 *
 * ── Prerequisites (only required for --commit) ─────────────────────────────
 *   FIREBASE_SERVICE_ACCOUNT_KEY set in .env.local — same credential every
 *   other script in this pipeline already uses. No browser session, no ID
 *   token, no `--env-file` invocation needed.
 *
 * ── Run ───────────────────────────────────────────────────────────────────
 *   # Dry run for Tel Aviv (no Firestore writes)
 *   npx tsx src/scripts/import-osm-segments.ts \
 *     --city "תל אביב" --authority placeholder_tlv \
 *     --south 32.04 --west 34.75 --north 32.10 --east 34.82 \
 *     --dry-run
 *
 *   # Commit run
 *   npx tsx src/scripts/import-osm-segments.ts \
 *     --city "תל אביב" --authority placeholder_tlv \
 *     --south 32.04 --west 34.75 --north 32.10 --east 34.82 \
 *     --commit
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as admin from 'firebase-admin';
import {
  fetchOsmSegments,
  processSegments,
  ARTERIAL_HIGHWAY_TYPES,
  type ScoredSegment,
  type ImportOptions,
  type ProgressFn,
} from '../features/admin/services/osm-segment-importer';

const FIRESTORE_BATCH_SIZE = 500;

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

// ── argv parsing ──────────────────────────────────────────────────────────
type CliArgs = {
  city: string;
  authority: string;
  bbox: { south: number; west: number; north: number; east: number };
  dryRun: boolean;
  commit: boolean;
  minScore?: number;
  minNodes?: number;
  arterial: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    if (i === -1 || i === argv.length - 1) return undefined;
    return argv[i + 1];
  };

  const num = (flag: string): number | undefined => {
    const v = get(flag);
    if (v === undefined) return undefined;
    const n = Number(v);
    if (Number.isNaN(n)) {
      throw new Error(`${flag} must be a number, got "${v}"`);
    }
    return n;
  };

  const required = (flag: string, value: string | number | undefined): string | number => {
    if (value === undefined || value === '' || value === null) {
      throw new Error(`Missing required argument: ${flag}`);
    }
    return value;
  };

  const dryRun = argv.includes('--dry-run');
  const commit = argv.includes('--commit');
  if (dryRun === commit) {
    throw new Error('Pass exactly one of --dry-run or --commit.');
  }

  const city = String(required('--city', get('--city')));
  const authority = String(required('--authority', get('--authority')));
  const south = required('--south', num('--south')) as number;
  const west = required('--west', num('--west')) as number;
  const north = required('--north', num('--north')) as number;
  const east = required('--east', num('--east')) as number;

  if (south >= north) throw new Error('--south must be less than --north');
  if (west >= east) throw new Error('--west must be less than --east');

  return {
    city,
    authority,
    bbox: { south, west, north, east },
    dryRun,
    commit,
    minScore: num('--min-score'),
    minNodes: num('--min-nodes'),
    arterial: argv.includes('--arterial'),
  };
}

// ── Admin SDK commit helper ───────────────────────────────────────────────
// Doc id + field shape kept byte-identical to the REST path this replaced —
// same collection (street_segments), same `osm_${osmId}` doc id scheme,
// same 12 fields. Admin SDK's plain-object .set() handles nested
// objects/arrays/null/Date natively, so there's no manual wire-format
// encoding step anymore (that was purely a REST-API requirement).

function buildSegmentDoc(
  seg: ScoredSegment,
  importedAt: Date,
): Record<string, unknown> {
  return {
    osmId: seg.osmId,
    cityName: seg.cityName,
    authorityId: seg.authorityId,
    score: seg.score,
    flowScore: seg.flowScore,
    // Forced to an integer, matching the REST path's forced integerValue
    // encoding for this field exactly (score/flowScore kept their natural
    // fractional type, same as before).
    lengthMeters: Math.round(seg.lengthMeters),
    importedAt,
    midpoint: seg.midpoint,
    path: seg.path,
    tags: seg.tags,
    geohash: seg.geohash,
    // Explicit null (not omitted) when absent — Firestore rejects
    // `undefined` outright but stores `null` as a queryable field; same
    // reasoning ScoredSegment.inclinePct's own doc comment already states.
    // Stage 1A: without this line, this explicit-field-list writer would
    // silently drop the field (unlike commitSegmentsToFirestore's
    // spread-based write) — exactly the class of bug this pipeline exists
    // to close.
    inclinePct: seg.inclinePct ?? null,
    // Always a real string (mapOsmSurfaceToType never returns undefined),
    // no null-coalescing needed — same as the REST path.
    surfaceType: seg.surfaceType,
  };
}

async function commitViaAdminSdk(
  db: admin.firestore.Firestore,
  segments: ScoredSegment[],
  log: ProgressFn,
): Promise<number> {
  const importedAt = new Date();
  const col = db.collection('street_segments');
  let written = 0;

  for (let i = 0; i < segments.length; i += FIRESTORE_BATCH_SIZE) {
    const slice = segments.slice(i, i + FIRESTORE_BATCH_SIZE);
    const batch = db.batch();
    for (const seg of slice) {
      batch.set(col.doc(`osm_${seg.osmId}`), buildSegmentDoc(seg, importedAt));
    }
    await batch.commit();

    written += slice.length;
    log(
      `  Committed batch ${Math.floor(i / FIRESTORE_BATCH_SIZE) + 1} — ${written}/${segments.length} written.`,
    );
  }

  return written;
}

// ── Main ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let args: CliArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`Argument error: ${(err as Error).message}\n`);
    console.error(
      'Usage:\n' +
        '  npx tsx src/scripts/import-osm-segments.ts \\\n' +
        '    --city "תל אביב" --authority placeholder_tlv \\\n' +
        '    --south 32.04 --west 34.75 --north 32.10 --east 34.82 \\\n' +
        '    --dry-run | --commit',
    );
    process.exit(1);
  }

  const log: ProgressFn = (msg) => console.log(`  ${msg}`);

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  OSM Segment Import — ${args.commit ? 'COMMIT' : 'DRY RUN'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  City:      ${args.city}`);
  console.log(`  Authority: ${args.authority}`);
  console.log(
    `  BBox:      S=${args.bbox.south}, W=${args.bbox.west}, N=${args.bbox.north}, E=${args.bbox.east}`,
  );
  console.log(`  Min score: ${args.minScore ?? 3}`);
  console.log(
    `  Highways:  ${args.arterial ? `ARTERIAL (${ARTERIAL_HIGHWAY_TYPES.join('|')})` : 'default (calm streets)'}`,
  );
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const opts: ImportOptions = {
    bbox: args.bbox,
    cityName: args.city,
    authorityId: args.authority,
    minScore: args.minScore,
    minNodes: args.minNodes,
    highwayTypes: args.arterial ? ARTERIAL_HIGHWAY_TYPES : undefined,
  };

  // 1. Fetch
  const ways = await fetchOsmSegments(opts.bbox, log, opts.highwayTypes);

  // 2. Score + filter
  const { segments, histogram, skippedTooShort, skippedLowScore } =
    processSegments(ways, opts, log);

  // 3. Report
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Results');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  OSM ways fetched:           ${ways.length}`);
  console.log(`  Skipped (too short / bad):  ${skippedTooShort}`);
  console.log(`  Skipped (score < ${args.minScore ?? 3}):       ${skippedLowScore}`);
  console.log(`  Kept (passed filter):       ${segments.length}`);
  console.log('  ─── Score histogram (calm-street rubric) ─');
  console.log(`    3-4:  ${histogram.bucket3to4}`);
  console.log(`    5-6:  ${histogram.bucket5to6}`);
  console.log(`    7-8:  ${histogram.bucket7to8}`);
  console.log(`    9-10: ${histogram.bucket9to10}`);
  if (args.arterial) {
    const byHighway: Record<string, number> = {};
    let flowSum = 0;
    for (const s of segments) {
      byHighway[s.tags.highway] = (byHighway[s.tags.highway] ?? 0) + 1;
      flowSum += s.flowScore;
    }
    console.log('  ─── Arterial highway-type breakdown ──────');
    for (const [hw, n] of Object.entries(byHighway).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${hw}: ${n}`);
    }
    console.log(
      `    avg flowScore: ${segments.length > 0 ? (flowSum / segments.length).toFixed(2) : 'n/a'}`,
    );
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 4. (optional) Commit
  if (args.commit) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      console.error(
        '\nFIREBASE_SERVICE_ACCOUNT_KEY is not set in .env.local. See prerequisites at the top of this file.',
      );
      process.exit(1);
    }
    const db = initFb();
    console.log(
      `\nCommitting ${segments.length} segments (${FIRESTORE_BATCH_SIZE}/batch)…`,
    );
    const n = await commitViaAdminSdk(db, segments, log);
    console.log(`\nDone — ${n} documents written to street_segments.`);
  } else {
    console.log('\nDRY RUN — no Firestore writes performed.');
  }
}

main().catch((err) => {
  console.error('\nFatal:', err);
  process.exit(1);
});
