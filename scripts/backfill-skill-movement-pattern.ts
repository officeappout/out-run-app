/**
 * scripts/backfill-skill-movement-pattern.ts — 2026-10-06.
 *
 * Data-gap finding (not by-design, see parking-lot / connection-map doc):
 * the 7 elite skill-track programs (planche, front_lever, muscle_up,
 * one_arm_pullup, handstand, handstand_pushup, human_flag) have no
 * `movementPattern` field on their `programs` doc. That field only has 4
 * real values (push|pull|legs|core — program.types.ts) and every one of
 * these 7 skills already has a well-established parent pattern elsewhere in
 * this codebase (DOMAIN_RESOLUTION_SKILL_PARENT_MAP, workout-selection.utils.ts)
 * — this script sources the target value from THAT map, never a hardcoded
 * guess, so it can never drift from the engine's own skill→parent mapping.
 *
 * Confirmed effect (live dry-run, 2026-10-06, before this script existed):
 * backfilling this field DOES change `resolveActiveProgramBudget`'s
 * resolution identity for a skill-focused user (isSafeDefault flips from
 * true→undefined/false, leadProgramId correctly resolves to the real skill
 * program instead of ''). It does NOT currently change the resulting
 * weeklyVolumeTarget/maxSets NUMBERS — verified directly against Firestore:
 * 5 of the 7 skill programs have ZERO `programLevelSettings` docs at any
 * level; the other 2 (planche, front_lever) have 1-3 stray docs with
 * weeklyVolumeTarget/maxSets/baseGain all `undefined`. Both before and
 * after this backfill, `resolveLeadProgramBudget` therefore falls through
 * to the SAME generic `getDefaultVolumeTarget`/`getDefaultMaxSets` tier
 * default for the same user level — this backfill alone is a COSMETIC
 * identity fix for these 7 programs' volume numbers specifically, not a
 * behavior change, until/unless real per-level programLevelSettings data
 * is ALSO populated for them (a separate, bigger decision — NOT done by
 * this script).
 *
 * Additive, reversible: sets exactly one field (`movementPattern`) via a
 * partial `update()`, touches nothing else on the doc. To reverse: either
 * re-run with the field manually cleared in the admin UI's "ללא" option,
 * or `update({movementPattern: admin.firestore.FieldValue.delete()})`.
 *
 * Usage:
 *   npx tsx scripts/backfill-skill-movement-pattern.ts            (dry run, no writes)
 *   npx tsx scripts/backfill-skill-movement-pattern.ts --apply    (writes)
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';

async function main() {
  const isApply = process.argv.includes('--apply');
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!rawKey) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY not set.'); process.exit(1); }
  const cred = JSON.parse(rawKey);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred), projectId: cred.project_id });
  const db = admin.firestore();

  // Source the mapping from the engine's own map, not a hardcoded guess.
  const { DOMAIN_RESOLUTION_SKILL_PARENT_MAP } = await import('../src/features/workout-engine/logic/workout-selection.utils');
  const { resolveToSlug, buildIdToSlugMapFromPrograms } = await import('../src/features/workout-engine/services/program-hierarchy.utils');
  const { getAllPrograms } = await import('../src/features/content/programs/core/program.service');

  const programs = await getAllPrograms();
  buildIdToSlugMapFromPrograms(programs);

  const targets = programs
    .filter((p) => !p.isMaster && p.movementPattern == null)
    .map((p) => {
      const slug = resolveToSlug(p.id);
      const targetPattern = (DOMAIN_RESOLUTION_SKILL_PARENT_MAP as Record<string, string>)[slug];
      return { id: p.id, name: p.name, slug, targetPattern };
    });

  const mappable = targets.filter((t) => t.targetPattern);
  const unmappable = targets.filter((t) => !t.targetPattern);

  console.log(`Found ${targets.length} non-master program(s) missing movementPattern.`);
  console.log(`${mappable.length} have a DOMAIN_RESOLUTION_SKILL_PARENT_MAP entry (will be backfilled):`);
  mappable.forEach((t) => console.log(`  ${t.id}  slug="${t.slug}"  name="${t.name}"  →  movementPattern: ${t.targetPattern}`));

  if (unmappable.length > 0) {
    console.log(`${unmappable.length} have NO mapping entry — left untouched, not guessed at:`);
    unmappable.forEach((t) => console.log(`  ${t.id}  slug="${t.slug}"  name="${t.name}"`));
  }

  if (!isApply) {
    console.log('\nDry run only (pass --apply to write). No Firestore writes made.');
    process.exit(0);
  }

  console.log('\n=== Pre-write snapshot ===');
  const before: Record<string, any> = {};
  for (const t of mappable) {
    const doc = await db.collection('programs').doc(t.id).get();
    before[t.id] = doc.exists ? doc.data()?.movementPattern ?? null : undefined;
    console.log(`  ${t.id}: movementPattern was ${JSON.stringify(before[t.id])}`);
  }

  console.log('\n=== Writing ===');
  for (const t of mappable) {
    await db.collection('programs').doc(t.id).update({ movementPattern: t.targetPattern });
    console.log(`  ✓ ${t.id} (${t.name}) → movementPattern: ${t.targetPattern}`);
  }

  console.log('\n=== Post-write verification (re-read from DB, not the value sent) ===');
  for (const t of mappable) {
    const doc = await db.collection('programs').doc(t.id).get();
    const now = doc.data()?.movementPattern;
    const ok = now === t.targetPattern;
    console.log(`  ${ok ? '✅' : '❌'} ${t.id}: movementPattern is now "${now}" (expected "${t.targetPattern}")`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
