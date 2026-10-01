/**
 * audit-live-programs.test.ts — Progression Map data verification for a
 * set of allow-listed leaf programs, as a vitest test instead of a
 * standalone `npx tsx` script.
 *
 * WHY a test file, not a script: scripts/audit-progression-map-live-
 * programs.ts (the previous attempt) imported the real app modules via
 * relative `../src/...` paths and failed under plain `npx tsx` — module
 * resolution for this repo's path setup only works reliably through
 * Vitest's own resolver (the `@/` alias + its transform pipeline), the
 * same way every other test in this codebase already imports src/ code.
 * Converted here instead of fighting tsx's resolution.
 *
 * READ-ONLY: fetches `exercises` once (beforeAll) and runs them through
 * the REAL app pipeline — buildSkillTree / groupRungsForDisplay /
 * resolveTreeNodeImage, imported directly, not reimplemented — for each
 * allow-listed program below. Writes nothing to Firestore.
 *
 * Gated on live credentials: this suite is SKIPPED (not failed) whenever
 * FIREBASE_SERVICE_ACCOUNT_KEY isn't set — true for this worktree, and for
 * anyone running `npx vitest run` without a real Firestore key. To
 * actually run it:
 *
 *   npx vitest run src/features/progression-map/services/__tests__/audit-live-programs.test.ts
 *
 * from an environment with FIREBASE_SERVICE_ACCOUNT_KEY available (e.g.
 * the main checkout's .env.local — Vitest loads .env.local into
 * process.env automatically, same as `vite dev` would; the dotenv calls
 * below are a harmless, explicit fallback in case that auto-load doesn't
 * apply in some invocation, mirroring the original audit-progression-map-
 * phase0.ts script's own credential-loading pattern).
 *
 * PROGRAMS below = the batch being verified this run — edit this array
 * for a future batch (e.g. handstand/human flag later), nothing else here
 * is per-program. Every ID must already be on
 * PROGRESSION_MAP_LEAF_PROGRAM_IDS (src/lib/progression-map-config.ts) —
 * confirmed separately that allow-list already includes all 6 Phase-1
 * skills since the original Phase-1 build; this file only verifies DATA
 * quality, not code wiring.
 *
 * Round 11 addition: a DIAGNOSTIC test (separate from the per-program
 * PROGRAMS_TO_CHECK loop) also fetches `programs` and prints, for
 * מתח-יד-אחת level 1 specifically, every candidate's full targetPrograms
 * array (each entry annotated with the target program's real isMaster
 * flag) plus the computed difficultyProxy and the actual winner — proving
 * from real data why the beginner-appropriate representative pick lands
 * where it does, instead of guessing.
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import { describe, it, expect, beforeAll } from 'vitest';
import * as admin from 'firebase-admin';
import { buildSkillTree, groupRungsForDisplay, difficultyProxy } from '../build-skill-tree.service';
import { resolveTreeNodeImage } from '../resolve-tree-node-image';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * Round 11 diagnostic target: the concrete reported example from the
 * founder — מתח-יד-אחת (one-arm-pullup) level 1 should prefer the
 * candidate with the lower level in whichever OTHER program it's tagged
 * to (build-skill-tree.service.ts's difficultyProxy), but round 10's
 * isMaster-gated version of that rule never flipped against real data.
 * This is its own program id, separate from PROGRAMS_TO_CHECK above,
 * since the diagnostic below is scoped to exactly this one program+level,
 * not the general per-program report loop.
 */
const ONE_ARM_PULLUP_ID = 'cC0BOmm6KIqYAyQynEIo';
const DIAGNOSTIC_LEVEL = 1;

const PROGRAMS_TO_CHECK: { id: string; name: string }[] = [
  { id: 'pCI5NHXpowu2ySucqDn8', name: 'פלאנץ׳' },
  { id: 'cC0BOmm6KIqYAyQynEIo', name: 'מתח יד אחת' },
  { id: 'PAxprHuT7HjqrWU4wl0T', name: 'HSPU' },
];

const hasCredentials = !!process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

type LocalizedTextLike = { he?: string; en?: string; es?: string } | string | undefined;
function nameOf(value: LocalizedTextLike, fallback: string): string {
  if (!value) return fallback;
  if (typeof value === 'string') return value || fallback;
  return value.he || value.en || value.es || fallback;
}

function initFb(): admin.firestore.Firestore {
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  if (!admin.apps.length) {
    admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
  }
  return admin.firestore();
}

/**
 * resolveTreeNodeImage's own round-6/7 diagnostic already logs exactly the
 * tier info this report needs — intercept it instead of re-deriving
 * park-method logic a second time (which could silently drift from the
 * real function over time). Everything else logged during the call still
 * passes through untouched.
 */
function callWithCapturedDiagnostic(exercise: Exercise): { url: string; diagnostic: Record<string, unknown> | null } {
  let captured: Record<string, unknown> | null = null;
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    if (args[0] === '[resolveTreeNodeImage]') {
      captured = args[1] as Record<string, unknown>;
      return;
    }
    originalLog(...(args as []));
  };
  const url = resolveTreeNodeImage(exercise);
  console.log = originalLog;
  return { url, diagnostic: captured };
}

describe.skipIf(!hasCredentials)('progression-map — live-data audit (real Firestore, read-only)', () => {
  let allExercises: Exercise[] = [];

  let programIsMaster: Map<string, boolean> = new Map();

  beforeAll(async () => {
    const db = initFb();
    const snap = await db.collection('exercises').get();
    allExercises = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as unknown as Exercise);
    console.log(`\nLoaded ${allExercises.length} exercises total.\n`);

    const programsSnap = await db.collection('programs').get();
    programIsMaster = new Map(programsSnap.docs.map((d) => [d.id, d.data().isMaster === true]));
    console.log(`Loaded ${programIsMaster.size} programs (for isMaster lookup in the diagnostic below).\n`);
  });

  it('DIAGNOSTIC — מתח יד אחת level 1: every candidate, its full targetPrograms (+ isMaster per entry), computed proxy, and the winner', () => {
    const candidates = allExercises.filter((exArg) =>
      exArg.targetPrograms?.some((tp) => tp.programId === ONE_ARM_PULLUP_ID && tp.level === DIAGNOSTIC_LEVEL),
    );

    console.log(`\n${'='.repeat(70)}\nDIAGNOSTIC: מתח יד אחת (${ONE_ARM_PULLUP_ID}) level ${DIAGNOSTIC_LEVEL}\n${'='.repeat(70)}`);
    console.log(`${candidates.length} candidate(s) tagged to this exact (programId, level):\n`);

    for (const c of candidates) {
      const name = nameOf(c.name as LocalizedTextLike, c.id);
      const tpsAnnotated = (c.targetPrograms ?? []).map((tp) => ({
        programId: tp.programId,
        level: tp.level,
        isMaster: programIsMaster.has(tp.programId) ? programIsMaster.get(tp.programId) : '(program doc not found)',
      }));
      const proxy = difficultyProxy(c, ONE_ARM_PULLUP_ID);
      console.log(`  - "${name}" (${c.id})`);
      console.log(`      targetPrograms: ${JSON.stringify(tpsAnnotated)}`);
      console.log(`      computed difficultyProxy (round 11 — lowest level across ALL other entries, isMaster ignored): ${proxy === Infinity ? '∞ (no other targetPrograms entry)' : proxy}`);
    }

    const tree = buildSkillTree(allExercises, ONE_ARM_PULLUP_ID);
    const rung = tree?.rungs.find((r) => r.level === DIAGNOSTIC_LEVEL);
    const winner = rung?.representative;
    const winnerName = winner ? nameOf(winner.name as LocalizedTextLike, winner.id) : '(none — no tree or gap at this level)';
    console.log(`\n  → WINNER (buildSkillTree's actual pick): "${winnerName}" (${winner?.id ?? 'none'})\n`);

    expect(candidates.length, 'no candidates found at all for מתח יד אחת level 1 — check the program id / level are still correct').toBeGreaterThan(0);
  });

  it.each(PROGRAMS_TO_CHECK)('$name ($id) — level range / gaps / crown / per-level image tier', (program) => {
    console.log(`\n${'='.repeat(70)}\n${program.name} (${program.id})\n${'='.repeat(70)}`);

    const tree = buildSkillTree(allExercises, program.id);
    if (!tree) {
      console.log('  ❌ NO TREE — zero exercises resolve a level for this program. Not ready to go live.');
      expect(tree, `${program.name} (${program.id}): zero exercises resolve a level — check targetPrograms tagging`).not.toBeNull();
      return;
    }

    console.log(`  Levels ${tree.minLevel}–${tree.maxLevel} (${tree.rungs.length} rungs, ${tree.exerciseCount} distinct exercise(s) tagged)`);

    const segments = groupRungsForDisplay(tree.rungs);
    const gapSegments = segments.filter((s) => s.type === 'gap');
    if (gapSegments.length) {
      console.log(
        `  ⚠️  GAP(S): ${gapSegments.map((g) => (g.fromLevel === g.toLevel ? `L${g.fromLevel}` : `L${g.fromLevel}-L${g.toLevel}`)).join(', ')} — renders as a "no exercise" pill, not a node.`,
      );
    } else {
      console.log('  No gaps — every level in range has a representative.');
    }

    const targetRung = tree.rungs.find((r) => r.level === tree.maxLevel);
    if (!targetRung || targetRung.isGap) {
      console.log(`  ⚠️  TARGET LEVEL (max=${tree.maxLevel}) IS A GAP — no crown node, tree has no real destination exercise.`);
    } else {
      console.log(`  Target (crown) = L${tree.maxLevel}: "${nameOf(targetRung.representative!.name as LocalizedTextLike, targetRung.representative!.id)}"`);
    }

    if (tree.exerciseCount === 1) {
      console.log('  ⚠️  Only 1 exercise tagged total — a single-node "tree", no real ladder to climb.');
    }

    console.log('\n  Per-level:');
    let parkResolvedCount = 0;
    let homeFallbackCount = 0;
    for (const rung of tree.rungs) {
      if (rung.isGap) {
        console.log(`    L${rung.level}: — (gap)`);
        continue;
      }
      const ex = rung.representative!;
      const exName = nameOf(ex.name as LocalizedTextLike, ex.id);
      const { url, diagnostic } = callWithCapturedDiagnostic(ex);
      const tier = (diagnostic?.tier as string) ?? 'unknown';
      const resolvedViaPark = tier === 'preview' || tier === 'method-image' || tier === 'video-thumbnail';
      if (resolvedViaPark) parkResolvedCount++;
      else homeFallbackCount++;

      const swapNote = rung.siblingCount > 0 ? `, +${rung.siblingCount} swap option(s)` : '';
      const imageNote = resolvedViaPark
        ? `✅ park image via ${tier}`
        : `⚠️ FELL BACK — no usable park image/video (tier=${tier}, park methods found=${diagnostic?.parkMethodCount ?? '?'}), url=${url || '(empty)'}`;
      console.log(`    L${rung.level}: "${exName}"${swapNote} — ${imageNote}`);
    }

    console.log(`\n  Image summary: ${parkResolvedCount} resolved via park, ${homeFallbackCount} fell back to home/empty (content gap if >0).`);

    expect(tree).not.toBeNull();
  });
});
