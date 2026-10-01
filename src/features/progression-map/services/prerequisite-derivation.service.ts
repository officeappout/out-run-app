/**
 * prerequisite-derivation.service.ts — Progression System v2, Phase 1.
 *
 * Pure derivation: a skill program's prerequisite(s) come from its OWN
 * lowest-level target-exercise's targetPrograms tags into a broad domain
 * program (משיכה/דחיפה/ליבה/legs) — no separate "prerequisite" field on
 * Program or Exercise, no manual-override mechanism yet (all 4 in-scope
 * skills this phase — front-lever, planche, one-arm-pull, HSPU — derive
 * cleanly per Phase 0's live audit; human-flag, which does NOT derive
 * cleanly, is explicitly out of scope this round).
 *
 * "Lowest observed level" (tree.minLevel), not literal level 1 — HSPU's own
 * tree starts at level 3, so it has no level-1 rung at all.
 *
 * Side-effect-free: takes exercises as an argument, no Firestore reads, no
 * React — same convention as build-skill-tree.service.ts (whose
 * buildSkillTree this reuses rather than re-deriving the ladder).
 */
import type { Exercise } from '@/features/content/exercises';
import { buildSkillTree } from './build-skill-tree.service';

/**
 * The 4 broad-domain program IDs a skill's lowest-level exercise can be
 * tagged to. משיכה/דחיפה were given directly in Phase 0's brief; ליבה was
 * resolved from live program names during Phase 0's recon
 * (kDMpobbKsuVTByTIKUpe). "legs" is OrAmOH3F375dVio5yGdU per Phase 1's
 * brief ("פלג גוף תחתון") — a DIFFERENT live program than "רגליים", which
 * does not resolve to any program by that name today. That naming gap was
 * flagged, not fixed, in Phase 0 and stays flagged here — out of scope this
 * phase per the brief ("the 'רגליים' name cleanup — flag it, don't fix").
 */
export const DOMAIN_PROGRAM_IDS = {
  pull: 'UPDBtTdCvX748dtBlWYj', // משיכה
  push: 'J0fLpmJhG0KDN2tQouxh', // דחיפה
  core: 'kDMpobbKsuVTByTIKUpe', // ליבה
  legs: 'OrAmOH3F375dVio5yGdU', // פלג גוף תחתון
} as const;

const DOMAIN_PROGRAM_ID_SET: ReadonlySet<string> = new Set(Object.values(DOMAIN_PROGRAM_IDS));

export interface DerivedPrerequisite {
  domainProgramId: string;
  minLevel: number;
}

/**
 * Phase 4c-2, Item 2 (muscle_up "Model A"): manual prerequisite overrides
 * for skills whose real exercise data cannot express their intended
 * prerequisite through the data-driven path below. Confirmed via a live
 * Firestore audit of all 14 exercises tagged directly to muscle_up
 * (fTLWzjP9gH2VNpamyCZF): zero carry a push tag, and the two lowest-level
 * exercises (the ones derivePrerequisites would otherwise consult) carry
 * no domain tag at all — so the data-driven path below returns [] for it,
 * not the intended push+pull pair. muscle_up is genuinely composed of both
 * push and pull (an AND, not a single domain) per David's explicit
 * decision — minLevel 10 for both, David-supplied (not data-derivable;
 * no muscle_up exercise is push-tagged at any level).
 *
 * Checked before adding this: evaluateProgramGate (program-gating.service.ts)
 * already implements AND semantics over however many entries a
 * DerivedPrerequisite[] carries — no gating-side change was needed, only
 * this derivation-side override.
 */
const MANUAL_PREREQUISITE_OVERRIDES: Readonly<Record<string, DerivedPrerequisite[]>> = {
  fTLWzjP9gH2VNpamyCZF: [
    { domainProgramId: DOMAIN_PROGRAM_IDS.push, minLevel: 10 },
    { domainProgramId: DOMAIN_PROGRAM_IDS.pull, minLevel: 10 },
  ],
};

/**
 * Derives a skill program's prerequisite(s) from its own lowest-level
 * target-exercise's targetPrograms tags into a broad domain program.
 * Returns [] when there's no tree, the lowest rung is a gap or has no
 * representative, or the representative carries no domain tag at all (a
 * genuine gap — e.g. דגל אנושי, out of scope this phase) — the caller
 * treats an empty array as "no prerequisite," not an error.
 */
export function derivePrerequisites(allExercises: Exercise[], skillProgramId: string): DerivedPrerequisite[] {
  const override = MANUAL_PREREQUISITE_OVERRIDES[skillProgramId];
  if (override) return override;

  const tree = buildSkillTree(allExercises, skillProgramId);
  if (!tree) return [];

  const lowestRung = tree.rungs.find((r) => r.level === tree.minLevel);
  if (!lowestRung || lowestRung.isGap || !lowestRung.representative) return [];

  const tags = lowestRung.representative.targetPrograms ?? [];
  return tags
    .filter((tp) => tp.programId !== skillProgramId && DOMAIN_PROGRAM_ID_SET.has(tp.programId))
    .map((tp) => ({ domainProgramId: tp.programId, minLevel: tp.level }));
}
