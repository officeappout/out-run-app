/**
 * ⚠️ NOT EXECUTED — kept as documentation only, do not run.
 *
 * David reviewed the catalog manually and assigned levels himself to all 12
 * approved exercises, by hand, directly in Firestore — different values in
 * several cases from what this script proposes below. This script's
 * `--apply` was never run against production. It is retained in the repo
 * purely as a historical record of the reasoning/comparables that went into
 * the original proposal (docs/workout-engine/03-LEVEL-TRIAGE.md Part 1),
 * not as something to execute. See docs/workout-engine/04-VERIFY.md for what
 * David's actual hand-entered values turned out to be, verified against the
 * live catalog, and docs/workout-engine/03-CHANGES.md for the full story.
 *
 * If you're tempted to run this: don't. Re-check 04-VERIFY.md first — the
 * live data has already diverged from the GROUP_B array below by design.
 *
 * ────────────────────────────────────────────────────────────────────────
 *
 * scripts/audit/apply-level-triage.ts
 *
 * Applies David's approved subset of the "Group B" level fixes from
 * docs/workout-engine/03-LEVEL-TRIAGE.md, as narrowed by his decisions in
 * 00-PLAN.md §12 (12 approved items, down from the original 20 — see §12.1-12.4):
 *   - 4 "סמוך קום" (burpee) variants REMOVED: they're heart-rate/conditioning
 *     content, not a push progression (§12.1) — a push L6 burpee would have
 *     stolen a slot from a real push-up progression.
 *   - 9 resistance-band exercises REMOVED: they're a dumbbell substitute and
 *     the generator has no load-tracking mechanism yet — intentionally frozen,
 *     not tagged (§12.2). Still visible in the admin "unreachable exercises"
 *     screen (Part 3) as unused content, not silently dropped from view.
 *   - 2 junk records (the empty-name/no-execution-method doc, the "עותק של..."
 *     duplicate) were never in this list — see 03-LEVEL-TRIAGE.md Part 1c.
 *   - 5 core-exercise entries ADDED (from 03-LEVEL-TRIAGE.md Part 1b1/1b2):
 *     3 plank-family fixes (already have OTHER program levels — this only
 *     appends a core entry) + 2 tagging+level fixes (אופניים, עליות נגיעה
 *     בבהונות בשכיבה — currently invisible to the core detector entirely;
 *     writes movementGroup+primaryMuscle in addition to targetPrograms).
 *
 * PENDING_CANDIDATES (separate from GROUP_B, always shown in the dry-run diff
 * but requires --include-pending to ever be written): "עמידת כלב רגל ויד
 * נגדית" (bird dog) — a third exercise found during this pass where the
 * canonical core detector misses it entirely, same pattern as the 2 items
 * above. David asked for this to be surfaced separately for his own
 * approve/reject, not silently folded into the approved 12.
 *
 * ── SAFETY MODEL ─────────────────────────────────────────────────────────────
 * DEFAULT (no flags): DRY RUN. Reads Firestore, prints a diff for GROUP_B AND
 *   PENDING_CANDIDATES, writes NOTHING.
 * `--apply`: writes GROUP_B for real (PENDING_CANDIDATES still excluded unless
 *   --include-pending is also passed). Before touching any document, writes a
 *   full-document JSON backup to scripts/_backups/level-triage/<runId>/ (one
 *   file per touched doc + a manifest) — gitignored, per this repo's existing
 *   `scripts/_backups/` convention (.gitignore:64). If the backup write for a
 *   document fails, that document is skipped — never written without a backup.
 * `--include-pending`: also write PENDING_CANDIDATES (bird dog) — pass this
 *   only after you've reviewed and approved its proposed core level/tagging
 *   in the dry-run output or 03-LEVEL-TRIAGE.md.
 * `--apply --limit N`: apply to only the first N GROUP_B candidates (staged
 *   rollout / smoke test). Does not affect PENDING_CANDIDATES.
 *
 * ── WHY THE LIST IS HARDCODED HERE, NOT PARSED FROM THE .md ─────────────────
 * 03-LEVEL-TRIAGE.md and 00-PLAN.md are prose meant for a human to read and
 * approve. Parsing markdown at runtime to drive a write to a live, paying
 * product is a fragile coupling — a harmless doc-formatting edit could
 * silently corrupt what gets written. The arrays below are a statically-typed,
 * reviewable mirror of David's approved decisions (00-PLAN.md §12.4, verified
 * against live data on 2026-09-03) — the docs are the source of the
 * *reasoning*, these arrays are the deliberately separate, explicit source of
 * the *write*.
 *
 * ── WHAT IT ACTUALLY CHANGES ─────────────────────────────────────────────────
 * For each entry: appends exactly one entry to `targetPrograms` via
 * `FieldValue.arrayUnion`, per axioms.md §5 ("array append — FieldValue.
 * arrayUnion, never overwrite the whole array"). For entries with `tagFix`
 * (אופניים, עליות נגיעה בבהונות בשכיבה, and bird dog if approved), also sets
 * `movementGroup`/`primaryMuscle` as plain field writes (not arrays — a
 * direct overwrite is correct here, these are singular string fields).
 * Always stamps `updatedAt: FieldValue.serverTimestamp()` per axioms.md §5.
 * Nothing else on any document is touched.
 *
 * ── LIVE RE-VERIFICATION BEFORE WRITE ────────────────────────────────────────
 * Before writing (in --apply mode) or diffing (dry run), each document is
 * re-fetched fresh. Unlike the original 20-item version of this script, the
 * check is now per-programId, not "the whole targetPrograms array must be
 * empty" — the 3 plank-family entries legitimately already have OTHER
 * program levels (that's expected and correct), we're only adding a core
 * entry. So: skip a document only if it ALREADY has a targetPrograms entry
 * for the target programId (idempotent — never double-add), or if a tagFix
 * entry's movementGroup/primaryMuscle is no longer null (someone/something
 * changed it since the audit — never clobber an unexpected change).
 *
 * Run (dry run, default):        npx tsx scripts/audit/apply-level-triage.ts
 * Run (apply the approved 12):   npx tsx scripts/audit/apply-level-triage.ts --apply
 * Run (apply first 3, staged):   npx tsx scripts/audit/apply-level-triage.ts --apply --limit 3
 * Run (also write bird dog):     npx tsx scripts/audit/apply-level-triage.ts --apply --include-pending
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// GROUP B — the 12 approved items (00-PLAN.md §12.4) + 1 pending candidate
// ============================================================================

type ProgramSlug = 'push' | 'pull' | 'legs' | 'core';

interface GroupBEntry {
  id: string;
  name: string; // for human-readable diff/log output only — not written
  programSlug: ProgramSlug;
  level: number;
  justification: string; // for human-readable diff/log output only — not written
  /** Set for exercises the canonical core detector currently misses entirely
   *  (movementGroup/primaryMuscle both null) — writes these plain fields in
   *  addition to targetPrograms. */
  tagFix?: { movementGroup: string; primaryMuscle: string };
  /** Shown as a caution banner in the diff — still part of GROUP_B (David's
   *  approved list includes it), but he flagged it as needing a second look
   *  before the actual --apply run (00-PLAN.md §12.4 row 7). */
  needsReview?: string;
}

const GROUP_B: GroupBEntry[] = [
  { id: '5LhNqpOowBF268tFTDz7', name: 'פיסטול סקוואט שלילי שמאל', programSlug: 'legs', level: 8,
    justification: 'בין "פיסטול סקוואט מוגבה" L9 ל"החזקת פיסטול סקוואט" L7' },
  { id: 'i5JiWYzTrmtMbpwN207A', name: 'פיסטול סקוואט שלילי ימין', programSlug: 'legs', level: 8,
    justification: 'זהה לצד שמאל' },
  { id: '7mRRX85Hfx5sQ6oCl7YE', name: 'סקוואט בולגרי עם קפיצה על ספה', programSlug: 'legs', level: 9,
    justification: 'מעל "לאנג׳ בולגרי" L5 ו"סקוואט קפיצה" L3 — חד-רגלי+פליומטרי' },
  { id: 'wfgHCel9MyopaIXRQS8D', name: 'עליות תאומים על מדרגה', programSlug: 'legs', level: 2,
    justification: 'בין "עליות תאומים" L1 ל"הרמות תאומים טווח מלא" L3' },
  { id: 'PUIZw7xWhCCzSDK8LecV', name: 'סקוואט כנגד קיר', programSlug: 'legs', level: 1,
    justification: 'תואם "סקוואט בעזרת רצועות" L1 / "לאנג׳ קדמי" L1' },
  { id: 'zXXMkiGHRGQH66J09OYs', name: 'סקוואט סטטי כנגד קיר', programSlug: 'legs', level: 1,
    justification: 'זהה ל"סקוואט כנגד קיר" — אותה תנוחה נתמכת, סטטית' },
  { id: 'EnS9ade12iVKtUEDuiGW', name: 'שכיבות סמיכה לשכמות', programSlug: 'push', level: 3,
    justification: 'מתחת ל"מתח שכמות" L5 (תלייה), מעל שכיבות סמיכה משופעות בסיסיות',
    needsReview: '00-PLAN.md §12.4 row 7: David flagged this as possibly activation/warmup content rather than a real push progression — confirm before applying, don\'t assume the ✅ of the others.' },
  { id: 'FHh3m3suMMtoLk1PrxYv', name: 'פלאנק', programSlug: 'core', level: 2,
    justification: 'סולם ליבה: כפיפות בטן L2, קראנץ L2 — פלאנק בסיסי באותה רמת מתחילים. (יש לו כבר push L2 / full_body L2 / upper_body L2 — מוסיפים רק ערך core, לא נוגעים באחרים)' },
  { id: 'iEZGhtBNV7Tv5iNuT70E', name: 'פלאנק על הברכיים', programSlug: 'core', level: 1,
    justification: 'רגרסיה של פלאנק מלא (L2 מוצע) — קל ממנו. (יש לו כבר push L1)' },
  { id: 'BWbscvj0m3hvxghEMtKV', name: 'פלאנק עליות ונגיעות בכתפיים', programSlug: 'core', level: 4,
    justification: 'וריאציית אנטי-רוטציה, קשה מפלאנק סטטי — תואם "מספרים בשכיבה" L4. (יש לו כבר push L3)' },
  { id: 'BcsFnuiLx1fZY2SIVhoC', name: 'אופניים', programSlug: 'core', level: 3,
    justification: 'תואם "כפיפות בטן אלכסונים" L3 / "פינגווינים" L3 — תנועה רוטציונית דומה',
    tagFix: { movementGroup: 'core', primaryMuscle: 'abs' } },
  { id: 'DU3SwZWr6uy75WI7T4jB', name: 'עליות נגיעה בבהונות בשכיבה', programSlug: 'core', level: 5,
    justification: 'תואם "עליות רגליים בשכיבה" L5 / "עליות מספרים בשכיבה" L5 — משפחת הרמת-רגליים בשכיבה',
    tagFix: { movementGroup: 'core', primaryMuscle: 'abs' } },
];

// Found during this pass, NOT part of David's original approved list — a
// third exercise the canonical core detector misses entirely (same pattern
// as אופניים / עליות נגיעה בבהונות). Always diffed, never written unless
// --include-pending is explicitly passed.
const PENDING_CANDIDATES: GroupBEntry[] = [
  { id: 'hECufw1PU0a0lcUEadY9', name: 'עמידת כלב רגל ויד נגדית', programSlug: 'core', level: 2,
    justification: 'תרגיל יציבות אנטי-רוטציה בסיסי (bird dog) — עומס דומה לפלאנק רגיל (L2 מוצע לעיל): שניהם "החזק את הליבה בזמן תזוזת גפיים" ברמת מתחילים. אין השוואה ישירה במאגר — הצעה זהירה.',
    tagFix: { movementGroup: 'core', primaryMuscle: 'abs' } },
];

// ============================================================================
// CLI ARGS
// ============================================================================

const APPLY = process.argv.includes('--apply');
const INCLUDE_PENDING = process.argv.includes('--include-pending');
const limitIdx = process.argv.indexOf('--limit');
const LIMIT = limitIdx !== -1 ? parseInt(process.argv[limitIdx + 1], 10) : GROUP_B.length;

// ============================================================================
// FIREBASE
// ============================================================================

function initFirebase() {
  if (admin.apps.length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY not set in .env.local');
  const c = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(c as any), projectId: c.project_id });
}

const BACKUP_ROOT = path.join(__dirname, '..', '_backups', 'level-triage');

interface RunStats {
  applied: number;
  skippedDrift: number;
  skippedMissing: number;
  manifest: Array<{ id: string; name: string; backupFile?: string; written: boolean; error?: string }>;
}

async function processEntry(
  entry: GroupBEntry,
  db: FirebaseFirestore.Firestore,
  slugToId: Map<string, ProgramSlug extends string ? string : never> | Map<string, string>,
  shouldWrite: boolean,
  backupDir: string | null,
  stats: RunStats,
  sectionLabel: string,
) {
  const docRef = db.collection('exercises').doc(entry.id);
  const snap = await docRef.get();

  if (!snap.exists) {
    console.log(`⛔ SKIP [${sectionLabel}] ${entry.name} (${entry.id}) — document no longer exists.`);
    stats.skippedMissing++;
    return;
  }

  const data = snap.data() as any;
  const currentTargetPrograms: any[] = Array.isArray(data.targetPrograms) ? data.targetPrograms : [];
  const programId = slugToId.get(entry.programSlug)!;

  // Idempotency / drift guard, per-programId (NOT "whole array must be empty" —
  // several entries here legitimately already have OTHER program levels).
  const alreadyHasThisProgram = currentTargetPrograms.some((tp: any) => tp?.programId === programId);
  if (alreadyHasThisProgram) {
    console.log(`⚠️  SKIP [${sectionLabel}] ${entry.name} (${entry.id}) — already has a targetPrograms entry for ${entry.programSlug} (${programId}). Idempotency guard — not double-adding.`);
    stats.skippedDrift++;
    return;
  }

  // tagFix drift guard: only write movementGroup/primaryMuscle if they're
  // still null/unset, exactly as the audit found them. Never clobber a
  // change made since.
  let tagFixDrifted = false;
  if (entry.tagFix) {
    if (data.movementGroup != null || data.primaryMuscle != null) {
      tagFixDrifted = true;
      console.log(`⚠️  SKIP [${sectionLabel}] ${entry.name} (${entry.id}) — tagFix expected null movementGroup/primaryMuscle, found movementGroup=${JSON.stringify(data.movementGroup)}, primaryMuscle=${JSON.stringify(data.primaryMuscle)}. Re-audit before touching this one.`);
      stats.skippedDrift++;
      return;
    }
  }

  const newEntry = { programId, level: entry.level };

  console.log(`── [${sectionLabel}] ${entry.name} (${entry.id})`);
  console.log(`   targetPrograms: += { programId: '${programId}' /* ${entry.programSlug} */, level: ${entry.level} }  (${currentTargetPrograms.length} existing entr${currentTargetPrograms.length === 1 ? 'y' : 'ies'} untouched)`);
  if (entry.tagFix) {
    console.log(`   movementGroup: ${JSON.stringify(data.movementGroup)} → '${entry.tagFix.movementGroup}'`);
    console.log(`   primaryMuscle: ${JSON.stringify(data.primaryMuscle)} → '${entry.tagFix.primaryMuscle}'`);
  }
  console.log(`   reason: ${entry.justification}`);
  if (entry.needsReview) {
    console.log(`   ⚠️  NEEDS REVIEW: ${entry.needsReview}`);
  }

  if (!shouldWrite) {
    console.log('   (dry run — not written)\n');
    return;
  }

  // ── Backup BEFORE write, one file per document ──────────────────────────
  const backupFile = path.join(backupDir!, `${entry.id}.json`);
  try {
    fs.writeFileSync(backupFile, JSON.stringify({ id: entry.id, backedUpAt: new Date().toISOString(), data }, null, 2), 'utf-8');
  } catch (e: any) {
    console.log(`   ❌ BACKUP FAILED (${e.message}) — refusing to write without a backup. Skipping.\n`);
    stats.manifest.push({ id: entry.id, name: entry.name, written: false, error: `backup failed: ${e.message}` });
    return;
  }

  // ── Write — arrayUnion for the array field, plain set for tagFix, per
  //    axioms.md §5 (never overwrite a whole array directly) ──────────────
  try {
    const update: Record<string, unknown> = {
      targetPrograms: admin.firestore.FieldValue.arrayUnion(newEntry),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    if (entry.tagFix) {
      update.movementGroup = entry.tagFix.movementGroup;
      update.primaryMuscle = entry.tagFix.primaryMuscle;
    }
    await docRef.update(update);
    console.log('   ✅ written\n');
    stats.applied++;
    stats.manifest.push({ id: entry.id, name: entry.name, backupFile, written: true });
  } catch (e: any) {
    console.log(`   ❌ WRITE FAILED: ${e.message}\n`);
    stats.manifest.push({ id: entry.id, name: entry.name, backupFile, written: false, error: e.message });
  }
}

async function main() {
  initFirebase();
  const db = admin.firestore();

  console.log(APPLY
    ? `\n⚠️  --apply mode. Will WRITE to Firestore (up to ${Math.min(LIMIT, GROUP_B.length)} of ${GROUP_B.length} approved candidates${INCLUDE_PENDING ? ` + ${PENDING_CANDIDATES.length} pending` : ''}), after backing up each touched document.\n`
    : `\nDRY RUN (default — pass --apply to write for real). Firestore is read-only in this mode.\n`);

  // Resolve program slugs -> real Firestore program doc IDs, LIVE (never hardcoded —
  // program doc IDs are an operational detail that could differ between environments).
  const progSnap = await db.collection('programs').get();
  const slugToId = new Map<string, string>();
  for (const doc of progSnap.docs) {
    const d = doc.data() as any;
    const slug = d.slug || d.movementPattern;
    if (slug) slugToId.set(slug, doc.id);
  }
  const requiredSlugs: ProgramSlug[] = ['push', 'pull', 'legs', 'core'];
  for (const slug of requiredSlugs) {
    if (!slugToId.has(slug)) {
      throw new Error(`Could not resolve program slug "${slug}" to a Firestore doc ID — aborting, refusing to guess.`);
    }
  }
  console.log('Resolved program slugs:', Object.fromEntries(requiredSlugs.map(s => [s, slugToId.get(s)])), '\n');

  const runId = APPLY ? new Date().toISOString().replace(/[:.]/g, '-') : null;
  const backupDir = runId ? path.join(BACKUP_ROOT, runId) : null;
  if (backupDir) fs.mkdirSync(backupDir, { recursive: true });

  const stats: RunStats = { applied: 0, skippedDrift: 0, skippedMissing: 0, manifest: [] };

  const approvedCandidates = GROUP_B.slice(0, LIMIT);
  console.log(`═══ APPROVED (00-PLAN.md §12.4) — ${approvedCandidates.length} of ${GROUP_B.length} ═══\n`);
  for (const entry of approvedCandidates) {
    await processEntry(entry, db, slugToId, APPLY, backupDir, stats, 'APPROVED');
  }

  console.log(`\n═══ PENDING YOUR APPROVAL — not part of the 12, found during this pass — ${PENDING_CANDIDATES.length} ═══`);
  console.log(APPLY && !INCLUDE_PENDING
    ? '(will NOT be written — pass --include-pending to write these too, after reviewing)\n'
    : '');
  for (const entry of PENDING_CANDIDATES) {
    await processEntry(entry, db, slugToId, APPLY && INCLUDE_PENDING, backupDir, stats, 'PENDING');
  }

  if (backupDir) {
    fs.writeFileSync(path.join(backupDir, '_manifest.json'), JSON.stringify({ runId, appliedAt: new Date().toISOString(), manifest: stats.manifest }, null, 2), 'utf-8');
  }

  console.log('─'.repeat(60));
  if (APPLY) {
    console.log(`Applied: ${stats.applied} | Skipped (drift/idempotent): ${stats.skippedDrift} | Skipped (doc missing): ${stats.skippedMissing}`);
    console.log(`Approved candidates processed: ${approvedCandidates.length}/${GROUP_B.length}${INCLUDE_PENDING ? ` | Pending (bird dog) processed: ${PENDING_CANDIDATES.length}/${PENDING_CANDIDATES.length} (--include-pending was passed)` : ` | Pending (bird dog): NOT processed (pass --include-pending to write it)`}`);
    if (backupDir) console.log(`Backups: ${backupDir}`);
    console.log(`\nTo roll back a single document, restore its "data" object from the backup JSON via`);
    console.log(`docRef.set(backup.data) — do NOT restore the whole snapshot blindly if the doc has`);
    console.log(`been edited again since; diff first. See 03-CHANGES.md for the full rollback procedure.`);
  } else {
    console.log(`Dry run complete.`);
    console.log(`Approved (00-PLAN.md §12.4): ${approvedCandidates.length}/${GROUP_B.length} would be written with --apply.`);
    console.log(`Pending (bird dog, shown above, needs your review): ${PENDING_CANDIDATES.length}/${PENDING_CANDIDATES.length} would be written with --apply --include-pending.`);
    console.log(`Skipped (drift/idempotent): ${stats.skippedDrift} | Skipped (doc missing): ${stats.skippedMissing}`);
    console.log(`\nRun with --apply once you've reviewed this diff. Add --include-pending to also write the bird-dog candidate.`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
