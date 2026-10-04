/**
 * scripts/_stage9-program-identity-backfill.ts
 *
 * Program-identity unification, Stage 9 (final stage, owner-run only —
 * see the Phase 1 audit, §06). Stages 5-8 (all merged to main) stopped
 * every NEW mixed-key / raw-hash write this script's three findings can
 * come from. This stage is the one-time cleanup of documents that were
 * already written before those fixes landed. No code change — Firestore
 * data only.
 *
 * SAFE BY DEFAULT: running this script with no flags performs ZERO writes.
 * It builds the full plan, prints a report (including every field of every
 * entry it would touch, not just currentLevel — see "pre-flight review"
 * below), and backs up every document it would touch to a local JSON file
 * — then stops. Pass --confirm to actually write (still backs up first,
 * same file, and re-reads + re-checks each doc fresh immediately before
 * writing it — see "Apply" below). Idempotent: re-running after a
 * successful write detects the now-clean state and reports 0 remaining
 * targets for whichever finding was already resolved.
 *
 * Three findings, matching the audit's Stage 9 scope exactly:
 *
 *   (a) activePrograms[].templateId still a raw Firestore hash (the
 *       "legendary templateId bug" — never fixed retroactively by Stages
 *       5-8, which only stopped NEW occurrences). Rewrites the array
 *       entry's id/templateId to its resolved slug. Every other field on
 *       the entry (name/startDate/etc.) is untouched.
 *
 *   (b) DUAL-KEYED progression.tracks/domains: a hash key AND its slug
 *       sibling both exist for the same program. Collapsed to slug-only —
 *       but ONLY when both keys agree on currentLevel; a disagreement is
 *       NOT auto-resolved (reported under NEEDS MANUAL REVIEW, excluded
 *       from the write set entirely, per the audit's explicit instruction
 *       — that's a signal of prior corruption, not noise to paper over).
 *
 *       PRE-FLIGHT FINDING (confirmed against the real field model —
 *       DomainTrackProgress/DomainProgress in progression.types.ts /
 *       user.types.ts — before this script was approved to run): a
 *       tracks/domains entry holds real fields beyond currentLevel
 *       (tracks: percent, lastWorkoutDate, totalWorkoutsCompleted,
 *       completedGoalIds; domains: maxLevel, isUnlocked). Tracing their
 *       writers (progression.service.ts's actual workout-completion path)
 *       confirmed the key it writes under is whatever `activeProgramId`
 *       the caller passed — which, for a legacy account, can be the SAME
 *       raw hash this whole Stage exists to clean up. So neither the hash
 *       nor the slug entry can be assumed authoritative for every field —
 *       either could hold real accumulated history the other lacks.
 *       Collapsing by deleting the hash key outright (the original design
 *       of this script, before this finding) would have silently dropped
 *       data on any account where that happened. Fixed: the two entries
 *       are MERGED (see mergeTrackEntries/mergeDomainEntries below), never
 *       just one kept — percent/totalWorkoutsCompleted take the higher
 *       value, lastWorkoutDate takes the more recent, completedGoalIds is
 *       a union, maxLevel takes the higher value, isUnlocked is OR'd. The
 *       dry-run report prints BOTH full entries AND the merge result for
 *       every planned collapse — reviewable before --confirm, not blind.
 *
 *   (c) HASH-ONLY progression.tracks/domains: a hash key exists with NO
 *       slug sibling at all (the pre-Stage-7 admin-enroll gap — a leaf
 *       child written only under its raw hash). Renamed in place to its
 *       slug key (old key deleted, value moved verbatim) — there is no
 *       "other entry" to merge with here, so this is always
 *       field-complete once the hash resolves to a real, known slug.
 *
 * Collision check (pre-flight, run separately, not part of this script):
 * scripts/_check-program-slug-collisions.ts confirmed 0 of the current 14
 * real program docs share a slug. The rename/collapse guard below still
 * checks for it defensively (skips + reports, never silently merges two
 * DIFFERENT programs into one key) in case that ever changes.
 *
 * What this script does NOT do: touch any document whose hash doesn't
 * resolve to a known program (logged under UNRESOLVED, skipped — a
 * resolution gap is a bug to investigate, never a guess to paper over);
 * touch progression.masterProgramSubLevels, progression.skillFocusIds, or
 * any other field; run itself (that's for David).
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });
import * as admin from 'firebase-admin';

function init() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local or ensure .env.local is loaded.'); process.exit(1); }
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}

const CONFIRM = process.argv.includes('--confirm');
const USERS_COLLECTION = 'users';
const PROGRAMS_COLLECTION = 'programs';
const BACKUP_PATH = path.join(__dirname, `_stage9-backfill-backup-${Date.now()}.json`);

/**
 * Mirrors program-hierarchy.utils.ts's canonical slug formula exactly
 * (`p.slug || p.movementPattern || name-derived`) — duplicated here
 * deliberately rather than imported: this script runs under the Admin SDK
 * (firebase-admin), the app's resolver is written against the client SDK's
 * module-level cache, and bridging the two isn't worth it for one 3-line
 * formula. If that formula ever changes, update both — same discipline as
 * every other independent copy this whole audit already found and is
 * trying to retire, not a new one to add.
 */
function programSlug(p: admin.firestore.DocumentData): string {
  return p.slug || p.movementPattern || String(p.name ?? '').toLowerCase().replace(/[\s-]+/g, '_');
}

interface TrackEntry {
  currentLevel?: number;
  percent?: number;
  lastWorkoutDate?: unknown;
  totalWorkoutsCompleted?: number;
  completedGoalIds?: string[];
  [k: string]: unknown;
}

interface DomainEntry {
  currentLevel?: number;
  maxLevel?: number;
  isUnlocked?: boolean;
  [k: string]: unknown;
}

/** Firestore Admin SDK Timestamp, a JS Date, an ISO string, or absent — all 4 appear across this codebase's various writers. Normalized to epoch ms for comparison only; the ORIGINAL value (whichever side wins) is what actually gets written, never a reconstructed one. */
function toMillis(v: unknown): number {
  if (!v) return 0;
  if (v instanceof admin.firestore.Timestamp) return v.toMillis();
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' || typeof v === 'number') { const d = new Date(v); return isNaN(d.getTime()) ? 0 : d.getTime(); }
  return 0;
}

/**
 * Merge two DUAL-KEYED tracks entries for the SAME program (currentLevel
 * already confirmed equal by the caller) into one, losing neither side's
 * real history. See the file-header "PRE-FLIGHT FINDING" for why neither
 * side can be assumed authoritative on its own.
 */
function mergeTrackEntries(hash: TrackEntry, slug: TrackEntry): TrackEntry {
  const merged: TrackEntry = {
    currentLevel: slug.currentLevel ?? hash.currentLevel,
    percent: Math.max(hash.percent ?? 0, slug.percent ?? 0),
  };
  const totalWorkouts = Math.max(hash.totalWorkoutsCompleted ?? 0, slug.totalWorkoutsCompleted ?? 0);
  if (totalWorkouts > 0) merged.totalWorkoutsCompleted = totalWorkouts;

  const hashMs = toMillis(hash.lastWorkoutDate);
  const slugMs = toMillis(slug.lastWorkoutDate);
  if (hashMs || slugMs) merged.lastWorkoutDate = hashMs >= slugMs ? hash.lastWorkoutDate : slug.lastWorkoutDate;

  const goalIds = Array.from(new Set([...(hash.completedGoalIds ?? []), ...(slug.completedGoalIds ?? [])]));
  if (goalIds.length > 0) merged.completedGoalIds = goalIds;

  return merged;
}

/** Same purpose as mergeTrackEntries, for progression.domains' narrower field set. */
function mergeDomainEntries(hash: DomainEntry, slug: DomainEntry): DomainEntry {
  const merged: DomainEntry = {
    currentLevel: slug.currentLevel ?? hash.currentLevel,
    isUnlocked: !!(hash.isUnlocked || slug.isUnlocked),
  };
  const maxLevel = Math.max(hash.maxLevel ?? 0, slug.maxLevel ?? 0);
  if (maxLevel > 0) merged.maxLevel = maxLevel;
  return merged;
}

interface CollapsePlan {
  hashKey: string;
  slugKey: string;
  hashEntry: TrackEntry | DomainEntry;
  slugEntry: TrackEntry | DomainEntry;
  merged: TrackEntry | DomainEntry;
}

interface RenamePlan {
  hashKey: string;
  slugKey: string;
  entry: TrackEntry | DomainEntry;
}

interface PlannedUserWrite {
  uid: string;
  activeProgramsFix?: { index: number; from: string; to: string }[];
  tracksCollapse?: CollapsePlan[];
  domainsCollapse?: CollapsePlan[];
  tracksRename?: RenamePlan[];
  domainsRename?: RenamePlan[];
}

interface ManualReviewFlag {
  uid: string;
  field: 'tracks' | 'domains';
  hashKey: string;
  slugKey: string;
  hashLevel: number;
  slugLevel: number;
}

interface UnresolvedHash {
  uid: string;
  field: 'tracks' | 'domains' | 'activePrograms';
  key: string;
}

interface SlugCollision {
  uid: string;
  field: 'tracks' | 'domains';
  slugKey: string;
  hashKeys: string[];
}

async function main() {
  init();
  const db = admin.firestore();

  console.log(CONFIRM
    ? '⚠️  --confirm passed — this run WILL write after the backup completes.\n'
    : 'DRY RUN — no writes will be made. Pass --confirm to actually write.\n');

  // ── Build the id→slug map from the real programs collection ────────────
  const programsSnap = await db.collection(PROGRAMS_COLLECTION).get();
  const idToSlug = new Map<string, string>();
  for (const doc of programsSnap.docs) {
    idToSlug.set(doc.id, programSlug(doc.data()));
  }
  console.log(`Loaded ${idToSlug.size} program(s) for id→slug resolution.\n`);

  const usersSnap = await db.collection(USERS_COLLECTION).get();
  console.log(`Scanning ${usersSnap.size} user doc(s)...\n`);

  const planned: PlannedUserWrite[] = [];
  const manualReview: ManualReviewFlag[] = [];
  const unresolved: UnresolvedHash[] = [];
  const slugCollisions: SlugCollision[] = [];
  const backupDocs: Record<string, unknown> = {};

  const isRawHash = (key: string) => idToSlug.has(key);

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const data = userDoc.data();
    const progression = data.progression ?? {};
    const tracks: Record<string, TrackEntry> = progression.tracks ?? {};
    const domains: Record<string, DomainEntry> = progression.domains ?? {};
    const activePrograms: Array<{ id?: string; templateId?: string }> = progression.activePrograms ?? [];

    const write: PlannedUserWrite = { uid };
    let touched = false;

    // ── (a) activePrograms[].templateId still a raw hash ──────────────────
    const activeProgramsFix: PlannedUserWrite['activeProgramsFix'] = [];
    activePrograms.forEach((ap, index) => {
      const raw = ap.templateId ?? ap.id;
      if (!raw) return;
      if (!isRawHash(raw)) return; // already a slug, or not a program id at all
      const slug = idToSlug.get(raw)!;
      activeProgramsFix.push({ index, from: raw, to: slug });
    });
    if (activeProgramsFix.length > 0) {
      write.activeProgramsFix = activeProgramsFix;
      touched = true;
    }

    // ── (b)/(c) tracks and domains: dual-keyed collapse vs hash-only rename ──
    // Also detects a slug COLLISION — two DIFFERENT hash keys both
    // resolving to the SAME slug on this one user doc. _check-program-
    // slug-collisions.ts found 0 of these across the real programs
    // collection today, but this guard stays: it's cheap, and it's exactly
    // the kind of silent-merge-of-two-different-things bug this whole
    // audit exists to stop adding more of. Flagged and skipped, never
    // guessed at.
    const scanField = <T extends TrackEntry | DomainEntry>(
      field: 'tracks' | 'domains',
      obj: Record<string, T>,
      merge: (hash: T, slug: T) => T,
    ): { collapse: CollapsePlan[]; rename: RenamePlan[] } => {
      const collapse: CollapsePlan[] = [];
      const rename: RenamePlan[] = [];
      const slugTargets = new Map<string, string[]>(); // slugKey -> hashKeys that map to it

      for (const hashKey of Object.keys(obj)) {
        if (!isRawHash(hashKey)) continue; // already a slug key
        const slugKey = idToSlug.get(hashKey)!;
        if (slugKey === hashKey) continue; // defensive — formula returned the id itself, nothing to do
        if (!slugTargets.has(slugKey)) slugTargets.set(slugKey, []);
        slugTargets.get(slugKey)!.push(hashKey);
      }

      for (const [slugKey, hashKeys] of Array.from(slugTargets.entries())) {
        if (hashKeys.length > 1) {
          slugCollisions.push({ uid, field, slugKey, hashKeys });
          continue; // skip all of them — don't guess which one is "right"
        }
        const hashKey = hashKeys[0];
        const hashEntry = obj[hashKey];
        const hashLevel = hashEntry?.currentLevel ?? 0;

        if (Object.prototype.hasOwnProperty.call(obj, slugKey)) {
          const slugEntry = obj[slugKey];
          const slugLevel = slugEntry?.currentLevel ?? 0;
          if (hashLevel === slugLevel) {
            collapse.push({ hashKey, slugKey, hashEntry, slugEntry, merged: merge(hashEntry, slugEntry) });
          } else {
            manualReview.push({ uid, field, hashKey, slugKey, hashLevel, slugLevel });
          }
        } else {
          rename.push({ hashKey, slugKey, entry: hashEntry });
        }
      }
      return { collapse, rename };
    };

    const tracksScan = scanField('tracks', tracks, mergeTrackEntries);
    if (tracksScan.collapse.length > 0) { write.tracksCollapse = tracksScan.collapse; touched = true; }
    if (tracksScan.rename.length > 0) { write.tracksRename = tracksScan.rename; touched = true; }

    const domainsScan = scanField('domains', domains, mergeDomainEntries);
    if (domainsScan.collapse.length > 0) { write.domainsCollapse = domainsScan.collapse; touched = true; }
    if (domainsScan.rename.length > 0) { write.domainsRename = domainsScan.rename; touched = true; }

    // ── Unresolved hashes: a key LOOKS like a hash shape but isn't in the
    // programs collection at all (deleted program, or genuinely not a
    // program id). Logged for investigation — never guessed at. ──────────
    const HASH_SHAPE = /^[a-zA-Z0-9]{15,}$/;
    for (const [field, obj] of [['tracks', tracks], ['domains', domains]] as const) {
      for (const key of Object.keys(obj)) {
        if (HASH_SHAPE.test(key) && !idToSlug.has(key)) {
          unresolved.push({ uid, field, key });
        }
      }
    }
    for (const ap of activePrograms) {
      const raw = ap.templateId ?? ap.id;
      if (raw && HASH_SHAPE.test(raw) && !idToSlug.has(raw)) {
        unresolved.push({ uid, field: 'activePrograms', key: raw });
      }
    }

    if (touched) {
      planned.push(write);
      backupDocs[uid] = data;
    }
  }

  // ── Report ───────────────────────────────────────────────────────────────
  console.log('='.repeat(78));
  console.log(`PLANNED WRITES: ${planned.length} user doc(s)`);
  console.log('='.repeat(78));
  for (const w of planned) {
    console.log(`\n${w.uid}`);
    w.activeProgramsFix?.forEach(f => console.log(`  activePrograms[${f.index}]: ${f.from} → ${f.to}`));
    const printCollapse = (field: string, c: CollapsePlan) => {
      console.log(`  ${field}.${c.hashKey} + ${field}.${c.slugKey} → collapse to ${field}.${c.slugKey}:`);
      console.log(`      hash entry:   ${JSON.stringify(c.hashEntry)}`);
      console.log(`      slug entry:   ${JSON.stringify(c.slugEntry)}`);
      console.log(`      merged (new): ${JSON.stringify(c.merged)}`);
    };
    w.tracksCollapse?.forEach(c => printCollapse('tracks', c));
    w.domainsCollapse?.forEach(c => printCollapse('domains', c));
    w.tracksRename?.forEach(r => console.log(`  tracks.${r.hashKey} → renamed to tracks.${r.slugKey} (verbatim, no prior slug entry): ${JSON.stringify(r.entry)}`));
    w.domainsRename?.forEach(r => console.log(`  domains.${r.hashKey} → renamed to domains.${r.slugKey} (verbatim, no prior slug entry): ${JSON.stringify(r.entry)}`));
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`NEEDS MANUAL REVIEW: ${manualReview.length} entrie(s) — hash and slug keys DISAGREE on level. NOT included in any write. Resolve by hand first.`);
  console.log('='.repeat(78));
  for (const m of manualReview) {
    console.log(`  ${m.uid}: ${m.field}.${m.hashKey}=L${m.hashLevel} vs ${m.field}.${m.slugKey}=L${m.slugLevel}`);
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`SLUG COLLISIONS ON A USER DOC: ${slugCollisions.length} — two DIFFERENT hash keys resolved to the same slug. NOT included in any write.`);
  console.log('='.repeat(78));
  for (const s of slugCollisions) {
    console.log(`  ${s.uid}: ${s.field} — [${s.hashKeys.join(', ')}] all resolve to "${s.slugKey}"`);
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`UNRESOLVED (hash-shaped key, no matching program doc): ${unresolved.length} — skipped, needs investigation, not guessed at.`);
  console.log('='.repeat(78));
  for (const u of unresolved) {
    console.log(`  ${u.uid}: ${u.field}.${u.key}`);
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`SUMMARY: ${planned.length} doc(s) to write, ${manualReview.length} flagged for manual review, ${slugCollisions.length} slug collision(s) skipped, ${unresolved.length} unresolved hash(es) skipped.`);
  console.log('='.repeat(78));

  if (planned.length === 0) {
    console.log('\nNothing to write. Done.');
    return;
  }

  // ── Backup before any write, dry-run or not ─────────────────────────────
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(backupDocs, null, 2));
  console.log(`\nBacked up ${Object.keys(backupDocs).length} full user doc(s) to:\n  ${BACKUP_PATH}`);

  if (!CONFIRM) {
    console.log('\nDRY RUN complete — no writes made. Review the merged values above carefully, then re-run with --confirm to apply.');
    return;
  }

  console.log('\nApplying writes...');
  let written = 0;
  for (const w of planned) {
    const ref = db.collection(USERS_COLLECTION).doc(w.uid);
    const snap = await ref.get();
    if (!snap.exists) { console.log(`  ✗ ${w.uid} — no longer exists, skipped`); continue; }
    const data = snap.data()!;
    const progression = data.progression ?? {};
    const tracks: Record<string, TrackEntry> = { ...(progression.tracks ?? {}) };
    const domains: Record<string, DomainEntry> = { ...(progression.domains ?? {}) };
    const activePrograms: Array<{ id?: string; templateId?: string }> = [...(progression.activePrograms ?? [])];

    // Re-verify each targeted field against a FRESH read, immediately
    // before writing — skip + warn instead of overwriting if something
    // changed since the plan was built (minutes or days ago, per David's
    // own review-then-decide flow). The merge itself is RECOMPUTED fresh
    // here too, never reused from the stale dry-run plan.
    let skippedAny = false;

    w.activeProgramsFix?.forEach((f) => {
      const current = activePrograms[f.index];
      const currentId = current?.templateId ?? current?.id;
      if (currentId !== f.from) { console.log(`  ⚠ ${w.uid} activePrograms[${f.index}] changed since plan (was "${f.from}", now "${currentId}") — skipping this entry`); skippedAny = true; return; }
      activePrograms[f.index] = { ...current, id: f.to, templateId: f.to };
    });

    const applyField = <T extends TrackEntry | DomainEntry>(
      obj: Record<string, T>,
      collapses: CollapsePlan[] | undefined,
      renames: RenamePlan[] | undefined,
      merge: (hash: T, slug: T) => T,
    ) => {
      collapses?.forEach((c) => {
        const freshHash = obj[c.hashKey] as T | undefined;
        const freshSlug = obj[c.slugKey] as T | undefined;
        if (!freshHash || !freshSlug || (freshHash.currentLevel ?? 0) !== (freshSlug.currentLevel ?? 0)) {
          console.log(`  ⚠ ${w.uid} ${c.hashKey}/${c.slugKey} changed since plan — skipping this collapse`);
          skippedAny = true;
          return;
        }
        obj[c.slugKey] = merge(freshHash, freshSlug);
        delete obj[c.hashKey];
      });
      renames?.forEach((r) => {
        if (!(r.hashKey in obj) || r.slugKey in obj) {
          console.log(`  ⚠ ${w.uid} ${r.hashKey}→${r.slugKey} changed since plan — skipping this rename`);
          skippedAny = true;
          return;
        }
        obj[r.slugKey] = obj[r.hashKey];
        delete obj[r.hashKey];
      });
    };

    applyField(tracks, w.tracksCollapse, w.tracksRename, mergeTrackEntries);
    applyField(domains, w.domainsCollapse, w.domainsRename, mergeDomainEntries);

    await ref.update({
      'progression.tracks': tracks,
      'progression.domains': domains,
      'progression.activePrograms': activePrograms,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    written++;
    console.log(`  ✓ ${w.uid}${skippedAny ? ' (partial — see warnings above)' : ''}`);
  }

  console.log(`\nDone. ${written}/${planned.length} doc(s) written. Backup remains at ${BACKUP_PATH} — keep it until you've verified the result.`);
}

main().catch((err) => { console.error('Script failed:', err); process.exit(1); });
