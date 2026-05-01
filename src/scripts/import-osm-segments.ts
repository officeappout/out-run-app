/**
 * import-osm-segments.ts
 *
 * Imports OSM highway segments inside a bounding box, scores each one
 * 0–10, and (optionally) writes them to the `street_segments` Firestore
 * collection.
 *
 * Two modes:
 *   --dry-run   Fetch + score + print histogram. NO Firestore writes.
 *   --commit    Same as dry-run, then writes via Firestore REST API.
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
 *
 * ── How to get your ID token (only required for --commit) ─────────────────
 *   1. Open the app in Chrome while logged in as admin.
 *   2. DevTools → Console:
 *        const { getAuth } = await import('firebase/auth');
 *        copy(await getAuth().currentUser.getIdToken(true));
 *   3. Add to .env.local:  FIREBASE_ID_TOKEN=<paste here>
 *
 * ── Run ───────────────────────────────────────────────────────────────────
 *   # Dry run for Tel Aviv (no Firestore writes, no token needed)
 *   npx tsx src/scripts/import-osm-segments.ts \
 *     --city "תל אביב" --authority placeholder_tlv \
 *     --south 32.04 --west 34.75 --north 32.10 --east 34.82 \
 *     --dry-run
 *
 *   # Commit run (requires FIREBASE_ID_TOKEN)
 *   node --env-file=.env.local ./node_modules/.bin/tsx \
 *     src/scripts/import-osm-segments.ts \
 *     --city "תל אביב" --authority placeholder_tlv \
 *     --south 32.04 --west 34.75 --north 32.10 --east 34.82 \
 *     --commit
 */

import * as https from 'https';
import {
  fetchOsmSegments,
  processSegments,
  type ScoredSegment,
  type ImportOptions,
  type ProgressFn,
} from '../features/admin/services/osm-segment-importer';

// ── Firebase project ──────────────────────────────────────────────────────
const PROJECT_ID = 'appout-1';
const FS_COMMIT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`;
const FIRESTORE_BATCH_SIZE = 500;

// ── argv parsing ──────────────────────────────────────────────────────────
type CliArgs = {
  city: string;
  authority: string;
  bbox: { south: number; west: number; north: number; east: number };
  dryRun: boolean;
  commit: boolean;
  minScore?: number;
  minNodes?: number;
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
  };
}

// ── REST commit helper ────────────────────────────────────────────────────
// We use the REST :commit endpoint with an ID token (same auth pattern as
// fix-authority-coordinates.ts). The client SDK can't auth from a bare
// Node process, so REST is the simplest path that doesn't require a service
// account file.

type FirestoreValue =
  | { nullValue: null }
  | { stringValue: string }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { timestampValue: string }
  | { arrayValue: { values: FirestoreValue[] } }
  | { mapValue: { fields: Record<string, FirestoreValue> } };

function toFirestoreValue(v: unknown): FirestoreValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    // Firestore "integerValue" must fit in a 64-bit signed int.
    return Number.isInteger(v) && Math.abs(v) < Number.MAX_SAFE_INTEGER
      ? { integerValue: String(v) }
      : { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(toFirestoreValue) } };
  }
  if (typeof v === 'object') {
    const fields: Record<string, FirestoreValue> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (val !== undefined) fields[k] = toFirestoreValue(val);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(v) };
}

function buildSegmentFields(
  seg: ScoredSegment,
  importedAtIso: string,
): Record<string, FirestoreValue> {
  // Inline at the top level so Firestore stores `path` as an array of maps,
  // matching what the consumer (route-generator.service.ts) expects.
  return {
    osmId: { stringValue: seg.osmId },
    cityName: { stringValue: seg.cityName },
    authorityId: { stringValue: seg.authorityId },
    score: { doubleValue: seg.score },
    lengthMeters: { integerValue: String(seg.lengthMeters) },
    importedAt: { timestampValue: importedAtIso },
    midpoint: toFirestoreValue(seg.midpoint),
    path: toFirestoreValue(seg.path),
    tags: toFirestoreValue(seg.tags),
  };
}

function httpsPost(
  url: string,
  body: string,
  token: string,
): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Bearer ${token}`,
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => {
          raw += c as string;
        });
        res.on('end', () => {
          resolve({ statusCode: res.statusCode ?? 0, body: raw });
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function commitViaRest(
  segments: ScoredSegment[],
  token: string,
  log: ProgressFn,
): Promise<number> {
  const importedAtIso = new Date().toISOString();
  let written = 0;

  for (let i = 0; i < segments.length; i += FIRESTORE_BATCH_SIZE) {
    const slice = segments.slice(i, i + FIRESTORE_BATCH_SIZE);
    const writes = slice.map((seg) => ({
      update: {
        name: `projects/${PROJECT_ID}/databases/(default)/documents/street_segments/osm_${seg.osmId}`,
        fields: buildSegmentFields(seg, importedAtIso),
      },
    }));

    const body = JSON.stringify({ writes });
    const { statusCode, body: respBody } = await httpsPost(FS_COMMIT, body, token);

    if (statusCode >= 400) {
      throw new Error(
        `Firestore commit failed (HTTP ${statusCode}): ${respBody.slice(0, 500)}`,
      );
    }

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
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const opts: ImportOptions = {
    bbox: args.bbox,
    cityName: args.city,
    authorityId: args.authority,
    minScore: args.minScore,
    minNodes: args.minNodes,
  };

  // 1. Fetch
  const ways = await fetchOsmSegments(opts.bbox, log);

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
  console.log('  ─── Score histogram ────────────────────');
  console.log(`    3-4:  ${histogram.bucket3to4}`);
  console.log(`    5-6:  ${histogram.bucket5to6}`);
  console.log(`    7-8:  ${histogram.bucket7to8}`);
  console.log(`    9-10: ${histogram.bucket9to10}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // 4. (optional) Commit
  if (args.commit) {
    const token = process.env.FIREBASE_ID_TOKEN;
    if (!token) {
      console.error(
        '\nFIREBASE_ID_TOKEN is not set. See instructions at the top of this file.',
      );
      process.exit(1);
    }
    console.log(
      `\nCommitting ${segments.length} segments (${FIRESTORE_BATCH_SIZE}/batch)…`,
    );
    const n = await commitViaRest(segments, token, log);
    console.log(`\nDone — ${n} documents written to street_segments.`);
  } else {
    console.log('\nDRY RUN — no Firestore writes performed.');
  }
}

main().catch((err) => {
  console.error('\nFatal:', err);
  process.exit(1);
});
