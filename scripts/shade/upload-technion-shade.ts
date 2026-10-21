/**
 * scripts/shade/upload-technion-shade.ts
 *
 * Uploads the normalized Technion shade layer (output of
 * fetch-technion-shade.ts) to the project's default Firebase Storage bucket:
 *
 *   shade/technion/v1/<citySlug>.geojson.gz   (gzip; contentType application/geo+json,
 *                                              contentEncoding gzip)
 *   shade/technion/v1/manifest.json
 *
 * Every object carries custom metadata {source, attribution, permission,
 * indexType, fetchedAt}. Storage only — no Firestore writes, no
 * storage.rules change: objects stay private and are read server-side via
 * the Admin SDK (note: with contentEncoding gzip, `file.download()`
 * decompresses by default — pass `{ decompress: false }` to get the raw .gz).
 *
 * SAFE BY DEFAULT: dry-run unless --apply. Dry-run is fully offline (no
 * credentials, no network) and prints what would be uploaded + sizes.
 * Never overwrites an existing object unless --overwrite.
 *
 * Usage:
 *   npx tsx scripts/shade/upload-technion-shade.ts --in <fetch-out-dir>
 *   npx tsx scripts/shade/upload-technion-shade.ts --in <fetch-out-dir> --apply --project <projectId> [--overwrite] [--city a,b]
 *
 * Credentials (apply only): FIREBASE_SERVICE_ACCOUNT_KEY from the main
 * checkout's .env.local, same as the other Admin scripts. --project must
 * equal the key's project_id (guards against uploading to the wrong project).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { TECHNION_ATTRIBUTION, TECHNION_PERMISSION, TECHNION_SOURCE } from '../../src/lib/shade';

export const STORAGE_PREFIX = 'shade/technion/v1';
const ENV_PATH = '/Users/calisthenicsltd/Development/appout-1/.env.local';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

interface ManifestCityLite {
  city: string;
  status: string;
  segmentCount?: number;
  normalizedFile?: string;
  fetchedAt?: string;
}

interface PlannedObject {
  objectPath: string;
  body: Buffer;
  localBytes: number;
  contentType: string;
  contentEncoding?: 'gzip';
  metadata: Record<string, string>;
}

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)} MB` : `${(n / 1e3).toFixed(1)} KB`);

function plan(inDir: string, only: string[] | undefined): { objects: PlannedObject[]; skipped: string[] } {
  const manifestPath = path.join(inDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error(`no manifest.json in ${inDir} — run fetch-technion-shade.ts first`);
  const manifestBody = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBody.toString('utf8')) as {
    generatedAt?: string;
    indexType?: string;
    cities: ManifestCityLite[];
  };
  const objects: PlannedObject[] = [];
  const skipped: string[] = [];
  for (const c of manifest.cities) {
    if (only && !only.includes(c.city)) continue;
    if (c.status !== 'ok' || !c.normalizedFile) {
      skipped.push(`${c.city} (status ${c.status})`);
      continue;
    }
    const file = path.join(inDir, c.normalizedFile);
    const raw = fs.readFileSync(file);
    const gz = zlib.gzipSync(raw, { level: 9 });
    objects.push({
      objectPath: `${STORAGE_PREFIX}/${c.city}.geojson.gz`,
      body: gz,
      localBytes: raw.length,
      contentType: 'application/geo+json',
      contentEncoding: 'gzip',
      metadata: {
        source: TECHNION_SOURCE,
        attribution: TECHNION_ATTRIBUTION,
        permission: TECHNION_PERMISSION,
        indexType: manifest.indexType ?? 'SI_daily',
        fetchedAt: c.fetchedAt ?? '',
        city: c.city,
        segmentCount: String(c.segmentCount ?? 0),
      },
    });
  }
  objects.push({
    objectPath: `${STORAGE_PREFIX}/manifest.json`,
    body: manifestBody,
    localBytes: manifestBody.length,
    contentType: 'application/json',
    metadata: {
      source: TECHNION_SOURCE,
      attribution: TECHNION_ATTRIBUTION,
      permission: TECHNION_PERMISSION,
      indexType: manifest.indexType ?? 'SI_daily',
      fetchedAt: manifest.generatedAt ?? '',
    },
  });
  return { objects, skipped };
}

async function main() {
  const inDir = arg('in');
  if (!inDir) {
    console.error('usage: npx tsx scripts/shade/upload-technion-shade.ts --in <dir> [--apply --project <id>] [--overwrite] [--city a,b]');
    process.exit(1);
  }
  const apply = flag('apply');
  const overwrite = flag('overwrite');
  const project = arg('project');
  const only = arg('city')?.split(',').map((s) => s.trim());
  const { objects, skipped } = plan(path.resolve(inDir), only);

  const bucketName = project ? `${project}.firebasestorage.app` : '<projectId>.firebasestorage.app';
  console.log(`${apply ? 'APPLY' : 'DRY-RUN'} → gs://${bucketName}/${STORAGE_PREFIX}/  (overwrite: ${overwrite ? 'yes' : 'no'})`);
  let total = 0;
  for (const o of objects) {
    total += o.body.length;
    console.log(
      `  ${o.objectPath.padEnd(48)} ${fmt(o.body.length).padStart(9)}${o.contentEncoding ? ` (gzip of ${fmt(o.localBytes)})` : ''}  ${o.contentType}${o.metadata.segmentCount ? `  ${o.metadata.segmentCount} segments` : ''}`,
    );
  }
  for (const s of skipped) console.log(`  skip ${s}`);
  console.log(`  ${objects.length} objects, ${fmt(total)} total`);
  console.log(`  metadata: source="${TECHNION_SOURCE}" | permission="${TECHNION_PERMISSION}"`);

  if (!apply) {
    console.log('\nDry-run only — nothing uploaded. Add --apply --project <id> to upload.');
    return;
  }
  if (!project) {
    console.error('--apply requires --project <projectId>');
    process.exit(1);
  }

  const dotenv = await import('dotenv');
  dotenv.config({ path: ENV_PATH });
  const admin = (await import('firebase-admin')).default;
  const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '{}');
  if (!key?.project_id) {
    console.error('FIREBASE_SERVICE_ACCOUNT_KEY missing');
    process.exit(1);
  }
  if (key.project_id !== project) {
    console.error(`--project ${project} does not match the service account's project_id (${key.project_id}) — refusing.`);
    process.exit(1);
  }
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(key), projectId: project, storageBucket: bucketName });
  }
  const bucket = admin.storage().bucket(bucketName);

  let uploaded = 0;
  let kept = 0;
  for (const o of objects) {
    const file = bucket.file(o.objectPath);
    const [exists] = await file.exists();
    if (exists && !overwrite) {
      console.log(`  exists, kept: ${o.objectPath}`);
      kept++;
      continue;
    }
    await file.save(o.body, {
      resumable: false,
      contentType: o.contentType,
      metadata: {
        contentType: o.contentType,
        ...(o.contentEncoding ? { contentEncoding: o.contentEncoding } : {}),
        cacheControl: 'private, max-age=3600',
        metadata: o.metadata,
      },
    });
    console.log(`  ${exists ? 'overwrote' : 'uploaded'}: ${o.objectPath}`);
    uploaded++;
  }
  console.log(`\ndone: ${uploaded} uploaded, ${kept} kept (already existed).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
