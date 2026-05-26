#!/usr/bin/env npx tsx
/**
 * migrate-schedule-entries.ts
 *
 * One-time admin script — migrates the `userSchedule/` collection from the
 * legacy flat-doc + `_2` suffix pattern to the post-migration single-doc-
 * per-day shape:
 *
 *   { userId, date, entries: UserScheduleEntry[], updatedAt }
 *
 * Three legacy doc shapes are handled:
 *   1. Flat personal doc — wrapped as a single entry in entries[].
 *   2. `_2` overflow doc — merged into the primary doc's entries[] and then deleted.
 *   3. Flat community doc with top-level `communitySessions[]` field — each
 *      legacy CommunitySessionRef is promoted to its own first-class
 *      `source: 'community'` entry with `groupId` / `groupName` /
 *      `startTime` / `scheduledCategories` set directly on the entry.
 *
 * This script is the SINGLE remaining converter for legacy data shapes.
 * The runtime shim that previously normalised legacy reads on the fly was
 * removed in step 14; any doc still in legacy shape after this script runs
 * will be ignored by the runtime (with a one-shot console warning).
 *
 * Behaviour
 * ─────────
 *   • Idempotent — skips docs already in `entries[]` format.
 *   • Deletes `_2` docs after merging into the primary.
 *   • Synthetic entryIds are stable across re-runs:
 *       primary  → `legacy_{docId}`
 *       secondary → `legacy_{docId}_2`
 *       community → `legacy_community_{date}_{groupId}`
 *   • Pagination: 500-doc pages, sorted by __name__.
 *   • Supports --dry-run (no writes, prints what *would* happen).
 *
 * Usage
 * ─────
 *   npx tsx scripts/migrate-schedule-entries.ts --dry-run    # preview
 *   npx tsx scripts/migrate-schedule-entries.ts              # execute
 *
 * Credentials & project ID
 * ────────────────────────
 * The script auto-discovers credentials in this order, picking the first hit:
 *   1. FIREBASE_SERVICE_ACCOUNT_KEY env  — single-line JSON of a service
 *      account (same convention as `src/lib/firebase-admin.ts`).
 *   2. FIREBASE_SERVICE_ACCOUNT_PATH env — filesystem path to a SA JSON file.
 *   3. GOOGLE_APPLICATION_CREDENTIALS env — same, just the standard GCP name.
 *   4. `serviceAccountKey.json` in the project root  — same convention as
 *      other admin scripts (migrate-sderot-to-tenant.ts, smoke-test-tenants.ts).
 *   5. Application Default Credentials (gcloud auth / Cloud Run / etc.).
 *
 * Project ID resolves from (first hit):
 *   1. `project_id` field of the loaded service-account JSON.
 *   2. NEXT_PUBLIC_FIREBASE_PROJECT_ID env  (read from .env.local / .env).
 *   3. FIREBASE_PROJECT_ID env.
 *   4. Hardcoded fallback `appout-1` — matches the project's known Firebase
 *      project ID (see `scripts/seed-achievements.ts`).
 *
 * The script always passes `projectId` explicitly to `initializeApp` so the
 * "Unable to detect a Project Id" error from Firestore can never re-appear,
 * even when running with ADC alone.
 */

import {
  initializeApp,
  cert,
  applicationDefault,
  type AppOptions,
} from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import type { DocumentReference, DocumentSnapshot } from 'firebase-admin/firestore';
import * as fs from 'fs';
import * as path from 'path';

// ── .env / .env.local loader (zero-dep) ───────────────────────────────────
//
// `dotenv` isn't a dependency of this project; rather than adding one we
// inline a small parser that supports the subset we need: KEY=VALUE lines,
// `#` comments, surrounding quotes.  It's run once at module load.

(function loadDotenv() {
  const projectRoot = path.resolve(__dirname, '..');
  for (const filename of ['.env.local', '.env']) {
    const fullPath = path.join(projectRoot, filename);
    if (!fs.existsSync(fullPath)) continue;
    const text = fs.readFileSync(fullPath, 'utf8');
    for (const rawLine of text.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      // Strip matching surrounding quotes.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      // Don't override real env vars — process.env wins.
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
})();

// ── Credential resolution ─────────────────────────────────────────────────

const PROJECT_ROOT = path.resolve(__dirname, '..');
const FALLBACK_PROJECT_ID = 'appout-1';

interface ResolvedCredential {
  appOptions: AppOptions;
  source: string;
  projectId: string;
}

function resolveProjectIdFromEnv(): string | undefined {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    process.env.FIREBASE_PROJECT_ID ||
    undefined
  );
}

function tryParseInlineKey(): ResolvedCredential | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return null;

  // Diagnostic preview — print before ANY processing so the operator can see
  // exactly what's reaching the parser. We cap at 80 chars and mask the tail
  // so a real private_key never leaks into logs.
  const preview = raw.length <= 80 ? raw : `${raw.slice(0, 80)}…(+${raw.length - 80} chars)`;
  console.log(
    `[migrate-schedule-entries] FIREBASE_SERVICE_ACCOUNT_KEY raw preview: ${preview}`,
  );

  // Defensive quote-strip. The env file loader above already handles this for
  // values pulled from .env.local, but inline shell exports (e.g.
  // `export FIREBASE_SERVICE_ACCOUNT_KEY='{"type":"..."}'`) can leave the
  // wrapping quotes intact. Strip both single AND double quotes.
  let cleaned = raw.trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }

  // Friendly hint for the most common foot-gun: an .env value that still has
  // the `...` placeholder instead of a real service-account JSON.
  if (cleaned.includes('"...')) {
    console.warn(
      '[migrate-schedule-entries] FIREBASE_SERVICE_ACCOUNT_KEY appears to contain placeholder \'...\' — ' +
        'paste the full JSON downloaded from Firebase Console → Project Settings → Service Accounts.',
    );
  }

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.warn(
      '[migrate-schedule-entries] FIREBASE_SERVICE_ACCOUNT_KEY env is set but failed to parse:',
      err,
    );
    return null;
  }

  // Firebase Console downloads the SA JSON with real newlines inside
  // private_key. When that JSON is squashed onto one line for an env var,
  // the newlines come through as the two-character escape sequence \n. We
  // restore real newlines before handing the key to `cert()`. Idempotent —
  // strings that already contain real \n pass through unchanged.
  if (typeof parsed.private_key === 'string') {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }

  const projectId =
    parsed.project_id || resolveProjectIdFromEnv() || FALLBACK_PROJECT_ID;
  return {
    appOptions: {
      credential: cert({
        projectId,
        clientEmail: parsed.client_email,
        privateKey: parsed.private_key,
      }),
      projectId,
    },
    source: 'FIREBASE_SERVICE_ACCOUNT_KEY env',
    projectId,
  };
}

function tryKeyFile(envName: string, candidatePath: string | undefined): ResolvedCredential | null {
  if (!candidatePath) return null;
  const resolved = path.isAbsolute(candidatePath)
    ? candidatePath
    : path.resolve(PROJECT_ROOT, candidatePath);
  if (!fs.existsSync(resolved)) {
    if (envName) {
      console.warn(
        `[migrate-schedule-entries] ${envName} points to '${resolved}' but the file does not exist — skipping`,
      );
    }
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
    const projectId =
      parsed.project_id || resolveProjectIdFromEnv() || FALLBACK_PROJECT_ID;
    return {
      appOptions: {
        credential: cert({
          projectId,
          clientEmail: parsed.client_email,
          privateKey: String(parsed.private_key).replace(/\\n/g, '\n'),
        }),
        projectId,
      },
      source: envName ? `${envName}=${resolved}` : `keyfile @ ${resolved}`,
      projectId,
    };
  } catch (err) {
    console.warn(
      `[migrate-schedule-entries] Failed to read service-account JSON at '${resolved}':`,
      err,
    );
    return null;
  }
}

function resolveCredential(): ResolvedCredential {
  const inline = tryParseInlineKey();
  if (inline) return inline;

  const fromCustomPath = tryKeyFile(
    'FIREBASE_SERVICE_ACCOUNT_PATH',
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  );
  if (fromCustomPath) return fromCustomPath;

  const fromGac = tryKeyFile(
    'GOOGLE_APPLICATION_CREDENTIALS',
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
  );
  if (fromGac) return fromGac;

  // Convention used by other scripts in this repo.
  const conventionalPath = path.join(PROJECT_ROOT, 'serviceAccountKey.json');
  const fromConventional = tryKeyFile('', conventionalPath);
  if (fromConventional) return fromConventional;

  // Last resort — Application Default Credentials.  The explicit projectId
  // is critical: without it Firestore throws "Unable to detect a Project Id".
  const projectId = resolveProjectIdFromEnv() || FALLBACK_PROJECT_ID;
  return {
    appOptions: {
      credential: applicationDefault(),
      projectId,
    },
    source: 'applicationDefault() (gcloud / GCE / Cloud Run)',
    projectId,
  };
}

const cred = resolveCredential();
console.log(`[migrate-schedule-entries] credential source: ${cred.source}`);
console.log(`[migrate-schedule-entries] project id:        ${cred.projectId}`);

initializeApp(cred.appOptions);
const db = getFirestore();

const COLLECTION = 'userSchedule';
const PAGE_SIZE = 500;

// ── Stats ──────────────────────────────────────────────────────────────────

interface Stats {
  totalScanned: number;
  alreadyMigrated: number;
  migratedPrimary: number;
  mergedSecondary: number;
  promotedCommunitySessions: number;
  orphanSecondaryConverted: number;
  emptyDocsCleared: number;
  errors: string[];
}

const stats: Stats = {
  totalScanned: 0,
  alreadyMigrated: 0,
  migratedPrimary: 0,
  mergedSecondary: 0,
  promotedCommunitySessions: 0,
  orphanSecondaryConverted: 0,
  emptyDocsCleared: 0,
  errors: [],
};

// ── Types (loose — admin SDK returns DocumentData) ─────────────────────────

interface LegacyCommunitySessionRef {
  groupId: string;
  groupName: string;
  time: string;
  category: string;
}

/** Loose record for legacy doc shapes — every field is optional. */
interface RawDoc {
  userId?: string;
  date?: string;
  programIds?: string[];
  type?: 'training' | 'rest' | 'assessment';
  source?: 'recurring' | 'manual' | 'auto' | 'google_calendar' | 'community';
  completed?: boolean;
  completedWorkoutId?: string;
  scheduledCategories?: string[];
  startTime?: string;
  externalId?: string;
  groupId?: string;
  groupName?: string;
  communitySessions?: LegacyCommunitySessionRef[];
  entries?: unknown[];
  entryId?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Convert a single flat legacy doc into 0+ entries. This is now the canonical
 * (and only) implementation of the legacy → entries[] conversion logic — the
 * matching runtime shim was removed in step 14.
 */
function buildEntriesFromFlatDoc(docId: string, data: RawDoc): RawDoc[] {
  const entries: RawDoc[] = [];

  // Community-only legacy wrapper: source === 'community' AND communitySessions[].
  // The flat-doc fields are placeholders for the sessions beneath; don't emit
  // a duplicate "personal" entry from them.
  const isCommunityOnly =
    data.source === 'community' && Array.isArray(data.communitySessions);

  if (data.type && !isCommunityOnly) {
    const { communitySessions: _drop, entries: _entries, ...rest } = data;
    void _drop;
    void _entries;
    entries.push({
      ...rest,
      entryId: data.entryId ?? `legacy_${docId}`,
    });
  }

  // Promote each CommunitySessionRef to a first-class community entry.
  for (const cs of data.communitySessions ?? []) {
    entries.push({
      entryId: `legacy_community_${data.date}_${cs.groupId}`,
      userId: data.userId,
      date: data.date,
      programIds: [],
      type: 'training',
      source: 'community',
      completed: false,
      groupId: cs.groupId,
      groupName: cs.groupName,
      startTime: cs.time,
      scheduledCategories: [cs.category],
    });
    stats.promotedCommunitySessions++;
  }

  return entries;
}

// ── Migration steps ────────────────────────────────────────────────────────

async function migratePrimary(
  primaryRef: DocumentReference,
  primaryData: RawDoc,
  primaryId: string,
  secondaryRef: DocumentReference | null,
  secondaryData: RawDoc | null,
  secondaryId: string | null,
  dryRun: boolean,
): Promise<void> {
  // Idempotent: skip if already in entries[] format.
  if (Array.isArray(primaryData.entries)) {
    stats.alreadyMigrated++;
    // If a stale `_2` somehow exists alongside, delete it so the collection stays clean.
    if (secondaryRef && !dryRun) await secondaryRef.delete();
    return;
  }

  if (!primaryData.userId || !primaryData.date) {
    stats.errors.push(`${primaryId}: missing userId or date — cannot migrate`);
    return;
  }

  const entries = buildEntriesFromFlatDoc(primaryId, primaryData);

  if (secondaryData && secondaryId) {
    const secEntries = buildEntriesFromFlatDoc(secondaryId, secondaryData);
    entries.push(...secEntries);
    stats.mergedSecondary++;
  }

  if (entries.length === 0) {
    // Truly empty legacy doc (no type, no communitySessions). Treat it the
    // same as "no entry on that day" — write entries: [] so the doc is in
    // canonical shape, and the runtime returns an empty array for the day.
    stats.emptyDocsCleared++;
  } else {
    stats.migratedPrimary++;
  }

  const day = stripUndefined({
    userId: primaryData.userId,
    date: primaryData.date,
    entries: entries.map(
      (e) => stripUndefined(e as unknown as Record<string, unknown>),
    ),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (!dryRun) {
    await primaryRef.set(day, { merge: false });
    if (secondaryRef) await secondaryRef.delete();
  }
}

async function migrateOrphanSecondary(
  secondaryRef: DocumentReference,
  secondaryData: RawDoc,
  secondaryId: string,
  dryRun: boolean,
): Promise<void> {
  // Orphan _2 doc — primary missing.  Convert it into a primary doc at the
  // un-suffixed path.
  const baseId = secondaryId.slice(0, -2);
  const baseRef = db.collection(COLLECTION).doc(baseId);

  if (Array.isArray(secondaryData.entries)) {
    // Already migrated _2 doc — just delete the orphan so the new shape lives at baseId.
    if (!dryRun) await secondaryRef.delete();
    return;
  }

  if (!secondaryData.userId || !secondaryData.date) {
    stats.errors.push(`${secondaryId} (orphan): missing userId or date — cannot migrate`);
    return;
  }

  const entries = buildEntriesFromFlatDoc(secondaryId, secondaryData);
  if (entries.length === 0) {
    if (!dryRun) await secondaryRef.delete();
    return;
  }

  const day = stripUndefined({
    userId: secondaryData.userId,
    date: secondaryData.date,
    entries: entries.map(
      (e) => stripUndefined(e as unknown as Record<string, unknown>),
    ),
    updatedAt: FieldValue.serverTimestamp(),
  });

  if (!dryRun) {
    await baseRef.set(day, { merge: false });
    await secondaryRef.delete();
  }

  stats.orphanSecondaryConverted++;
}

// ── Driver ─────────────────────────────────────────────────────────────────

async function loadAllDocs(): Promise<{
  primaries: Map<string, DocumentSnapshot>;
  secondaries: Map<string, DocumentSnapshot>;
}> {
  const primaries = new Map<string, DocumentSnapshot>();
  const secondaries = new Map<string, DocumentSnapshot>();

  let cursorId: string | null = null;
  let page = 0;

  while (true) {
    page++;
    let q = db.collection(COLLECTION).orderBy('__name__').limit(PAGE_SIZE);
    if (cursorId) q = q.startAfter(cursorId);
    const snap = await q.get();
    if (snap.empty) break;

    for (const d of snap.docs) {
      stats.totalScanned++;
      if (d.id.endsWith('_2')) {
        secondaries.set(d.id.slice(0, -2), d);
      } else {
        primaries.set(d.id, d);
      }
    }

    console.log(`  page ${page}: loaded ${snap.size} (running total: ${stats.totalScanned})`);
    if (snap.size < PAGE_SIZE) break;
    cursorId = snap.docs[snap.docs.length - 1].id;
  }

  return { primaries, secondaries };
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  console.log(dryRun ? '\n=== DRY RUN (no writes) ===' : '\n=== LIVE MIGRATION ===');
  console.log(`Scanning '${COLLECTION}' collection...\n`);

  const start = Date.now();
  const { primaries, secondaries } = await loadAllDocs();

  // Process primaries (and consume their matching secondary along the way).
  // `Array.from` is used instead of direct `for-of` over Map.entries() to stay
  // compatible with the project's default ES3 iteration target.
  for (const [primaryId, primarySnap] of Array.from(primaries.entries())) {
    const primaryData = primarySnap.data() as RawDoc;
    const secondarySnap = secondaries.get(primaryId);
    if (secondarySnap) secondaries.delete(primaryId);
    try {
      await migratePrimary(
        primarySnap.ref,
        primaryData,
        primaryId,
        secondarySnap?.ref ?? null,
        (secondarySnap?.data() as RawDoc | undefined) ?? null,
        secondarySnap?.id ?? null,
        dryRun,
      );
    } catch (e: any) {
      stats.errors.push(`${primaryId}: ${e?.message || String(e)}`);
    }
  }

  // Anything left in `secondaries` is a true orphan — primary missing.
  for (const [, secondarySnap] of Array.from(secondaries.entries())) {
    try {
      await migrateOrphanSecondary(
        secondarySnap.ref,
        secondarySnap.data() as RawDoc,
        secondarySnap.id,
        dryRun,
      );
    } catch (e: any) {
      stats.errors.push(`${secondarySnap.id} (orphan): ${e?.message || String(e)}`);
    }
  }

  const elapsedSec = ((Date.now() - start) / 1000).toFixed(1);

  console.log('\n══════════════════════════════════════════');
  console.log(`${dryRun ? 'Preview' : 'Migration'} complete in ${elapsedSec}s.`);
  console.log(`  Total docs scanned:                ${stats.totalScanned}`);
  console.log(`  Already in entries[] format:       ${stats.alreadyMigrated}`);
  console.log(`  Primaries migrated:                ${stats.migratedPrimary}`);
  console.log(`  Secondaries merged into primary:   ${stats.mergedSecondary}`);
  console.log(`  Orphan _2 docs converted:          ${stats.orphanSecondaryConverted}`);
  console.log(`  Empty legacy docs cleared:         ${stats.emptyDocsCleared}`);
  console.log(`  CommunitySessionRef promoted:      ${stats.promotedCommunitySessions}`);
  console.log(`  Errors:                            ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log(`\n❌ Errors:`);
    stats.errors.slice(0, 20).forEach((e) => console.log(`     • ${e}`));
    if (stats.errors.length > 20) {
      console.log(`     …and ${stats.errors.length - 20} more`);
    }
  }

  if (dryRun && (stats.migratedPrimary > 0 || stats.orphanSecondaryConverted > 0)) {
    console.log('\nRun WITHOUT --dry-run to apply changes.');
  }
}

run().catch((err) => {
  console.error('\n❌ Migration failed:', err);
  process.exit(1);
});
