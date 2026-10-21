/**
 * scripts/routes-nationwide/build-osm-region-snapshot.ts — RC6 step 4 (W1).
 *
 * Cuts one geo-discovery region (REGIONS key or city_registrations/<key>) out
 * of the local Geofabrik PBF, keeps only the OSM objects geo-discovery queries
 * (scripts/lib/osm-pbf.node.ts GEO_DISCOVERY_TAG_FILTERS) and writes the
 * compact region snapshot (src/lib/osm-local/snapshot.ts) the Cloud Function
 * reads instead of Overpass — so the function needs neither osmium nor the
 * 120 MB PBF.
 *
 * DEFAULT = DRY-RUN: builds the snapshot locally (scripts/output/osm-snapshots/
 * <key>.json.gz) and prints counts + size. Reads Firestore only to resolve a
 * city_registrations region (read-only).
 * --apply --project appout-1 uploads to gs://appout-1.firebasestorage.app/
 * osm/regions/v1/<key>.json.gz after a typed YES; an existing object is kept
 * unless --overwrite. Storage only — no Firestore write, no rules change.
 *
 *   npx tsx scripts/routes-nationwide/build-osm-region-snapshot.ts --region=herzliya
 *   npx tsx scripts/routes-nationwide/build-osm-region-snapshot.ts --region=herzliya,arad --apply --project appout-1
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import * as admin from 'firebase-admin';
import { osmSnapshotPath, toOsmSnapshot } from '../../src/lib/osm-local';
import { assertOsmium, ensureIsraelPbf, extractGeoDiscoveryOsm, pbfTimestamp } from '../lib/osm-pbf.node';
import { osmExtractBbox, resolveRegion } from '../geo-discovery-routes';
import { confirmTypedYes, flagValue, PRODUCTION_PROJECT } from '../trails/lib/trails-apply.node';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const OVERWRITE = argv.includes('--overwrite');
const REGIONS_ARG = flagValue(argv, 'region');
const PROJECT = flagValue(argv, 'project') ?? PRODUCTION_PROJECT;
const OUT_DIR = flagValue(argv, 'out') ?? path.join('scripts', 'output', 'osm-snapshots');
const mb = (n: number) => `${(n / 1e6).toFixed(2)} MB`;

async function main() {
  if (!REGIONS_ARG) throw new Error('usage: --region=<key>[,<key>…] [--out <dir>] [--apply --project appout-1 [--overwrite]]');
  if (APPLY && !flagValue(argv, 'project')) throw new Error('--apply needs --project <id> (production: --project appout-1)');
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '{}');
  if (key.project_id !== PROJECT) throw new Error(`service account is for "${key.project_id}", not --project ${PROJECT}`);
  const bucketName = `${PROJECT}.firebasestorage.app`;
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key), projectId: PROJECT, storageBucket: bucketName });
  const db = admin.firestore();

  assertOsmium();
  const pbf = await ensureIsraelPbf();
  const osmTimestamp = pbfTimestamp(pbf);
  console.log(`PBF: ${pbf} (OSM data ${osmTimestamp ?? 'date unknown'})`);
  console.log(`TARGET: ${APPLY ? `gs://${bucketName}/ (after confirmation)` : 'local files only (dry-run)'}`);

  const built: Array<{ key: string; file: string; body: Buffer }> = [];
  for (const regionKey of REGIONS_ARG.split(',').map((s) => s.trim()).filter(Boolean)) {
    const region = await resolveRegion(regionKey, db);
    const bbox = osmExtractBbox(region);
    const data = await extractGeoDiscoveryOsm(pbf, bbox, path.resolve('.cache/osm/geo-discovery', regionKey));
    const snap = toOsmSnapshot(data, {
      regionKey, bbox, osmTimestamp, extract: 'geofabrik:israel-and-palestine', license: 'ODbL-1.0',
      attribution: '© OpenStreetMap contributors', builtAt: new Date().toISOString(),
    });
    const json = Buffer.from(JSON.stringify(snap));
    const gz = zlib.gzipSync(json, { level: 9 });
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const file = path.join(OUT_DIR, `${regionKey}.json.gz`);
    fs.writeFileSync(file, gz);
    built.push({ key: regionKey, file, body: gz });
    console.log(`  ${regionKey} (${region.label}): ${snap.w.length} ways, ${snap.r.length} relations, ${snap.n.length} nodes → ${mb(gz.length)} gz (${mb(json.length)} raw) · ${file}`);
  }

  if (!APPLY) { console.log('\nDry run only — nothing uploaded. Add --apply --project appout-1 to upload.'); return; }
  if (!(await confirmTypedYes(`\nType YES to upload ${built.length} snapshot(s) to gs://${bucketName}/: `))) { console.log('Aborted — nothing uploaded.'); return; }
  const bucket = admin.storage().bucket(bucketName);
  for (const b of built) {
    const f = bucket.file(osmSnapshotPath(b.key));
    const [exists] = await f.exists();
    if (exists && !OVERWRITE) { console.log(`  exists, kept: ${osmSnapshotPath(b.key)} (add --overwrite to replace)`); continue; }
    await f.save(b.body, {
      resumable: false,
      contentType: 'application/json',
      metadata: {
        contentType: 'application/json', contentEncoding: 'gzip', cacheControl: 'private, max-age=3600',
        metadata: { license: 'ODbL-1.0', attribution: '© OpenStreetMap contributors', osmTimestamp: osmTimestamp ?? '', extract: 'geofabrik:israel-and-palestine', region: b.key },
      },
    });
    console.log(`  ${exists ? 'overwrote' : 'uploaded'}: ${osmSnapshotPath(b.key)}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
