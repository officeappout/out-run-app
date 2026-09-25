/**
 * scripts/audit-progression-map-phase0.ts — Progression Map, Phase 0 checks #1+#2.
 * READ-ONLY: fetches `exercises` + a sample of `users`, prints a report. Writes
 * nothing to Firestore. See .claude/knowledge/progression-map-phase0-findings.md
 * for checks #3+#4 (pure code reads, already done — no live data needed for those).
 *
 * Why this script exists: the investigating session had no Firebase Admin
 * credentials in its worktree (.env.local isn't copied into a fresh git
 * worktree) and this repo's rules forbid starting a dev server from an agent
 * session (axioms.md §11) — so this had to be handed off to run from an
 * environment that already has .env.local (e.g. the main checkout).
 *
 * Check #1 — does base_movement_id + per-program level actually yield clean
 * ladders? (David's core architecture decision for the Tree screen depends on
 * this being true in practice, not just in principle.)
 * Check #2 — does a real users/{uid} doc's progression.tracks[domain] carry
 * `.level`, `.currentLevel`, or both? (useProgressionStore.ts assumes `.level`;
 * useGoalsForProgram.ts's TracksMap type assumes `.currentLevel` — resolving
 * this is a prerequisite for any "current level in program X" logic in Hub/Tree.)
 * Only aggregate counts/shapes are printed for check #2 — no uids, names, or
 * other user-identifying fields.
 *
 * Usage: npx tsx scripts/audit-progression-map-phase0.ts
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';

function initFb() {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  return admin.firestore();
}

// Mirrors BASE_MOVEMENT_OPTIONS keys, copied verbatim from origin/main's
// src/features/content/exercises/admin/components/exercise-editor/shared/constants.tsx
// on 2026-09-25 — kept as a literal copy here since this script runs standalone via
// tsx, not through the Next.js module graph. Re-sync if that file's list changes.
// NOTE: 'row' (חתירה) and 'pull_up' (מתח) are SEPARATE families here — the spec's own
// headline example ("חתירה → מתח שלילי → … → מתח") spans two families, so a single
// base_movement_id ladder does NOT reproduce that exact chain. Expected, per David's
// explicit scope-narrowing decision (§1 of the plan) — flagged here just so it isn't
// mistaken for a bug in this script.
const KNOWN_BASE_MOVEMENTS = new Set<string>([
  'push_up', 'planche', 'handstand', 'handstand_pushup', 'dip',
  'pull_up', 'one_arm_pull', 'muscle_up', 'row', 'front_lever',
  'pistol_squat', 'shrimp_squat', 'nordic_curl', 'sissy_squat',
  'human_flag', 'l_sit', 'ring_work',
  'pancake', 'middle_split', 'front_split',
]);

type TargetProgramRef = { programId: string; level: number };
type ExerciseRole = 'warmup' | 'cooldown' | 'main' | 'recovery' | 'reinforcement';
interface ExerciseDoc {
  id: string;
  base_movement_id?: string;
  targetPrograms?: TargetProgramRef[];
  exerciseRole?: ExerciseRole;
  execution_methods?: unknown[];
}

async function checkOne(db: admin.firestore.Firestore) {
  console.log('\n=== CHECK #1 — base_movement_id + level ladder cleanliness ===\n');
  const snap = await db.collection('exercises').get();
  const exercises: ExerciseDoc[] = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>;
    return {
      id: d.id,
      base_movement_id: data.base_movement_id as string | undefined,
      targetPrograms: data.targetPrograms as TargetProgramRef[] | undefined,
      exerciseRole: data.exerciseRole as ExerciseRole | undefined,
      execution_methods: data.execution_methods as unknown[] | undefined,
    };
  });

  const total = exercises.length;
  const withFamily = exercises.filter((e) => !!e.base_movement_id);
  const withoutFamily = total - withFamily.length;
  const offList = KNOWN_BASE_MOVEMENTS.size
    ? withFamily.filter((e) => !KNOWN_BASE_MOVEMENTS.has(e.base_movement_id!))
    : withFamily; // KNOWN_BASE_MOVEMENTS not filled in — see note above
  const unresolvableLevel = withFamily.filter((e) => !e.targetPrograms?.length);

  console.log(`Total exercises: ${total}`);
  console.log(`With base_movement_id: ${withFamily.length} (${withoutFamily} without)`);
  console.log(`base_movement_id off the curated list: ${offList.length}${KNOWN_BASE_MOVEMENTS.size ? '' : '  [KNOWN_BASE_MOVEMENTS not filled in — this number is meaningless, fix the script first]'}`);
  console.log(`With base_movement_id but zero targetPrograms (level unresolvable under any program): ${unresolvableLevel.length}`);

  // Group by (base_movement_id, programId) -> level -> candidate exercises
  type Bucket = Map<string, Map<string, Map<number, ExerciseDoc[]>>>; // family -> programId -> level -> exercises
  const buckets: Bucket = new Map();
  for (const ex of withFamily) {
    if (!ex.targetPrograms?.length) continue;
    const fam = ex.base_movement_id!;
    if (!buckets.has(fam)) buckets.set(fam, new Map());
    const byProgram = buckets.get(fam)!;
    for (const tp of ex.targetPrograms) {
      if (!byProgram.has(tp.programId)) byProgram.set(tp.programId, new Map());
      const byLevel = byProgram.get(tp.programId)!;
      if (!byLevel.has(tp.level)) byLevel.set(tp.level, []);
      byLevel.get(tp.level)!.push(ex);
    }
  }

  let ladderPairs = 0;
  let singleRungLadders = 0;
  let totalRungs = 0;
  let collisionBucketsRaw = 0; // >1 exercise sharing family+programId+level, before tie-break
  let collisionBucketsAfterTiebreak = 0; // still >1 after role+execution_methods filter

  buckets.forEach((byProgram) => {
    byProgram.forEach((byLevel) => {
      ladderPairs++;
      const rungCount = byLevel.size;
      totalRungs += rungCount;
      if (rungCount === 1) singleRungLadders++;
      byLevel.forEach((candidates: ExerciseDoc[]) => {
        if (candidates.length > 1) {
          collisionBucketsRaw++;
          const mainOnly = candidates.filter((c: ExerciseDoc) => (c.exerciseRole ?? 'main') === 'main');
          const pool = mainOnly.length ? mainOnly : candidates;
          const withMethods = pool.filter((c: ExerciseDoc) => (c.execution_methods?.length ?? 0) > 0);
          const resolved = withMethods.length ? withMethods : pool;
          if (resolved.length > 1) collisionBucketsAfterTiebreak++;
        }
      });
    });
  });

  console.log(`\n(family, programId) pairs forming a ladder: ${ladderPairs}`);
  console.log(`  of which single-rung (no real ladder, degenerate case): ${singleRungLadders}`);
  console.log(`  average rungs per ladder: ${ladderPairs ? (totalRungs / ladderPairs).toFixed(2) : 'n/a'}`);
  console.log(`(family, programId, level) buckets with >1 exercise (raw collision): ${collisionBucketsRaw}`);
  console.log(`  still >1 after role+execution_methods tie-break (falls to alpha-by-id): ${collisionBucketsAfterTiebreak}`);
}

async function checkTwo(db: admin.firestore.Firestore) {
  console.log('\n=== CHECK #2 — progression.tracks[domain] shape: .level vs .currentLevel ===\n');
  const snap = await db.collection('users').limit(200).get();
  let sampled = 0;
  let hasLevel = 0;
  let hasCurrentLevel = 0;
  let hasBoth = 0;
  let hasNeither = 0;
  const sampleDomainKeys = new Set<string>();

  for (const doc of snap.docs) {
    const data = doc.data() as Record<string, unknown>;
    const progression = data.progression as Record<string, unknown> | undefined;
    const tracks = progression?.tracks as Record<string, Record<string, unknown>> | undefined;
    if (!tracks || Object.keys(tracks).length === 0) continue;
    sampled++;
    for (const domainKey of Object.keys(tracks)) sampleDomainKeys.add(domainKey);
    const anyDomain = Object.values(tracks)[0] as Record<string, unknown> | undefined;
    if (!anyDomain) continue;
    const has1 = typeof anyDomain.level === 'number';
    const has2 = typeof anyDomain.currentLevel === 'number';
    if (has1 && has2) hasBoth++;
    else if (has1) hasLevel++;
    else if (has2) hasCurrentLevel++;
    else hasNeither++;
  }

  console.log(`Sampled users with non-empty progression.tracks: ${sampled} (of up to 200 scanned)`);
  console.log(`  .level present (no .currentLevel): ${hasLevel}`);
  console.log(`  .currentLevel present (no .level): ${hasCurrentLevel}`);
  console.log(`  BOTH present: ${hasBoth}`);
  console.log(`  NEITHER present (unexpected shape — inspect manually): ${hasNeither}`);
  console.log(`  Observed domain keys across sample: ${Array.from(sampleDomainKeys).join(', ') || '(none)'}`);
}

async function main() {
  const db = initFb();
  await checkOne(db);
  await checkTwo(db);
  console.log('\nDone. No writes were made.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
