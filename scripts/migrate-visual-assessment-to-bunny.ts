/**
 * Visual Assessment → Bunny CDN Migration Script
 *
 * Reads every document in `visual_assessment_content`, finds video variant
 * fields that still point at raw Firebase Storage URLs, fetches them into
 * Bunny CDN via Strategy A ("Fetch Video from URL"), polls until encoding
 * finishes, and overwrites the Firestore document with the new CDN paths.
 *
 * ─── Usage ───────────────────────────────────────────────────────────────────
 *
 *   Dry run (reads only, no Bunny or Firestore writes — run this first!):
 *     npx tsx scripts/migrate-visual-assessment-to-bunny.ts --dry-run
 *
 *   Live run (all categories):
 *     BUNNY_API_KEY=<key> BUNNY_LIBRARY_ID=<id> BUNNY_CDN_HOSTNAME=<host> \
 *     npx tsx scripts/migrate-visual-assessment-to-bunny.ts
 *
 *   Live run (single category):
 *     ... npx tsx scripts/migrate-visual-assessment-to-bunny.ts --category=push
 *
 * ─── Prerequisites ────────────────────────────────────────────────────────────
 *   - .env.local (or .env) containing Firebase Admin credentials:
 *       FIREBASE_PROJECT_ID=...
 *       FIREBASE_CLIENT_EMAIL=...
 *       FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
 *   - firebase-admin installed  (npm i firebase-admin)
 *   - BUNNY_API_KEY, BUNNY_LIBRARY_ID, BUNNY_CDN_HOSTNAME set in env
 *   - Node.js ≥ 18 (native `fetch`)
 */

// ── Load .env.local / .env before any other imports read process.env ──────────
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' }); // preferred — Next.js local overrides
dotenv.config();                        // fallback to .env if .env.local is absent

import * as admin from 'firebase-admin';

// ── Constants ─────────────────────────────────────────────────────────────────

const BUNNY_API_BASE_URL = 'https://video.bunnycdn.com';

/** Substring that uniquely identifies a Firebase Storage download URL. */
const FIREBASE_STORAGE_MARKER = 'firebasestorage.googleapis.com';

/** Bunny encoding status codes returned by the video GET endpoint. */
const BUNNY_STATUS_FINISHED = 3;
const BUNNY_STATUS_RESOLUTION_FINISHED = 4;
const BUNNY_STATUS_FAILED = 5;

// ── CLI flags ─────────────────────────────────────────────────────────────────

const isDryRun = process.argv.includes('--dry-run');
const categoryArg =
  process.argv.find((a) => a.startsWith('--category='))?.split('=')[1] ?? null;

// ── Firebase Admin SDK ────────────────────────────────────────────────────────

function assertFirebaseEnv(): {
  projectId: string;
  clientEmail: string;
  privateKey: string;
} {
  const projectId =
    process.env['FIREBASE_PROJECT_ID'] ??
    process.env['NEXT_PUBLIC_FIREBASE_PROJECT_ID'] ??
    '';
  const clientEmail = process.env['FIREBASE_CLIENT_EMAIL'] ?? '';
  const privateKey = (process.env['FIREBASE_PRIVATE_KEY'] ?? '').replace(
    /\\n/g,
    '\n',
  );

  if (!projectId || !clientEmail || !privateKey) {
    console.error('❌  Firebase Admin credentials are missing from env.');
    console.error('   Add the following variables to .env.local (or .env):');
    console.error('');
    console.error(
      `   FIREBASE_PROJECT_ID      ${projectId ? '✓' : '✗  (missing)'}`,
    );
    console.error(
      `   FIREBASE_CLIENT_EMAIL    ${clientEmail ? '✓' : '✗  (missing)'}`,
    );
    console.error(
      `   FIREBASE_PRIVATE_KEY     ${privateKey ? '✓' : '✗  (missing)'}`,
    );
    console.error('');
    console.error(
      '   You can find these values in Firebase Console →',
      'Project Settings → Service Accounts → Generate new private key.',
    );
    process.exit(1);
  }

  return { projectId, clientEmail, privateKey };
}

const firebaseCredentials = assertFirebaseEnv();

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: firebaseCredentials.projectId,
    clientEmail: firebaseCredentials.clientEmail,
    privateKey: firebaseCredentials.privateKey,
  }),
});

const db = admin.firestore();

// ── Local types ───────────────────────────────────────────────────────────────

/** Minimal shape of a single video variant inside a visual_assessment_content doc. */
interface VideoVariant {
  id: string;
  videoUrl?: string;
  videoUrlMov?: string;
  videoUrlWebm?: string;
  thumbnailUrl?: string;
  gender?: string;
  isDefault?: boolean;
}

/** The three variant fields that may hold Firebase Storage URLs. */
type VideoField = 'videoUrl' | 'videoUrlMov' | 'videoUrlWebm';

/** Bunny encodes 360p for primary delivery; 240p for mobile-weight variants. */
const FIELD_RESOLUTION: Record<VideoField, string> = {
  videoUrl: '360p',
  videoUrlMov: '240p',
  videoUrlWebm: '240p',
};

// ── Bunny config helper ───────────────────────────────────────────────────────

interface BunnyConfig {
  apiKey: string;
  libraryId: string;
  cdnHostname: string;
}

function getBunnyConfig(): BunnyConfig {
  const apiKey = (process.env.BUNNY_API_KEY ?? '').trim();
  const libraryId = (process.env.BUNNY_LIBRARY_ID ?? '').trim();
  const cdnHostname = (process.env.BUNNY_CDN_HOSTNAME ?? '').trim();

  if (!apiKey || !libraryId || !cdnHostname) {
    throw new Error(
      'Missing Bunny env vars. Set BUNNY_API_KEY, BUNNY_LIBRARY_ID, and BUNNY_CDN_HOSTNAME.',
    );
  }
  return { apiKey, libraryId, cdnHostname };
}

// ── Bunny API helpers ─────────────────────────────────────────────────────────

/** Create an empty Bunny video slot and return its GUID. */
async function createBunnySlot(title: string): Promise<string> {
  const { apiKey, libraryId } = getBunnyConfig();

  const res = await fetch(`${BUNNY_API_BASE_URL}/library/${libraryId}/videos`, {
    method: 'POST',
    headers: {
      AccessKey: apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ title }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bunny create-slot failed: ${res.status} — ${body}`);
  }

  const json = (await res.json()) as { guid: string };
  return json.guid;
}

/** Tell Bunny to pull bytes from `sourceUrl` into an existing video slot. */
async function triggerFetchFromUrl(
  videoId: string,
  sourceUrl: string,
): Promise<void> {
  const { apiKey, libraryId } = getBunnyConfig();

  const res = await fetch(
    `${BUNNY_API_BASE_URL}/library/${libraryId}/videos/${videoId}/fetch`,
    {
      method: 'POST',
      headers: {
        AccessKey: apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ url: sourceUrl }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Bunny fetch-from-url failed: ${res.status} — ${body}`);
  }
}

/** Poll the Bunny video status endpoint until encoding finishes or times out. */
async function pollUntilFinished(
  videoId: string,
  intervalMs = 5_000,
  timeoutMs = 10 * 60 * 1_000,
): Promise<void> {
  const { apiKey, libraryId } = getBunnyConfig();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));

    const res = await fetch(
      `${BUNNY_API_BASE_URL}/library/${libraryId}/videos/${videoId}`,
      {
        method: 'GET',
        headers: { AccessKey: apiKey, Accept: 'application/json' },
      },
    );

    if (!res.ok) {
      // Transient error — network blip or Bunny rate-limit; retry next tick.
      console.warn(`    ⚠  Status check returned ${res.status} — retrying…`);
      continue;
    }

    const json = (await res.json()) as {
      status: number;
      encodeProgress?: number;
    };

    if (
      json.status === BUNNY_STATUS_FINISHED ||
      json.status === BUNNY_STATUS_RESOLUTION_FINISHED
    ) {
      console.log(`    ✓ Encoding done (status=${json.status})`);
      return;
    }

    if (json.status === BUNNY_STATUS_FAILED) {
      throw new Error(`Bunny encoding failed for video ${videoId} (status=5)`);
    }

    console.log(
      `    ⏳ Encoding… status=${json.status} progress=${json.encodeProgress ?? 0}%`,
    );
  }

  throw new Error(
    `Encoding timed out after ${timeoutMs / 1_000}s for video ${videoId}`,
  );
}

/** Build the final Bunny progressive-download URL for a given resolution. */
function buildCdnUrl(videoId: string, field: VideoField): string {
  const { cdnHostname } = getBunnyConfig();
  const resolution = FIELD_RESOLUTION[field];
  return `https://${cdnHostname}/${videoId}/play_${resolution}.mp4`;
}

// ── Per-field migration ───────────────────────────────────────────────────────

/**
 * Inspect one `field` on one `variant`.  If it holds a Firebase Storage URL,
 * migrate it to Bunny and mutate the `variant` object in-place.
 *
 * Returns `true` if a migration was performed (or would be in dry-run mode).
 */
async function migrateVariantField(
  docId: string,
  variant: VideoVariant,
  field: VideoField,
): Promise<boolean> {
  const url = variant[field];

  if (
    !url ||
    typeof url !== 'string' ||
    !url.includes(FIREBASE_STORAGE_MARKER)
  ) {
    return false;
  }

  const title = `va_${docId}_${variant.id}_${field}`;
  console.log(`  → field "${field}"  |  title: ${title}`);
  console.log(`    src : ${url.slice(0, 120)}${url.length > 120 ? '…' : ''}`);

  if (isDryRun) {
    console.log(`    [DRY RUN] Would create Bunny slot + fetch-from-url.`);
    return true;
  }

  // 1. Reserve a slot in the Bunny library.
  const videoId = await createBunnySlot(title);
  console.log(`    slot: ${videoId}`);

  // 2. Ask Bunny to pull the bytes from Firebase Storage.
  await triggerFetchFromUrl(videoId, url);
  console.log(`    fetch-from-url triggered.`);

  // 3. Wait for Bunny's transcoder to finish all resolutions.
  await pollUntilFinished(videoId);

  // 4. Overwrite the variant field with the new CDN URL.
  const newUrl = buildCdnUrl(videoId, field);
  variant[field] = newUrl;

  // 5. Persist the Bunny video GUID as a companion field for future management.
  (variant as unknown as Record<string, unknown>)[`bunnyVideoId_${field}`] = videoId;

  console.log(`    new : ${newUrl}`);
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  Visual Assessment → Bunny CDN Migration                ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Mode    : ${isDryRun ? 'DRY RUN (no writes)' : '⚠  LIVE — changes will be written'}`);
  console.log(`Filter  : ${categoryArg ? `category starts with "${categoryArg}"` : 'all categories'}`);
  console.log('');

  // ── Build query ────────────────────────────────────────────────────────────
  const baseCol = db.collection('visual_assessment_content');

  const query =
    categoryArg !== null
      ? baseCol
          .where('category', '>=', categoryArg)
          .where('category', '<=', categoryArg + '\uf8ff')
      : baseCol;

  const snapshot = await query.get();
  console.log(`Found ${snapshot.size} document(s).\n`);

  // ── Stats ──────────────────────────────────────────────────────────────────
  let totalMigrated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  // ── Document loop ──────────────────────────────────────────────────────────
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    console.log(`\nDoc: ${docSnap.id}`);

    // Guard: docs linked to the core exercises collection are served via the
    // exercise's own videoUrl — no migration needed here.
    if (data['exerciseId']) {
      console.log(
        `  ⊖ Skipping — linked to exercise "${String(data['exerciseId'])}".` +
          `  Runtime resolver reads from exercises collection instead.`,
      );
      totalSkipped++;
      continue;
    }

    const variants: VideoVariant[] = Array.isArray(data['videoVariants'])
      ? (data['videoVariants'] as VideoVariant[])
      : [];

    if (variants.length === 0) {
      console.log('  ⊖ No videoVariants array — skipping.');
      totalSkipped++;
      continue;
    }

    let docChanged = false;
    const fields: VideoField[] = ['videoUrl', 'videoUrlMov', 'videoUrlWebm'];

    // ── Variant loop ─────────────────────────────────────────────────────────
    for (const variant of variants) {
      for (const field of fields) {
        try {
          const changed = await migrateVariantField(docSnap.id, variant, field);
          if (changed) {
            docChanged = true;
            totalMigrated++;
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(
            `  ✗ Error on ${docSnap.id} / variant "${variant.id}" / field "${field}": ${msg}`,
          );
          totalErrors++;
        }
      }
    }

    // ── Commit back to Firestore ──────────────────────────────────────────────
    if (docChanged && !isDryRun) {
      await docSnap.ref.update({
        videoVariants: variants,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log(`  ✓ Committed ${docSnap.id}`);
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Migration Summary                                      ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`Migrated : ${totalMigrated} video fields`);
  console.log(`Skipped  : ${totalSkipped} documents`);
  console.log(`Errors   : ${totalErrors}`);

  if (isDryRun) {
    console.log(
      '\n(DRY RUN — no changes were written to Firestore or Bunny.)',
    );
    console.log(
      'Remove --dry-run to execute the live migration.',
    );
  } else {
    console.log('\nDone.');
  }
}

main().catch((err: unknown) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
