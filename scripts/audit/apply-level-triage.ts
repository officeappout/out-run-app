/**
 * scripts/audit/apply-level-triage.ts
 *
 * Applies the "Group B" level fixes from docs/workout-engine/03-LEVEL-TRIAGE.md —
 * 20 real exercises that are missing both `targetPrograms` and `programIds`, and
 * therefore silently resolve to `recommendedLevel || 1` at generation time
 * (workout-selection.utils.ts:95-97). See 01-MAP.md §8 for the level-scale
 * background and 02-CATALOG-AUDIT.md for how these 20 were found.
 *
 * ── SAFETY MODEL ─────────────────────────────────────────────────────────────
 * DEFAULT (no flags): DRY RUN. Reads Firestore, prints a diff, writes NOTHING.
 * `--apply`: writes for real. Before touching any document, it first writes a
 *   full-document JSON backup to scripts/_backups/level-triage/<runId>/ (one file
 *   per touched doc + a manifest) — gitignored, per this repo's existing
 *   `scripts/_backups/` convention (.gitignore:64). If the backup write for a
 *   document fails, that document is skipped — never written without a backup.
 * `--apply --limit N`: apply to only the first N candidates (for a staged rollout
 *   / smoke test instead of all 20 at once).
 *
 * ── WHY THE GROUP-B LIST IS HARDCODED HERE, NOT PARSED FROM THE .md ─────────
 * 03-LEVEL-TRIAGE.md is prose meant for a human to read and approve. Parsing a
 * markdown table at runtime to drive a write to a live, paying product is a
 * fragile coupling — a harmless doc-formatting edit could silently corrupt what
 * gets written. GROUP_B below is a statically-typed, reviewable mirror of that
 * report's Group B table (verified against live data on 2026-09-03) — the
 * report is the source of the *reasoning*, this array is the deliberately
 * separate, explicit source of the *write*. Documented as a deviation in
 * 03-CHANGES.md, not a silent choice.
 *
 * ── WHAT IT ACTUALLY CHANGES ─────────────────────────────────────────────────
 * For each Group-B exercise, appends exactly one entry to `targetPrograms`
 * (currently empty/absent for all 20 — re-verified live before every write, see
 * below) via `FieldValue.arrayUnion`, per axioms.md §5 ("array append —
 * FieldValue.arrayUnion, never overwrite the whole array"). Also stamps
 * `updatedAt: FieldValue.serverTimestamp()` per axioms.md §5. Nothing else on
 * the document is touched.
 *
 * ── LIVE RE-VERIFICATION BEFORE WRITE ────────────────────────────────────────
 * Before writing (in --apply mode) or diffing (dry run), each document is
 * re-fetched fresh. If `targetPrograms` is no longer empty (someone already
 * fixed it, or the content changed since the audit), that document is SKIPPED
 * with a loud warning — never silently overwritten. The script trusts what it
 * reads from Firestore right now, not the frozen audit snapshot.
 *
 * Run (dry run, default):  npx tsx scripts/audit/apply-level-triage.ts
 * Run (apply for real):    npx tsx scripts/audit/apply-level-triage.ts --apply
 * Run (apply, first 3):    npx tsx scripts/audit/apply-level-triage.ts --apply --limit 3
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// GROUP B — mirrors docs/workout-engine/03-LEVEL-TRIAGE.md "Group B" table
// ============================================================================

type ProgramSlug = 'push' | 'pull' | 'legs' | 'core';

interface GroupBEntry {
  id: string;
  name: string; // for human-readable diff/log output only — not written
  programSlug: ProgramSlug;
  level: number;
  justification: string; // for human-readable diff/log output only — not written
}

const GROUP_B: GroupBEntry[] = [
  { id: '5LhNqpOowBF268tFTDz7', name: 'פיסטול סקוואט שלילי שמאל', programSlug: 'legs', level: 8,
    justification: 'בין "פיסטול סקוואט מוגבה" L9 ל"החזקת פיסטול סקוואט" L7' },
  { id: 'i5JiWYzTrmtMbpwN207A', name: 'פיסטול סקוואט שלילי ימין', programSlug: 'legs', level: 8,
    justification: 'זהה לצד שמאל' },
  { id: '7mRRX85Hfx5sQ6oCl7YE', name: 'סקוואט בולגרי עם קפיצה על ספה', programSlug: 'legs', level: 9,
    justification: 'מעל "לאנג׳ בולגרי" L5 ו"סקוואט קפיצה" L3 — חד-רגלי+פליומטרי' },
  { id: '4kww5BB13UkNaaAjZKS0', name: 'סמוך קום', programSlug: 'push', level: 6,
    justification: 'מעל "שכיבות סמיכה" L5 — בורפי מלא' },
  { id: '3dIrpJQHp5QbimPVTZDk', name: 'חצי סמוך קום', programSlug: 'push', level: 3,
    justification: 'פשוט מ"סמוך קום" המלא (L6)' },
  { id: 'f4ZbXHOaV5lRTC9JQPkk', name: 'סמוך קום עם שכיבת סמיכה', programSlug: 'push', level: 7,
    justification: 'מעל "סמוך קום" הבסיסי (L6)' },
  { id: 'nunGVGOEmOMnxiwh7jcu', name: 'סמוך קום מתחילים', programSlug: 'push', level: 2,
    justification: 'גרסת מתחילים מפורשת — קרוב ל"שכיבות סמיכה ב-60°" L1' },
  { id: 'EnS9ade12iVKtUEDuiGW', name: 'שכיבות סמיכה לשכמות', programSlug: 'push', level: 3,
    justification: 'מתחת ל"מתח שכמות" L5 (תלייה), מעל שכיבות סמיכה משופעות בסיסיות' },
  { id: 'wfgHCel9MyopaIXRQS8D', name: 'עליות תאומים על מדרגה', programSlug: 'legs', level: 2,
    justification: 'בין "עליות תאומים" L1 ל"הרמות תאומים טווח מלא" L3' },
  { id: 'PUIZw7xWhCCzSDK8LecV', name: 'סקוואט כנגד קיר', programSlug: 'legs', level: 1,
    justification: 'תואם "סקוואט בעזרת רצועות" L1 / "לאנג׳ קדמי" L1' },
  { id: 'zXXMkiGHRGQH66J09OYs', name: 'סקוואט סטטי כנגד קיר', programSlug: 'legs', level: 1,
    justification: 'זהה ל"סקוואט כנגד קיר" — אותה תנוחה נתמכת, סטטית' },
  { id: 'CQtZDiAEvfNB8khudfsG', name: 'פשיטת מרפקים יד מאחורי הראש בהתנגדות גומיה', programSlug: 'push', level: 2,
    justification: 'בידוד טרייספס — מתחת לתרגילי גומייה מורכבים יותר (L3-L4)' },
  { id: 'niIBVtXV75LjFsWNJp0k', name: 'פשיטת מרפקים בהתנגדות גומיה', programSlug: 'push', level: 2,
    justification: 'זהה לתרגיל הקודם, ניסוח אחר' },
  { id: 'LitmztKbOSD9MvQwBDsE', name: 'כפיפת כתף בהתנגדות גומיה', programSlug: 'push', level: 2,
    justification: 'בידוד — אותה רמה כמו תרגילי הטרייספס בגומייה' },
  { id: 'UmPbE7WydxjOSw5UlDIT', name: 'כפיפת מרפקים בהתנגדות גומיה', programSlug: 'pull', level: 2,
    justification: 'בידוד ביצפס — מתחת ל"דדליפט רומני בהתנגדות גומייה" L3' },
  { id: 'Vr2htqrpnuBObpjzzzyj', name: 'לחיצת חזה בשכיבה בהתנגדות גומיה', programSlug: 'push', level: 3,
    justification: 'תואם "סקוואט כנגד גומייה" L4 / "כפיפת ברך כנגד גומייה" L4' },
  { id: 'TZMFGuNweuAnTLIjyhkx', name: 'לחיצת כתפיים בהתנגות גומייה', programSlug: 'push', level: 3,
    justification: 'אותה רמה כמו לחיצת חזה בגומייה' },
  { id: 'ZovShNVtJBRPgdwsngxr', name: 'חתירות בעמידה בהתנגדות גומיה', programSlug: 'pull', level: 3,
    justification: 'תואם "דדליפט רומני בהתנגדות גומייה" L3' },
  { id: 'gGlZXMEjhAXTxxmO3hTN', name: 'שכיבות סמיכה בהתנגדות גומיה', programSlug: 'push', level: 6,
    justification: 'מעל "שכיבות סמיכה" L5 — גומייה כאן מוסיפה עומס, לא מקלה' },
  { id: 'nrPxCJYZtHAyRF6Iywry', name: 'סקוואט+לחיצת כפתיים בהתנגדות גומיה', programSlug: 'legs', level: 4,
    justification: 'מעל "סקוואט כנגד גומייה" L4 — רכיב לחיצה נוסף' },
];

// ============================================================================
// CLI ARGS
// ============================================================================

const APPLY = process.argv.includes('--apply');
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

async function main() {
  initFirebase();
  const db = admin.firestore();

  console.log(APPLY
    ? `\n⚠️  --apply mode. Will WRITE to Firestore (up to ${Math.min(LIMIT, GROUP_B.length)} of ${GROUP_B.length} candidates), after backing up each touched document.\n`
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

  const manifest: Array<{ id: string; name: string; backupFile: string; written: boolean; error?: string }> = [];
  let applied = 0;
  let skippedDrift = 0;
  let skippedMissing = 0;

  const candidates = GROUP_B.slice(0, LIMIT);

  for (const entry of candidates) {
    const docRef = db.collection('exercises').doc(entry.id);
    const snap = await docRef.get();

    if (!snap.exists) {
      console.log(`⛔ SKIP ${entry.name} (${entry.id}) — document no longer exists.`);
      skippedMissing++;
      continue;
    }

    const data = snap.data() as any;
    const currentTargetPrograms = Array.isArray(data.targetPrograms) ? data.targetPrograms : [];
    const currentProgramIds = Array.isArray(data.programIds) ? data.programIds : [];

    // Live re-verification: only touch documents that are STILL exactly what the
    // audit found (empty targetPrograms AND empty programIds). If either is now
    // non-empty, someone/something changed this doc since the audit ran — skip
    // rather than risk clobbering a manual fix or unrelated edit.
    if (currentTargetPrograms.length > 0 || currentProgramIds.length > 0) {
      console.log(`⚠️  SKIP ${entry.name} (${entry.id}) — no longer empty (targetPrograms=${currentTargetPrograms.length}, programIds=${currentProgramIds.length}). Re-audit before touching this one.`);
      skippedDrift++;
      continue;
    }

    const programId = slugToId.get(entry.programSlug)!;
    const newEntry = { programId, level: entry.level };

    console.log(`── ${entry.name} (${entry.id})`);
    console.log(`   targetPrograms: [] → [ { programId: '${programId}' /* ${entry.programSlug} */, level: ${entry.level} } ]`);
    console.log(`   reason: ${entry.justification}`);

    if (!APPLY) {
      console.log('   (dry run — not written)\n');
      continue;
    }

    // ── Backup BEFORE write, one file per document ──────────────────────────
    const backupFile = path.join(backupDir!, `${entry.id}.json`);
    let backupOk = false;
    try {
      fs.writeFileSync(backupFile, JSON.stringify({ id: entry.id, backedUpAt: new Date().toISOString(), data }, null, 2), 'utf-8');
      backupOk = true;
    } catch (e: any) {
      console.log(`   ❌ BACKUP FAILED (${e.message}) — refusing to write without a backup. Skipping.\n`);
      manifest.push({ id: entry.id, name: entry.name, backupFile, written: false, error: `backup failed: ${e.message}` });
      continue;
    }

    // ── Write — arrayUnion per axioms.md §5 (never overwrite the whole array) ──
    try {
      await docRef.update({
        targetPrograms: admin.firestore.FieldValue.arrayUnion(newEntry),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      console.log('   ✅ written\n');
      applied++;
      manifest.push({ id: entry.id, name: entry.name, backupFile, written: true });
    } catch (e: any) {
      console.log(`   ❌ WRITE FAILED: ${e.message}\n`);
      manifest.push({ id: entry.id, name: entry.name, backupFile, written: false, error: e.message });
    }
  }

  if (backupDir) {
    fs.writeFileSync(path.join(backupDir, '_manifest.json'), JSON.stringify({ runId, appliedAt: new Date().toISOString(), manifest }, null, 2), 'utf-8');
  }

  console.log('─'.repeat(60));
  if (APPLY) {
    console.log(`Applied: ${applied} | Skipped (drift since audit): ${skippedDrift} | Skipped (doc missing): ${skippedMissing} | Total candidates: ${candidates.length}`);
    if (backupDir) console.log(`Backups: ${backupDir}`);
    console.log(`\nTo roll back a single document, restore its "data" object from the backup JSON via`);
    console.log(`docRef.set(backup.data) — do NOT restore the whole snapshot blindly if the doc has`);
    console.log(`been edited again since; diff first. See 03-CHANGES.md for the full rollback procedure.`);
  } else {
    console.log(`Dry run complete. ${candidates.length - skippedDrift - skippedMissing} of ${candidates.length} candidates would be written.`);
    console.log(`Skipped (already has data, re-audit first): ${skippedDrift} | Skipped (doc missing): ${skippedMissing}`);
    console.log(`\nRun with --apply once you've approved 03-LEVEL-TRIAGE.md's Group B section.`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
