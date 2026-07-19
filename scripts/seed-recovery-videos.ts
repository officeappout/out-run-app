/**
 * seed-recovery-videos.ts
 * ---------------------------------------------------------------------------
 * Creates 7 standalone "recovery follow-along" Exercise records that point at
 * videos ALREADY uploaded to Bunny (by GUID). No upload happens here — this
 * only writes Firestore docs referencing the existing GUIDs.
 *
 * Each record is a self-contained rest-day session (pool → one per rest day),
 * wired so the live rest-day path (`tryBuildRecoveryVideoTrio`) can pick it up:
 *   - exerciseRole: 'recovery'      → rest-day filter
 *   - showOnRestDays: <flag>        → STARTS false (dormant) — see modes below
 *   - isFollowAlong: true           → follow-along playback + tap-advance
 *   - execution_methods[0].media.previewVideo.he.videoId = <bunny guid>
 *                                   → the slot the runtime player actually plays
 *   - execution_methods[0].media.videoDurationSeconds     → card duration
 *   - programIds/targetPrograms/muscleGroups EMPTY         → no strength credit
 *
 * ⚠️ TARGET PROJECT: `appout-1` — this is PRODUCTION (the app reads it live).
 * There is no separate staging project. The seed writes DORMANT records
 * (showOnRestDays:false) so nothing surfaces to users until `--enable`.
 *
 * ⚠️ PREREQUISITE FOR `--enable`: the isRecovery progression guard
 * (branch fix/recovery-progression-guard) must be MERGED to prod and
 * device-tested first. Enabling before the guard is live would let a
 * completed recovery session credit strength level% (see the guard plan).
 *
 * ---------------------------------------------------------------------------
 * USAGE (nothing writes without an explicit non-dry mode):
 *   npx tsx scripts/seed-recovery-videos.ts --dry-run   # print plan, NO writes
 *   npx tsx scripts/seed-recovery-videos.ts             # seed DORMANT records (create-if-missing)
 *   npx tsx scripts/seed-recovery-videos.ts --force     # seed + overwrite existing content (keeps createdAt + live state)
 *   npx tsx scripts/seed-recovery-videos.ts --enable    # flip showOnRestDays → true on the 7 (GO LIVE)
 *   npx tsx scripts/seed-recovery-videos.ts --disable   # kill-switch: showOnRestDays → false
 *
 * Idempotent: deterministic docId `rec_<bunnyGuid>` — re-running never creates
 * duplicates. `--dry-run` composes with every mode.
 *
 * Results checkpoint: scripts/corpus/recovery-seed-results.json
 * ---------------------------------------------------------------------------
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// ── CLI flags ───────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');
const ENABLE  = process.argv.includes('--enable');
const DISABLE = process.argv.includes('--disable');

// ── Constants ───────────────────────────────────────────────────────────────
const EXERCISES_COLLECTION = 'exercises';
const EXPECTED_PROJECT     = 'appout-1';        // hard guard — refuse any other project
const ID_PREFIX            = 'rec_';            // deterministic docId → idempotency
const SEED_SOURCE          = 'recovery-follow-along-seed';
/** New records are created DORMANT. Going live is an explicit `--enable`, never a side effect of seeding. */
const SHOW_ON_REST_DAYS_ON_CREATE = false;

const RESULTS_DIR  = path.join(process.cwd(), 'scripts/corpus');
const RESULTS_PATH = path.join(RESULTS_DIR, 'recovery-seed-results.json');

// ── Input type ──────────────────────────────────────────────────────────────
interface RecoveryVideoInput {
  /** Bunny video GUID (the videoId) — from the Bunny library. REQUIRED. */
  bunnyGuid: string;
  /** Hebrew session title shown to the user. REQUIRED. */
  titleHe: string;
  /** Encoded length in seconds (Bunny dashboard). REQUIRED, > 0. Drives the card's displayed minutes. */
  durationSeconds: number;
  /** Optional method location. Non-gating for recovery (falls back to method[0]). Default 'home'. */
  location?: string;
  /** Optional short Hebrew description. */
  descriptionHe?: string;
  /** Optional — these follow-along videos usually have narration, so audio plays. Default true. */
  hasAudio?: boolean;
}

// ═════════════════════════════════════════════════════════════════════════════
// FILL THIS IN — 7 rows. Replace every REPLACE_* placeholder and the 0 durations.
// The script ABORTS if any placeholder or non-positive duration remains.
// ═════════════════════════════════════════════════════════════════════════════
const VIDEOS: RecoveryVideoInput[] = [
  { bunnyGuid: 'REPLACE_WITH_BUNNY_GUID_01', titleHe: 'REPLACE_WITH_TITLE_HE_01', durationSeconds: 0, location: 'home', descriptionHe: '', hasAudio: true },
  { bunnyGuid: 'REPLACE_WITH_BUNNY_GUID_02', titleHe: 'REPLACE_WITH_TITLE_HE_02', durationSeconds: 0, location: 'home', descriptionHe: '', hasAudio: true },
  { bunnyGuid: 'REPLACE_WITH_BUNNY_GUID_03', titleHe: 'REPLACE_WITH_TITLE_HE_03', durationSeconds: 0, location: 'home', descriptionHe: '', hasAudio: true },
  { bunnyGuid: 'REPLACE_WITH_BUNNY_GUID_04', titleHe: 'REPLACE_WITH_TITLE_HE_04', durationSeconds: 0, location: 'home', descriptionHe: '', hasAudio: true },
  { bunnyGuid: 'REPLACE_WITH_BUNNY_GUID_05', titleHe: 'REPLACE_WITH_TITLE_HE_05', durationSeconds: 0, location: 'home', descriptionHe: '', hasAudio: true },
  { bunnyGuid: 'REPLACE_WITH_BUNNY_GUID_06', titleHe: 'REPLACE_WITH_TITLE_HE_06', durationSeconds: 0, location: 'home', descriptionHe: '', hasAudio: true },
  { bunnyGuid: 'REPLACE_WITH_BUNNY_GUID_07', titleHe: 'REPLACE_WITH_TITLE_HE_07', durationSeconds: 0, location: 'home', descriptionHe: '', hasAudio: true },
];

// ── Firebase init (+ project guard) ─────────────────────────────────────────
function initFirebase(): admin.firestore.Firestore {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set in .env.local');
    const creds = JSON.parse(raw);
    // 🔒 Hard project guard — refuse to write anywhere but appout-1.
    if (creds.project_id !== EXPECTED_PROJECT) {
      throw new Error(
        `Refusing to run: service account project_id="${creds.project_id}" ` +
        `but this script only writes to "${EXPECTED_PROJECT}".`,
      );
    }
    admin.initializeApp({ credential: admin.credential.cert(creds), projectId: creds.project_id });
  }
  return admin.firestore();
}

// ── Input validation ────────────────────────────────────────────────────────
function validateInputs(): void {
  const errors: string[] = [];
  const seenGuids = new Set<string>();
  VIDEOS.forEach((v, i) => {
    const n = i + 1;
    if (!v.bunnyGuid || /REPLACE|PASTE/i.test(v.bunnyGuid)) errors.push(`row ${n}: bunnyGuid is still a placeholder`);
    if (!v.titleHe   || /REPLACE|PASTE/i.test(v.titleHe))   errors.push(`row ${n}: titleHe is still a placeholder`);
    if (!(v.durationSeconds > 0))                           errors.push(`row ${n}: durationSeconds must be > 0`);
    if (v.bunnyGuid && seenGuids.has(v.bunnyGuid))          errors.push(`row ${n}: duplicate bunnyGuid "${v.bunnyGuid}"`);
    if (v.bunnyGuid) seenGuids.add(v.bunnyGuid);
  });
  if (errors.length) {
    throw new Error(`Input not ready — fill in the VIDEOS array:\n  - ${errors.join('\n  - ')}`);
  }
}

const docIdFor = (guid: string): string => `${ID_PREFIX}${guid}`;

// ── Record builder — mirrors the shape createExercise() persists ────────────
function buildRecord(
  v: RecoveryVideoInput,
  opts: { showOnRestDays: boolean; createdAt: FirebaseFirestore.FieldValue | FirebaseFirestore.Timestamp },
): Record<string, unknown> {
  const now = admin.firestore.FieldValue.serverTimestamp();
  return {
    name: { he: v.titleHe, en: '', es: '' },
    type: 'time',                    // timed session
    loggingMode: 'completion',       // mark-done semantics (no reps input)
    equipment: [],
    muscleGroups: [],                // 🔒 safety: no Pass-A domain volume
    programIds: [],                  // 🔒 safety: no cross-program / skill credit
    targetPrograms: [],              // 🔒 safety

    execution_methods: [{
      methodName: 'בית',
      location: v.location ?? 'home',   // non-gating; recovery falls back to method[0]
      requiredGearType: 'user_gear',
      gearIds: [],
      equipmentIds: [],
      media: {
        // ← the slot the runtime player resolves (methodBunnyId → previewVideo.videoId)
        previewVideo: { he: { videoId: v.bunnyGuid, provider: 'bunny' } },
        videoDurationSeconds: v.durationSeconds,   // ← card's displayed minutes (else defaults to 10)
        mainVideoUrl: null,
        imageUrl: null,
      },
    }],

    media: {},                       // exercise-root fallback only (playback comes from the method)
    content: { description: { he: v.descriptionHe ?? '', en: '', es: '' }, highlights: [] },
    stats: { views: 0 },

    // ── recovery wiring ──
    exerciseRole: 'recovery',        // rest-day filter (mandatory)
    showOnRestDays: opts.showOnRestDays,   // control flag — starts false (dormant)
    restDayProgramIds: [],           // empty = eligible for every scheduled program
    isFollowAlong: true,             // follow-along + tap-advance (mandatory)
    hasAudio: v.hasAudio ?? true,    // narration plays (default: unmuted)
    requiredTier: 1,

    base_movement_id: null,
    movementGroup: null,
    createdAt: opts.createdAt,       // preserved on re-run; serverTimestamp on first write
    updatedAt: now,

    // provenance (audit + dedup)
    seedSource: SEED_SOURCE,
    seedGuid: v.bunnyGuid,
  };
}

// ── Modes ───────────────────────────────────────────────────────────────────
type RowResult = { guid: string; docId: string; action: string; title: string };

async function runSeed(db: admin.firestore.Firestore): Promise<RowResult[]> {
  const results: RowResult[] = [];
  for (const v of VIDEOS) {
    const docId = docIdFor(v.bunnyGuid);
    const ref = db.collection(EXERCISES_COLLECTION).doc(docId);
    const snap = await ref.get();

    if (snap.exists && !FORCE) {
      results.push({ guid: v.bunnyGuid, docId, action: 'skipped (exists)', title: v.titleHe });
      console.log(`  ⏭️  ${docId} — exists, skipped (use --force to overwrite content)`);
      continue;
    }

    // Preserve original createdAt and current live-state on --force overwrite,
    // so seeding never resets an already-enabled video back to dormant.
    const existing = snap.exists ? (snap.data() as Record<string, unknown>) : undefined;
    const createdAt = (existing?.createdAt as FirebaseFirestore.Timestamp | undefined)
      ?? admin.firestore.FieldValue.serverTimestamp();
    const showOnRestDays = snap.exists
      ? Boolean(existing?.showOnRestDays)          // keep whatever it is (don't un-enable)
      : SHOW_ON_REST_DAYS_ON_CREATE;               // new record → dormant

    const record = buildRecord(v, { showOnRestDays, createdAt });
    const action = snap.exists ? 'overwritten (--force)' : 'created (dormant)';

    if (DRY_RUN) {
      console.log(`  📝 [dry-run] ${docId} — would ${action} · "${v.titleHe}" · ${v.durationSeconds}s · showOnRestDays=${showOnRestDays}`);
    } else {
      await ref.set(record);
      console.log(`  ✅ ${docId} — ${action} · "${v.titleHe}"`);
    }
    results.push({ guid: v.bunnyGuid, docId, action: DRY_RUN ? `dry-run:${action}` : action, title: v.titleHe });
  }
  return results;
}

async function runToggle(db: admin.firestore.Firestore, target: boolean): Promise<RowResult[]> {
  const verb = target ? 'ENABLE' : 'DISABLE';
  if (target) {
    console.log('  ⚠️  --enable requires the isRecovery progression guard to be LIVE in prod (merged + device-tested).');
  }
  const results: RowResult[] = [];
  for (const v of VIDEOS) {
    const docId = docIdFor(v.bunnyGuid);
    const ref = db.collection(EXERCISES_COLLECTION).doc(docId);
    const snap = await ref.get();

    if (!snap.exists) {
      results.push({ guid: v.bunnyGuid, docId, action: `${verb}: MISSING (seed first)`, title: v.titleHe });
      console.log(`  ❗ ${docId} — not seeded yet; run the seed (default mode) first`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`  📝 [dry-run] ${docId} — would set showOnRestDays=${target}`);
    } else {
      await ref.update({ showOnRestDays: target, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log(`  ${target ? '🟢' : '🔴'} ${docId} — showOnRestDays=${target}`);
    }
    results.push({ guid: v.bunnyGuid, docId, action: DRY_RUN ? `dry-run:${verb}` : verb, title: v.titleHe });
  }
  return results;
}

function writeCheckpoint(mode: string, results: RowResult[]): void {
  if (DRY_RUN) return;
  try {
    if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
    const payload = { mode, project: EXPECTED_PROJECT, count: results.length, results };
    fs.writeFileSync(RESULTS_PATH, JSON.stringify(payload, null, 2));
    console.log(`\n📄 checkpoint → ${path.relative(process.cwd(), RESULTS_PATH)}`);
  } catch (e) {
    console.warn('checkpoint write failed (non-fatal):', e);
  }
}

// ── main ────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (ENABLE && DISABLE) throw new Error('Pass only one of --enable / --disable.');

  const mode = ENABLE ? 'enable' : DISABLE ? 'disable' : 'seed';
  console.log(`\n🌙 Recovery-video seed · mode=${mode}${DRY_RUN ? ' (dry-run)' : ''}${FORCE ? ' (force)' : ''}`);

  validateInputs();
  const db = initFirebase();
  console.log(`   project=${EXPECTED_PROJECT} · collection=${EXERCISES_COLLECTION} · videos=${VIDEOS.length}\n`);

  const results =
    mode === 'seed'    ? await runSeed(db)         :
    mode === 'enable'  ? await runToggle(db, true) :
                         await runToggle(db, false);

  writeCheckpoint(mode, results);

  const created = results.filter(r => /created/.test(r.action)).length;
  const skipped = results.filter(r => /skipped/.test(r.action)).length;
  console.log(`\nDone — ${results.length} rows (${created} created, ${skipped} skipped).`);
  if (mode === 'seed' && !DRY_RUN) {
    console.log('Records are DORMANT (showOnRestDays:false). Run --enable AFTER the guard is live in prod.');
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('\n❌ seed-recovery-videos failed:\n', err instanceof Error ? err.message : err);
    process.exit(1);
  });
