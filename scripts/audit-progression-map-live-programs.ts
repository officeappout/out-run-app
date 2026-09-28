/**
 * scripts/audit-progression-map-live-programs.ts — Progression Map data
 * verification for a set of allow-listed leaf programs.
 *
 * READ-ONLY: fetches `exercises`, runs them through the REAL app pipeline
 * (buildSkillTree → groupRungsForDisplay → resolveTreeNodeImage, imported
 * directly from src/, not reimplemented) for each program below, and
 * prints a report. Writes nothing to Firestore, no --apply flag.
 *
 * Purpose: confirm real data renders a clean tree BEFORE reporting a
 * program as verified/live — level grouping, one representative + swap
 * count per level, and whether every node resolves a real PARK image (or
 * silently falls back to home, which is a content gap to flag, not a code
 * bug). Reuses the exact same functions TreeNode/TreePath/SkillTreeScreen
 * call at runtime, so this script can't drift from real app behavior.
 *
 * PROGRAMS below = the batch being verified THIS run — edit this array for
 * a future batch, nothing else in this script is per-program. Every ID
 * must already be on PROGRESSION_MAP_LEAF_PROGRAM_IDS
 * (src/lib/progression-map-config.ts) — that allow-list already includes
 * all 6 Phase-1 skills (created in the original Phase-1 build commit); it
 * is not what stages a rollout. What actually gates "is this program's
 * tree considered verified/live" is purely: has someone run a check like
 * this one against it and confirmed the data is clean. Handstand
 * (IOfBZFeorTTDkcz3tOA6) and human flag (EtY8YCol0qpF6DzgcTx1) are
 * deliberately NOT in this run's list.
 *
 * Usage: npx tsx scripts/audit-progression-map-live-programs.ts
 * (Needs .env.local / FIREBASE_SERVICE_ACCOUNT_KEY — run from an
 * environment that has it, e.g. the main checkout; this worktree doesn't.)
 */
import * as dotenv from 'dotenv'; dotenv.config({ path: '.env.local' }); dotenv.config();
import * as admin from 'firebase-admin';
import { buildSkillTree, groupRungsForDisplay } from '../src/features/progression-map/services/build-skill-tree.service';
import { resolveTreeNodeImage } from '../src/features/progression-map/services/resolve-tree-node-image';
import type { Exercise } from '../src/features/content/exercises/core/exercise.types';

const PROGRAMS_TO_CHECK: { id: string; name: string }[] = [
  { id: 'pCI5NHXpowu2ySucqDn8', name: 'פלאנץ׳' },
  { id: 'cC0BOmm6KIqYAyQynEIo', name: 'מתח יד אחת' },
  { id: 'PAxprHuT7HjqrWU4wl0T', name: 'HSPU' },
];

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

async function loadAllExercises(db: admin.firestore.Firestore): Promise<Exercise[]> {
  const snap = await db.collection('exercises').get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as unknown as Exercise));
}

/**
 * resolveTreeNodeImage's own round-6/7 diagnostic already logs exactly the
 * tier info this report needs — intercept it instead of re-deriving
 * park-method logic here a second time (which could silently drift from
 * the real function over time).
 */
function callWithCapturedDiagnostic(exercise: Exercise): { url: string; diagnostic: any } {
  let captured: any = null;
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    if (args[0] === '[resolveTreeNodeImage]') captured = args[1];
  };
  const url = resolveTreeNodeImage(exercise);
  console.log = originalLog;
  return { url, diagnostic: captured };
}

async function main() {
  const db = initFb();
  const allExercises = await loadAllExercises(db);
  console.log(`Loaded ${allExercises.length} exercises total.\n`);

  for (const program of PROGRAMS_TO_CHECK) {
    console.log(`\n${'='.repeat(70)}\n${program.name} (${program.id})\n${'='.repeat(70)}`);

    const tree = buildSkillTree(allExercises, program.id);
    if (!tree) {
      console.log('  ❌ NO TREE — zero exercises resolve a level for this program. Not ready to go live.');
      continue;
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
      const tier: string = diagnostic?.tier ?? 'unknown';
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
  }

  console.log('\nDone. No writes were made.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
