#!/usr/bin/env npx tsx
/**
 * fix-corrupt-program-id.ts
 *
 * One-time migration: replaces the corrupt programId "פ" (single Hebrew letter)
 * everywhere it appears in Firestore with the correct ASCII slug.
 *
 * Background
 * ──────────
 * Before isValidProgramTemplateId() was added to onboarding-sync.service.ts,
 * a corrupt value — a single Hebrew character "פ" — was written as templateId
 * into users.progression.activePrograms[] and as programId into
 * program_thresholds. The display name was derived via
 * result.programId.replace(/_/g, ' '), which left the single character
 * unchanged. Result: the home-screen progress card shows "פ / רמה X/0".
 *
 * What this script fixes
 * ──────────────────────
 *   1. program_thresholds  — docs where programId == "פ"
 *   2. assessment_rules    — docs where action.targetProgramId == "פ"
 *                            OR action.forceProgramId == "פ"
 *   3. users               — progression.activePrograms[].templateId / .name
 *                            progression.domains["פ"]   (key rename)
 *                            progression.tracks["פ"]    (key rename)
 *                            progression.currentProgramId
 *
 * Usage
 * ─────
 *   npx tsx scripts/fix-corrupt-program-id.ts --dry-run
 *   npx tsx scripts/fix-corrupt-program-id.ts --replacement-slug upper_body
 *   npx tsx scripts/fix-corrupt-program-id.ts --replacement-slug upper_body --dry-run
 *
 * Flags
 * ─────
 *   --dry-run                 Default ON. Preview every affected doc with
 *                             before/after values. No Firestore writes.
 *   --replacement-slug <slug> ASCII slug that replaces "פ".
 *                             Default: upper_body (highest-probability match:
 *                             "פ" is the first letter of "פלג גוף עליון").
 *                             Always verify against the threshold doc content
 *                             printed in the dry-run output before committing.
 *
 * Prerequisites
 * ─────────────
 *   GOOGLE_APPLICATION_CREDENTIALS=<path/to/service-account.json>
 *   OR: gcloud auth application-default login
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

// ─── CLI args ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--live') || args.includes('--dry-run');

const slugFlagIdx = args.indexOf('--replacement-slug');
const REPLACEMENT_SLUG =
  slugFlagIdx !== -1 && args[slugFlagIdx + 1]
    ? args[slugFlagIdx + 1]
    : 'upper_body';

const CORRUPT_ID = 'פ';

// ─── Firebase ────────────────────────────────────────────────────────────────

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 1_000;
const COMMIT_BATCH_SIZE = 400;

/** Inline copy of src/lib/utils/program-names.ts so the script has no
 *  Next.js / path-alias dependencies. Keep in sync if names change. */
const PROGRAM_NAME_HE: Record<string, string> = {
  full_body: 'כל הגוף',
  fullbody: 'כל הגוף',
  upper_body: 'פלג גוף עליון',
  push: 'דחיפה',
  pushing: 'דחיפה',
  lower_body: 'רגליים',
  legs: 'רגליים',
  pull: 'משיכה',
  pulling: 'משיכה',
  calisthenics: 'קליסטניקס',
  running: 'ריצה',
  cardio: 'קרדיו',
  pilates: 'פילאטיס',
  yoga: 'יוגה',
  healthy_lifestyle: 'אורח חיים בריא',
  pull_up_pro: 'מתח מקצועי',
};

function hebrewName(slug: string): string {
  return PROGRAM_NAME_HE[slug] ?? slug.replace(/_/g, ' ');
}

// ─── Stats ───────────────────────────────────────────────────────────────────

interface Stats {
  thresholdsFound: number;
  thresholdsFixed: number;
  rulesFound: number;
  rulesFixed: number;
  usersScanned: number;
  usersFound: number;
  usersFixed: number;
  errors: string[];
}

const stats: Stats = {
  thresholdsFound: 0,
  thresholdsFixed: 0,
  rulesFound: 0,
  rulesFixed: 0,
  usersScanned: 0,
  usersFound: 0,
  usersFixed: 0,
  errors: [],
};

// ─── Phase 1: program_thresholds ─────────────────────────────────────────────

async function fixThresholds(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Phase 1 — program_thresholds');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const snap = await db
    .collection('program_thresholds')
    .where('programId', '==', CORRUPT_ID)
    .get();

  if (snap.empty) {
    console.log('  ✅ No corrupt program_thresholds docs found.');
    return;
  }

  stats.thresholdsFound = snap.size;
  console.log(`  Found ${snap.size} corrupt doc(s).\n`);

  for (const docSnap of snap.docs) {
    const data = docSnap.data() as Record<string, unknown>;

    console.log(`  📄 ${docSnap.id}`);
    console.log(`     name:          ${data.name ?? '(none)'}`);
    console.log(`     displayName:   ${JSON.stringify(data.displayName ?? {})}`);
    console.log(`     levelId:       ${data.levelId ?? '(none)'}`);
    console.log(`     priority:      ${data.priority ?? '(none)'}`);
    console.log(`     BEFORE  programId: "${CORRUPT_ID}"`);
    console.log(`     AFTER   programId: "${REPLACEMENT_SLUG}"`);

    if (DRY_RUN) {
      console.log('     ⏸  [dry-run] skipping write');
      continue;
    }

    try {
      await docSnap.ref.update({ programId: REPLACEMENT_SLUG });
      stats.thresholdsFixed++;
      console.log('     ✅ Fixed.');
    } catch (err: unknown) {
      const msg = `program_thresholds/${docSnap.id}: ${String(err)}`;
      stats.errors.push(msg);
      console.error(`     ❌ Error: ${msg}`);
    }
  }
}

// ─── Phase 2: assessment_rules ───────────────────────────────────────────────

async function fixAssessmentRules(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Phase 2 — assessment_rules');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const [snap1, snap2] = await Promise.all([
    db.collection('assessment_rules')
      .where('action.targetProgramId', '==', CORRUPT_ID)
      .get(),
    db.collection('assessment_rules')
      .where('action.forceProgramId', '==', CORRUPT_ID)
      .get(),
  ]);

  // Deduplicate by doc ID
  const docsById = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
  for (const d of [...snap1.docs, ...snap2.docs]) {
    docsById.set(d.id, d);
  }

  if (docsById.size === 0) {
    console.log('  ✅ No corrupt assessment_rules docs found.');
    return;
  }

  stats.rulesFound = docsById.size;
  console.log(`  Found ${docsById.size} corrupt doc(s).\n`);

  for (const [, docSnap] of docsById) {
    const data = docSnap.data() as Record<string, unknown>;
    const action = (data.action ?? {}) as Record<string, unknown>;

    const updatePayload: Record<string, unknown> = {};
    const changes: string[] = [];

    if (action.targetProgramId === CORRUPT_ID) {
      updatePayload['action.targetProgramId'] = REPLACEMENT_SLUG;
      changes.push(`action.targetProgramId: "${CORRUPT_ID}" → "${REPLACEMENT_SLUG}"`);
    }
    if (action.forceProgramId === CORRUPT_ID) {
      updatePayload['action.forceProgramId'] = REPLACEMENT_SLUG;
      changes.push(`action.forceProgramId: "${CORRUPT_ID}" → "${REPLACEMENT_SLUG}"`);
    }

    console.log(`  📄 ${docSnap.id}`);
    console.log(`     name:     ${data.name ?? '(none)'}`);
    console.log(`     type:     ${action.type ?? '(none)'}`);
    changes.forEach((c) => console.log(`     CHANGE  ${c}`));

    if (DRY_RUN) {
      console.log('     ⏸  [dry-run] skipping write');
      continue;
    }

    try {
      await docSnap.ref.update(updatePayload);
      stats.rulesFixed++;
      console.log('     ✅ Fixed.');
    } catch (err: unknown) {
      const msg = `assessment_rules/${docSnap.id}: ${String(err)}`;
      stats.errors.push(msg);
      console.error(`     ❌ Error: ${msg}`);
    }
  }
}

// ─── Phase 3: users ──────────────────────────────────────────────────────────

/** Returns true if the user document contains the corrupt id anywhere in
 *  the progression sub-tree we own. */
function userIsAffected(data: Record<string, unknown>): boolean {
  const prog = (data.progression ?? {}) as Record<string, unknown>;

  // activePrograms[].templateId
  const activePrograms = (prog.activePrograms ?? []) as Array<Record<string, unknown>>;
  if (activePrograms.some((p) => p.templateId === CORRUPT_ID)) return true;

  // domains key
  const domains = (prog.domains ?? {}) as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(domains, CORRUPT_ID)) return true;

  // tracks key
  const tracks = (prog.tracks ?? {}) as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(tracks, CORRUPT_ID)) return true;

  // currentProgramId
  if (prog.currentProgramId === CORRUPT_ID) return true;

  return false;
}

/** Build the update payload for a single user document. */
function buildUserUpdatePayload(
  uid: string,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const prog = (data.progression ?? {}) as Record<string, unknown>;
  const payload: Record<string, unknown> = {};

  // ── activePrograms ────────────────────────────────────────────────────────
  const activePrograms = (prog.activePrograms ?? []) as Array<Record<string, unknown>>;
  const fixedPrograms = activePrograms.map((p) => {
    if (p.templateId !== CORRUPT_ID) return p;
    return {
      ...p,
      id: p.id === CORRUPT_ID ? REPLACEMENT_SLUG : p.id,
      templateId: REPLACEMENT_SLUG,
      name: hebrewName(REPLACEMENT_SLUG),
    };
  });
  payload['progression.activePrograms'] = fixedPrograms;

  // ── domains ───────────────────────────────────────────────────────────────
  const domains = (prog.domains ?? {}) as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(domains, CORRUPT_ID)) {
    const corruptDomain = domains[CORRUPT_ID];
    // Delete the corrupt key
    payload[`progression.domains.${CORRUPT_ID}`] = FieldValue.delete();
    if (!Object.prototype.hasOwnProperty.call(domains, REPLACEMENT_SLUG)) {
      // Safe to move the data under the correct key
      payload[`progression.domains.${REPLACEMENT_SLUG}`] = corruptDomain;
    } else {
      // Correct key already exists — keep it, just remove the corrupt one
      console.warn(
        `     ⚠️  user ${uid}: domains already has "${REPLACEMENT_SLUG}" — ` +
          `dropping corrupt "פ" key but NOT overwriting existing data.`,
      );
    }
  }

  // ── tracks ────────────────────────────────────────────────────────────────
  const tracks = (prog.tracks ?? {}) as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(tracks, CORRUPT_ID)) {
    const corruptTrack = tracks[CORRUPT_ID];
    payload[`progression.tracks.${CORRUPT_ID}`] = FieldValue.delete();
    if (!Object.prototype.hasOwnProperty.call(tracks, REPLACEMENT_SLUG)) {
      payload[`progression.tracks.${REPLACEMENT_SLUG}`] = corruptTrack;
    } else {
      console.warn(
        `     ⚠️  user ${uid}: tracks already has "${REPLACEMENT_SLUG}" — ` +
          `dropping corrupt "פ" key but NOT overwriting existing data.`,
      );
    }
  }

  // ── currentProgramId ──────────────────────────────────────────────────────
  if (prog.currentProgramId === CORRUPT_ID) {
    payload['progression.currentProgramId'] = REPLACEMENT_SLUG;
  }

  return payload;
}

function printUserChanges(
  uid: string,
  data: Record<string, unknown>,
  payload: Record<string, unknown>,
): void {
  const prog = (data.progression ?? {}) as Record<string, unknown>;
  const domains = (prog.domains ?? {}) as Record<string, unknown>;
  const tracks = (prog.tracks ?? {}) as Record<string, unknown>;
  const activePrograms = (prog.activePrograms ?? []) as Array<Record<string, unknown>>;

  console.log(`\n  👤 user ${uid}`);

  const corruptPrograms = activePrograms.filter((p) => p.templateId === CORRUPT_ID);
  if (corruptPrograms.length > 0) {
    console.log(
      `     activePrograms: ${corruptPrograms.length} entry(s) with ` +
        `templateId="${CORRUPT_ID}" → templateId="${REPLACEMENT_SLUG}", ` +
        `name="${hebrewName(REPLACEMENT_SLUG)}"`,
    );
  }
  if (Object.prototype.hasOwnProperty.call(domains, CORRUPT_ID)) {
    const d = domains[CORRUPT_ID] as Record<string, unknown>;
    const exists = Object.prototype.hasOwnProperty.call(domains, REPLACEMENT_SLUG);
    console.log(
      `     domains["${CORRUPT_ID}"] → domains["${REPLACEMENT_SLUG}"] ` +
        `(currentLevel=${d?.currentLevel ?? '?'}, maxLevel=${d?.maxLevel ?? '?'})` +
        (exists ? ' [MERGE CONFLICT: key exists, corrupt key removed only]' : ''),
    );
  }
  if (Object.prototype.hasOwnProperty.call(tracks, CORRUPT_ID)) {
    const t = tracks[CORRUPT_ID] as Record<string, unknown>;
    const exists = Object.prototype.hasOwnProperty.call(tracks, REPLACEMENT_SLUG);
    console.log(
      `     tracks["${CORRUPT_ID}"] → tracks["${REPLACEMENT_SLUG}"] ` +
        `(currentLevel=${t?.currentLevel ?? '?'}, percent=${t?.percent ?? '?'})` +
        (exists ? ' [MERGE CONFLICT: key exists, corrupt key removed only]' : ''),
    );
  }
  if (prog.currentProgramId === CORRUPT_ID) {
    console.log(`     currentProgramId: "${CORRUPT_ID}" → "${REPLACEMENT_SLUG}"`);
  }
}

async function fixUsersPage(
  startAfterDoc: FirebaseFirestore.DocumentSnapshot | null,
  dryRun: boolean,
): Promise<{
  lastDoc: FirebaseFirestore.DocumentSnapshot | null;
  pageSize: number;
}> {
  let q = db.collection('users').orderBy('__name__').limit(PAGE_SIZE);
  if (startAfterDoc) q = q.startAfter(startAfterDoc);

  const snap = await q.get();
  if (snap.empty) return { lastDoc: null, pageSize: 0 };

  let batch = db.batch();
  let pendingWrites = 0;

  for (const docSnap of snap.docs) {
    stats.usersScanned++;
    const data = docSnap.data() as Record<string, unknown>;

    if (!userIsAffected(data)) continue;

    stats.usersFound++;
    const payload = buildUserUpdatePayload(docSnap.id, data);
    printUserChanges(docSnap.id, data, payload);

    if (dryRun) {
      console.log('     ⏸  [dry-run] skipping write');
      continue;
    }

    try {
      batch.update(docSnap.ref, payload as FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>);
      pendingWrites++;
      stats.usersFixed++;

      if (pendingWrites >= COMMIT_BATCH_SIZE) {
        await batch.commit();
        console.log(`  💾 Committed batch of ${pendingWrites} user writes.`);
        batch = db.batch();
        pendingWrites = 0;
      }
    } catch (err: unknown) {
      const msg = `users/${docSnap.id}: ${String(err)}`;
      stats.errors.push(msg);
      console.error(`     ❌ Error: ${msg}`);
    }
  }

  if (!dryRun && pendingWrites > 0) {
    await batch.commit();
    console.log(`  💾 Committed batch of ${pendingWrites} user writes.`);
  }

  return {
    lastDoc: snap.docs[snap.docs.length - 1],
    pageSize: snap.size,
  };
}

async function fixUsers(): Promise<void> {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Phase 3 — users (paginated scan)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(
    '  Firestore cannot query into array-of-objects, so every user doc\n' +
      '  must be scanned in memory. This may take a moment...',
  );

  let cursor: FirebaseFirestore.DocumentSnapshot | null = null;
  let page = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    page++;
    const { lastDoc, pageSize } = await fixUsersPage(cursor, DRY_RUN);
    if (pageSize === 0) break;
    process.stdout.write(
      `\r  Scanned ${stats.usersScanned} users (page ${page})` +
        ` — ${stats.usersFound} affected so far...   `,
    );
    cursor = lastDoc;
    if (pageSize < PAGE_SIZE) break;
  }

  // newline after progress line
  console.log(`\n  Done scanning ${stats.usersScanned} users.`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const modeLabel = DRY_RUN ? '🔍 DRY RUN (no writes)' : '🚀 LIVE MIGRATION';
  console.log('\n══════════════════════════════════════════════════');
  console.log(`  fix-corrupt-program-id.ts  —  ${modeLabel}`);
  console.log('══════════════════════════════════════════════════');
  console.log(`  Corrupt id:       "${CORRUPT_ID}"`);
  console.log(`  Replacement slug: "${REPLACEMENT_SLUG}"`);
  console.log(`  Hebrew name:      "${hebrewName(REPLACEMENT_SLUG)}"`);
  if (DRY_RUN) {
    console.log(
      '\n  To apply changes, re-run with --live (and optionally\n' +
        '  --replacement-slug <slug> if the default is wrong).',
    );
  }

  const start = Date.now();

  await fixThresholds();
  await fixAssessmentRules();
  await fixUsers();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log('\n══════════════════════════════════════════════════');
  console.log(`  ${DRY_RUN ? 'Preview' : 'Migration'} complete in ${elapsed}s`);
  console.log('══════════════════════════════════════════════════');
  console.log('  program_thresholds found:  ' + stats.thresholdsFound);
  if (!DRY_RUN) console.log('  program_thresholds fixed:  ' + stats.thresholdsFixed);
  console.log('  assessment_rules found:    ' + stats.rulesFound);
  if (!DRY_RUN) console.log('  assessment_rules fixed:    ' + stats.rulesFixed);
  console.log('  users scanned:             ' + stats.usersScanned);
  console.log('  users affected:            ' + stats.usersFound);
  if (!DRY_RUN) console.log('  users fixed:               ' + stats.usersFixed);
  console.log('  errors:                    ' + stats.errors.length);

  if (stats.errors.length > 0) {
    console.log('\n❌ Errors:');
    stats.errors.slice(0, 30).forEach((e) => console.log(`   • ${e}`));
    if (stats.errors.length > 30) {
      console.log(`   …and ${stats.errors.length - 30} more`);
    }
    process.exit(1);
  }

  if (DRY_RUN) {
    const totalAffected = stats.thresholdsFound + stats.rulesFound + stats.usersFound;
    if (totalAffected === 0) {
      console.log(
        '\n  ✅ No corrupt "פ" data found — the database is already clean.',
      );
    } else {
      console.log(
        `\n  ⚠️  ${totalAffected} document(s) would be modified.` +
          '\n  Verify the replacement slug above, then run with --live to apply.',
      );
    }
  } else {
    console.log('\n  ✅ Migration complete. Clear localStorage "out-user-storage"');
    console.log('     on affected devices (or ask users to sign out and back in)');
    console.log('     to purge the cached corrupt value from the browser.');
  }
}

run().catch((err) => {
  console.error('\n❌ Script failed:', err);
  process.exit(1);
});
