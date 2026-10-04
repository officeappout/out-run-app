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
 * It builds the full plan, prints a report, and backs up every document it
 * would touch to a local JSON file — then stops. Pass --confirm to
 * actually write (still backs up first, same file). Idempotent: re-running
 * after a successful write detects the now-clean state and reports 0
 * remaining targets for whichever finding was already resolved.
 *
 * Three findings, matching the audit's Stage 9 scope exactly:
 *
 *   (a) activePrograms[].templateId still a raw Firestore hash (the
 *       "legendary templateId bug" — never fixed retroactively by Stages
 *       5-8, which only stopped NEW occurrences). Rewrites the array
 *       entry's id/templateId to its resolved slug. Read-only field
 *       (name/startDate/etc.) is otherwise untouched.
 *
 *   (b) DUAL-KEYED progression.tracks/domains: a hash key AND its slug
 *       sibling both exist for the same program (recalculateMasterLevel's
 *       pre-Stage-7 dual-write). Collapsed to slug-only — but ONLY when
 *       both keys agree on currentLevel. A disagreement is NOT
 *       auto-resolved: it's a signal of prior corruption and is reported
 *       separately, under NEEDS MANUAL REVIEW, excluded from the write set
 *       entirely (per the audit's explicit instruction).
 *
 *   (c) HASH-ONLY progression.tracks/domains: a hash key exists with NO
 *       slug sibling at all (the pre-Stage-7 admin-enroll gap — a leaf
 *       child written only under its raw hash). Renamed in place to its
 *       slug key (old key deleted, value moved) — there is no "other key"
 *       to disagree with here, so this is always safe once the hash
 *       resolves to a real, known slug.
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

interface PlannedUserWrite {
  uid: string;
  activeProgramsFix?: { index: number; from: string; to: string }[];
  tracksCollapse?: { hashKey: string; slugKey: string; level: number }[];
  domainsCollapse?: { hashKey: string; slugKey: string; level: number }[];
  tracksRename?: { hashKey: string; slugKey: string }[];
  domainsRename?: { hashKey: string; slugKey: string }[];
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
  const backupDocs: Record<string, unknown> = {};

  const isRawHash = (key: string) => idToSlug.has(key);

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    const data = userDoc.data();
    const progression = data.progression ?? {};
    const tracks: Record<string, { currentLevel?: number }> = progression.tracks ?? {};
    const domains: Record<string, { currentLevel?: number }> = progression.domains ?? {};
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
    const scanField = (
      field: 'tracks' | 'domains',
      obj: Record<string, { currentLevel?: number }>,
    ): { collapse: { hashKey: string; slugKey: string; level: number }[]; rename: { hashKey: string; slugKey: string }[] } => {
      const collapse: { hashKey: string; slugKey: string; level: number }[] = [];
      const rename: { hashKey: string; slugKey: string }[] = [];

      for (const hashKey of Object.keys(obj)) {
        if (!isRawHash(hashKey)) continue; // already a slug key
        const slugKey = idToSlug.get(hashKey)!;
        if (slugKey === hashKey) continue; // defensive — formula returned the id itself, nothing to do
        const hashLevel = obj[hashKey]?.currentLevel ?? 0;

        if (Object.prototype.hasOwnProperty.call(obj, slugKey)) {
          // Dual-keyed — both exist. Only safe to collapse if they agree.
          const slugLevel = obj[slugKey]?.currentLevel ?? 0;
          if (hashLevel === slugLevel) {
            collapse.push({ hashKey, slugKey, level: slugLevel });
          } else {
            manualReview.push({ uid, field, hashKey, slugKey, hashLevel, slugLevel });
          }
        } else {
          // Hash-only — no slug sibling. Safe rename, nothing to disagree with.
          rename.push({ hashKey, slugKey });
        }
      }
      return { collapse, rename };
    };

    const tracksScan = scanField('tracks', tracks);
    if (tracksScan.collapse.length > 0) { write.tracksCollapse = tracksScan.collapse; touched = true; }
    if (tracksScan.rename.length > 0) { write.tracksRename = tracksScan.rename; touched = true; }

    const domainsScan = scanField('domains', domains);
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
    w.tracksCollapse?.forEach(c => console.log(`  tracks.${c.hashKey} + tracks.${c.slugKey} (both L${c.level}) → collapse to tracks.${c.slugKey} only`));
    w.domainsCollapse?.forEach(c => console.log(`  domains.${c.hashKey} + domains.${c.slugKey} (both L${c.level}) → collapse to domains.${c.slugKey} only`));
    w.tracksRename?.forEach(r => console.log(`  tracks.${r.hashKey} → renamed to tracks.${r.slugKey} (no prior slug entry)`));
    w.domainsRename?.forEach(r => console.log(`  domains.${r.hashKey} → renamed to domains.${r.slugKey} (no prior slug entry)`));
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`NEEDS MANUAL REVIEW: ${manualReview.length} entrie(s) — hash and slug keys DISAGREE on level. NOT included in any write. Resolve by hand first.`);
  console.log('='.repeat(78));
  for (const m of manualReview) {
    console.log(`  ${m.uid}: ${m.field}.${m.hashKey}=L${m.hashLevel} vs ${m.field}.${m.slugKey}=L${m.slugLevel}`);
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`UNRESOLVED (hash-shaped key, no matching program doc): ${unresolved.length} — skipped, needs investigation, not guessed at.`);
  console.log('='.repeat(78));
  for (const u of unresolved) {
    console.log(`  ${u.uid}: ${u.field}.${u.key}`);
  }

  console.log(`\n${'='.repeat(78)}`);
  console.log(`SUMMARY: ${planned.length} doc(s) to write, ${manualReview.length} flagged for manual review, ${unresolved.length} unresolved hash(es) skipped.`);
  console.log('='.repeat(78));

  if (planned.length === 0) {
    console.log('\nNothing to write. Done.');
    return;
  }

  // ── Backup before any write, dry-run or not ─────────────────────────────
  fs.writeFileSync(BACKUP_PATH, JSON.stringify(backupDocs, null, 2));
  console.log(`\nBacked up ${Object.keys(backupDocs).length} full user doc(s) to:\n  ${BACKUP_PATH}`);

  if (!CONFIRM) {
    console.log('\nDRY RUN complete — no writes made. Re-run with --confirm to apply the plan above.');
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
    const tracks: Record<string, unknown> = { ...(progression.tracks ?? {}) };
    const domains: Record<string, unknown> = { ...(progression.domains ?? {}) };
    const activePrograms: Array<{ id?: string; templateId?: string }> = [...(progression.activePrograms ?? [])];

    // Re-verify each targeted field still matches what the plan assumed —
    // skip + warn instead of overwriting if something changed it since.
    let skippedAny = false;

    w.activeProgramsFix?.forEach((f) => {
      const current = activePrograms[f.index];
      const currentId = current?.templateId ?? current?.id;
      if (currentId !== f.from) { console.log(`  ⚠ ${w.uid} activePrograms[${f.index}] changed since plan (was "${f.from}", now "${currentId}") — skipping this entry`); skippedAny = true; return; }
      activePrograms[f.index] = { ...current, id: f.to, templateId: f.to };
    });

    for (const [obj, collapses, renames] of [
      [tracks, w.tracksCollapse, w.tracksRename],
      [domains, w.domainsCollapse, w.domainsRename],
    ] as const) {
      collapses?.forEach((c) => {
        const h = (obj[c.hashKey] as { currentLevel?: number } | undefined)?.currentLevel ?? 0;
        const s = (obj[c.slugKey] as { currentLevel?: number } | undefined)?.currentLevel ?? 0;
        if (h !== c.level || s !== c.level) { console.log(`  ⚠ ${w.uid} ${c.hashKey}/${c.slugKey} changed since plan — skipping this collapse`); skippedAny = true; return; }
        delete obj[c.hashKey];
      });
      renames?.forEach((r) => {
        if (!(r.hashKey in obj) || r.slugKey in obj) { console.log(`  ⚠ ${w.uid} ${r.hashKey}→${r.slugKey} changed since plan — skipping this rename`); skippedAny = true; return; }
        obj[r.slugKey] = obj[r.hashKey];
        delete obj[r.hashKey];
      });
    }

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
