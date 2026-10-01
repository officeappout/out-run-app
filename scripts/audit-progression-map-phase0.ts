/**
 * scripts/audit-progression-map-phase0.ts — Progression Map, Phase 0.
 * READ-ONLY: fetches `programs`, `exercises`, and a sample of `users`, prints a
 * report. Writes nothing to Firestore, no --apply flag.
 *
 * MODEL (as of the 2026-09-25 reset brief — supersedes any earlier version of
 * this script that grouped by base_movement_id):
 *   - A Tree = one LEAF program's (Program.isMaster === false) exercises,
 *     ordered by level, using ONLY Exercise.targetPrograms: [{programId, level}].
 *     This crosses movement families on purpose (e.g. the מתח program's ladder
 *     can include חתירה → banded pull-up → full pull-up — different
 *     base_movement_id values, same leaf program).
 *   - A leaf program tops out at its OWN destination exercise. A harder skill
 *     (e.g. מאסל אפ) is a SEPARATE leaf program, not a continuation of מתח's.
 *   - A COMPOSITE/domain program (Program.isMaster === true, e.g. משיכה,
 *     פלג עליון) is a HUB listing its leaf programs (via Program.subPrograms) —
 *     it is not itself a ladder and is not grouped by level here.
 *   - base_movement_id / movementGroup are used ONLY for the per-node 🔄 swap
 *     (same-family variations at one level) — confirmed below, and NOT used to
 *     group this ladder. There is no per-exercise prerequisite field, and this
 *     model doesn't need one (program+level IS the sequencing).
 *
 * CONFIRMATION (grep against origin/main, printed again at runtime below):
 *   - Ladder grouping field: Exercise.targetPrograms[].{programId,level}
 *     (exercise.types.ts) + Program.isMaster/subPrograms (program.types.ts).
 *   - base_movement_id, swap-only: exercise-replacement.service.ts's
 *     getExerciseVariations() filters by base_movement_id (±levelRadius) and
 *     getAlternativeExercises() filters by movementGroup — both feed the
 *     "החלפת תרגיל" swap drawer only. The one place base_movement_id currently
 *     builds a cross-level sequence at all (useExerciseMasterData.ts's 3-node
 *     prev/current/next ProgressionChain) is the OLD model this script no
 *     longer follows — left in place in the app, just not what Tree uses.
 *
 * Check #2 (unchanged from the prior version of this script) — does a real
 * users/{uid} doc's progression.tracks[domain] carry `.level`, `.currentLevel`,
 * or both? Only aggregate counts/shapes are printed — no uids, names, or other
 * user-identifying fields.
 *
 * Usage: npx tsx scripts/audit-progression-map-phase0.ts
 * (Needs .env.local / FIREBASE_SERVICE_ACCOUNT_KEY — run from an environment
 * that has it, e.g. the main checkout; a fresh git worktree won't.)
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

type LocalizedTextLike = { he?: string; en?: string; es?: string } | string | undefined;
function nameOf(value: LocalizedTextLike, fallback: string): string {
  if (!value) return fallback;
  if (typeof value === 'string') return value || fallback;
  return value.he || value.en || value.es || fallback;
}

type TargetProgramRef = { programId: string; level: number };
interface ExerciseDoc {
  id: string;
  name: string;
  targetPrograms: TargetProgramRef[];
  base_movement_id?: string;
}
interface ProgramDoc {
  id: string;
  name: string;
  isMaster: boolean;
  subPrograms?: string[];
}

async function loadPrograms(db: admin.firestore.Firestore): Promise<Map<string, ProgramDoc>> {
  const snap = await db.collection('programs').get();
  const map = new Map<string, ProgramDoc>();
  snap.docs.forEach((d) => {
    const data = d.data() as Record<string, unknown>;
    map.set(d.id, {
      id: d.id,
      name: (data.name as string) || d.id,
      isMaster: data.isMaster === true,
      subPrograms: (data.subPrograms as string[] | undefined) || [],
    });
  });
  return map;
}

async function loadExercises(db: admin.firestore.Firestore): Promise<ExerciseDoc[]> {
  const snap = await db.collection('exercises').get();
  return snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      name: nameOf(data.name as LocalizedTextLike, `(unnamed:${d.id})`),
      targetPrograms: (data.targetPrograms as TargetProgramRef[] | undefined) || [],
      base_movement_id: data.base_movement_id as string | undefined,
    };
  });
}

async function checkLadders(db: admin.firestore.Firestore) {
  console.log('\n=== CHECK #1 — leaf-program ladders (Exercise.targetPrograms grouped by LEAF program + level) ===\n');
  const programs = await loadPrograms(db);
  const exercises = await loadExercises(db);

  const leafPrograms = Array.from(programs.values()).filter((p) => !p.isMaster);
  const compositePrograms = Array.from(programs.values()).filter((p) => p.isMaster);
  console.log(`Programs total: ${programs.size} — LEAF (isMaster=false): ${leafPrograms.length}, COMPOSITE/domain (isMaster=true): ${compositePrograms.length}`);

  // programId -> level -> exercises at that level (only for entries with a resolvable level)
  const ladders = new Map<string, Map<number, ExerciseDoc[]>>();
  leafPrograms.forEach((p) => ladders.set(p.id, new Map()));

  // #5 — tagged to a program but no resolvable level
  const unresolvable: { exercise: ExerciseDoc; programId: string; rawLevel: unknown }[] = [];

  exercises.forEach((ex) => {
    ex.targetPrograms.forEach((tp) => {
      if (!ladders.has(tp.programId)) return; // not a leaf program (or unknown programId) — out of scope for a ladder
      const levelOk = typeof tp.level === 'number' && Number.isFinite(tp.level) && tp.level > 0;
      if (!levelOk) {
        unresolvable.push({ exercise: ex, programId: tp.programId, rawLevel: tp.level });
        return;
      }
      const byLevel = ladders.get(tp.programId)!;
      if (!byLevel.has(tp.level)) byLevel.set(tp.level, []);
      byLevel.get(tp.level)!.push(ex);
    });
  });

  // Also catch targetPrograms entries pointing at a programId that isn't in `programs` at all,
  // and entries pointing at a COMPOSITE program directly (the model says composites aren't
  // ladders, so exercises shouldn't be tagged to them at all — worth knowing if any are).
  const unknownProgramRefs: { exercise: ExerciseDoc; programId: string }[] = [];
  const taggedToComposite: { exercise: ExerciseDoc; programId: string }[] = [];
  exercises.forEach((ex) => {
    ex.targetPrograms.forEach((tp) => {
      const prog = programs.get(tp.programId);
      if (!prog) unknownProgramRefs.push({ exercise: ex, programId: tp.programId });
      else if (prog.isMaster) taggedToComposite.push({ exercise: ex, programId: tp.programId });
    });
  });

  let ladderCount = 0;
  let cleanLadderCount = 0; // no gaps AND no multi-node levels, 2+ rungs
  let singleExerciseCount = 0;
  let zeroExerciseCount = 0;
  let multiNodeLevelCount = 0;

  console.log('\n--- Per leaf program ---');
  leafPrograms
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
    .forEach((p) => {
      const byLevel = ladders.get(p.id)!;
      const distinctExerciseIds = new Set<string>();
      byLevel.forEach((exs) => exs.forEach((e) => distinctExerciseIds.add(e.id)));
      const exerciseCount = distinctExerciseIds.size;

      if (exerciseCount === 0) {
        zeroExerciseCount++;
        console.log(`\n== ${p.name} (${p.id}) — 0 exercises tagged ==`);
        return;
      }
      if (exerciseCount === 1) singleExerciseCount++;

      const levels = Array.from(byLevel.keys()).sort((a, b) => a - b);
      const minLevel = levels[0];
      const maxLevel = levels[levels.length - 1];
      ladderCount++;

      console.log(`\n== ${p.name} (${p.id}) — ${exerciseCount} exercise(s), levels ${minLevel}-${maxLevel} ==`);

      let hasGap = false;
      let hasMultiNode = false;
      for (let lvl = minLevel; lvl <= maxLevel; lvl++) {
        const exs = byLevel.get(lvl);
        if (!exs || exs.length === 0) {
          hasGap = true;
          console.log(`  L${lvl}: — (GAP, no exercise)`);
          continue;
        }
        const names = exs.map((e) => e.name).join(', ');
        if (exs.length > 1) {
          hasMultiNode = true;
          multiNodeLevelCount++;
          console.log(`  L${lvl}: ${names}  ⚠️ MULTI-NODE (${exs.length} exercises)`);
        } else {
          console.log(`  L${lvl}: ${names}`);
        }
      }

      const isClean = exerciseCount >= 2 && !hasGap && !hasMultiNode;
      if (isClean) cleanLadderCount++;
      console.log(`  → ${isClean ? 'CLEAN ascending ladder' : exerciseCount === 1 ? 'single-exercise (no real ladder)' : `NOT clean${hasGap ? ' — has gap(s)' : ''}${hasMultiNode ? ' — has multi-node level(s)' : ''}`}`);
    });

  // ladderCount = every leaf program with >=1 exercise tagged (includes the single-exercise case);
  // subtract singleExerciseCount to get the "2+ exercises" subset.
  const twoPlusCount = ladderCount - singleExerciseCount;
  console.log('\n--- Summary (#6 totals) ---');
  console.log(`Leaf programs total: ${leafPrograms.length}`);
  console.log(`  0 exercises tagged: ${zeroExerciseCount}`);
  console.log(`  1 exercise tagged (#4, no real ladder): ${singleExerciseCount}`);
  console.log(`  2+ exercises (a real ladder, clean or not): ${twoPlusCount}`);
  console.log(`  of which CLEAN ascending (no gaps, no multi-node, 2+ rungs): ${cleanLadderCount} / ${twoPlusCount}`);
  console.log(`Levels with 2+ exercises across all leaf programs (#2, multi-node case): ${multiNodeLevelCount}`);
  console.log(`Exercises tagged to a program with an unresolvable/invalid level (#5): ${unresolvable.length}`);
  if (unresolvable.length) {
    unresolvable.slice(0, 20).forEach((u) => {
      const pName = programs.get(u.programId)?.name ?? u.programId;
      console.log(`    - "${u.exercise.name}" (${u.exercise.id}) → program ${pName}, raw level = ${JSON.stringify(u.rawLevel)}`);
    });
    if (unresolvable.length > 20) console.log(`    ... and ${unresolvable.length - 20} more`);
  }
  console.log(`targetPrograms entries referencing an unknown/non-existent programId: ${unknownProgramRefs.length}`);
  if (unknownProgramRefs.length) {
    unknownProgramRefs.slice(0, 20).forEach((u) => {
      console.log(`    - "${u.exercise.name}" (${u.exercise.id}) → unknown programId ${u.programId}`);
    });
    if (unknownProgramRefs.length > 20) console.log(`    ... and ${unknownProgramRefs.length - 20} more`);
  }
  console.log(`targetPrograms entries tagged directly to a COMPOSITE program (shouldn't happen per the model): ${taggedToComposite.length}`);
  if (taggedToComposite.length) {
    taggedToComposite.slice(0, 20).forEach((u) => {
      const pName = programs.get(u.programId)?.name ?? u.programId;
      console.log(`    - "${u.exercise.name}" (${u.exercise.id}) → composite program ${pName}`);
    });
    if (taggedToComposite.length > 20) console.log(`    ... and ${taggedToComposite.length - 20} more`);
  }

  console.log('\n--- Composite/domain programs (isMaster=true) — HUB listing only, not ladders ---');
  compositePrograms
    .sort((a, b) => a.name.localeCompare(b.name, 'he'))
    .forEach((p) => {
      const children = (p.subPrograms || []).map((id) => programs.get(id)?.name ?? `(unknown: ${id})`);
      console.log(`  ${p.name} (${p.id}) → subPrograms: ${children.length ? children.join(', ') : '(none)'}`);
    });
}

async function checkTracksShape(db: admin.firestore.Firestore) {
  console.log('\n=== CHECK #2 — progression.tracks[domain] shape: .level vs .currentLevel ===\n');
  const snap = await db.collection('users').limit(200).get();
  let sampled = 0;
  let hasLevel = 0;
  let hasCurrentLevel = 0;
  let hasBoth = 0;
  let hasNeither = 0;
  const sampleDomainKeys = new Set<string>();

  snap.docs.forEach((doc) => {
    const data = doc.data() as Record<string, unknown>;
    const progression = data.progression as Record<string, unknown> | undefined;
    const tracks = progression?.tracks as Record<string, Record<string, unknown>> | undefined;
    if (!tracks || Object.keys(tracks).length === 0) return;
    sampled++;
    Object.keys(tracks).forEach((k) => sampleDomainKeys.add(k));
    const anyDomain = Object.values(tracks)[0] as Record<string, unknown> | undefined;
    if (!anyDomain) return;
    const has1 = typeof anyDomain.level === 'number';
    const has2 = typeof anyDomain.currentLevel === 'number';
    if (has1 && has2) hasBoth++;
    else if (has1) hasLevel++;
    else if (has2) hasCurrentLevel++;
    else hasNeither++;
  });

  console.log(`Sampled users with non-empty progression.tracks: ${sampled} (of up to 200 scanned)`);
  console.log(`  .level present (no .currentLevel): ${hasLevel}`);
  console.log(`  .currentLevel present (no .level): ${hasCurrentLevel}`);
  console.log(`  BOTH present: ${hasBoth}`);
  console.log(`  NEITHER present (unexpected shape — inspect manually): ${hasNeither}`);
  console.log(`  Observed domain keys across sample: ${Array.from(sampleDomainKeys).join(', ') || '(none)'}`);
}

async function main() {
  const db = initFb();
  await checkLadders(db);
  await checkTracksShape(db);
  console.log('\nDone. No writes were made.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
