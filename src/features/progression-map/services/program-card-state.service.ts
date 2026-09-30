/**
 * program-card-state.service.ts — Progression System v2, Phase 4a.
 *
 * Pure state->variant mapping for ProgramProgressCard's new `state` prop:
 * maps Phase 1's 6-value ProgramState (active/tracked/available/
 * locked_prereq/needs_assessment/locked_pro) down to the 4 card-visual
 * states this phase ships (no PRO yet — locked_pro is defensively folded
 * into locked_prereq with no hint, since it should be structurally
 * unreachable while every Program.requiredTier check is tier-1-passes).
 * needs_assessment renders identically to locked_prereq, distinguished
 * only by lockedHint text ("בצע מבדק" vs the derived prerequisite label).
 *
 * All inputs are plain, already-slug-normalized data — no Firestore/store
 * access here, so this is independently unit-testable without React/jsdom
 * (this repo's vitest config is node-only, no jsdom — see the hook wrapper,
 * useProgramCardState.ts, for the React/store-reading side).
 */
import { derivePrerequisites } from './prerequisite-derivation.service';
import { evaluateProgramGate, getProgramState, type ProgramState } from './program-gating.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

export type ProgramCardVisualState = 'active' | 'tracked' | 'available' | 'locked_prereq';

export interface ProgramCardStateResult {
  state: ProgramCardVisualState;
  lockedHint?: string;
}

/**
 * The exact lockedHint text for the needs_assessment case (Progression v2
 * Phase 4a/4a-fix) — exported as a named constant, not a string literal
 * repeated at each call site, since it's the one thing distinguishing
 * "never assessed" from a real derived prerequisite label wherever a
 * consumer needs to react differently to the two (e.g. rendering the hint
 * as a tappable "start assessment" CTA only in this specific case).
 */
export const NEEDS_ASSESSMENT_HINT = 'בצע מבדק';

/** Hebrew labels for the 4 broad-domain slugs a derived prerequisite can name. */
const DOMAIN_HEBREW_LABELS: Record<string, string> = {
  pull: 'משיכה',
  push: 'דחיפה',
  core: 'ליבה',
  legs: 'רגליים',
};

export function resolveProgramCardState(params: {
  /** The card's own program id, already resolved to the SAME key-space as flatTracksBySlug/activeProgramSlugs (slug-normalized). */
  programSlug: string;
  /** Only leaf/skill programs (Phase 1's allow-list) get real prerequisite derivation — derivePrerequisites is built around a skill's own tree, not meaningful for a master program. */
  isLeafSkillProgram: boolean;
  /** The already-hydrated client exercise catalog (useExerciseLibraryStore) — only read when isLeafSkillProgram. */
  allExercises: Exercise[];
  /** The RAW Firestore id to pass to derivePrerequisites/buildSkillTree (its own tree-building id-space) — usually the same string as programSlug for skill programs, whose "slug" IS their raw id in this codebase's data. */
  rawSkillProgramId: string;
  flatTracksBySlug: Record<string, number>;
  activeProgramSlugs: Set<string>;
  /** Translates a derived prerequisite's raw domain id to the same slug space (resolveToSlug). */
  resolveDomainSlug: (rawDomainId: string) => string;
}): ProgramCardStateResult {
  const prerequisites =
    params.isLeafSkillProgram && params.allExercises.length > 0
      ? derivePrerequisites(params.allExercises, params.rawSkillProgramId)
      : [];
  const prereqsSlugSpace = prerequisites.map((p) => ({
    domainProgramId: params.resolveDomainSlug(p.domainProgramId),
    minLevel: p.minLevel,
  }));

  const gate = evaluateProgramGate({ tracks: params.flatTracksBySlug, tier: 1 }, {}, prereqsSlugSpace);
  const rawState: ProgramState = getProgramState(
    { tracks: params.flatTracksBySlug, tier: 1, activeProgramIds: params.activeProgramSlugs },
    params.programSlug,
    gate,
  );

  if (rawState === 'active' || rawState === 'tracked' || rawState === 'available') {
    return { state: rawState };
  }
  if (rawState === 'needs_assessment') {
    return { state: 'locked_prereq', lockedHint: NEEDS_ASSESSMENT_HINT };
  }
  // locked_prereq, and the (this-phase-unreachable) locked_pro folded the same way.
  if (gate.status === 'locked_prereq' && gate.requirements.length > 0) {
    const req = gate.requirements[0];
    const label = DOMAIN_HEBREW_LABELS[req.domainProgramId] ?? req.domainProgramId;
    return { state: 'locked_prereq', lockedHint: `דרוש ${label} ${req.need}` };
  }
  return { state: 'locked_prereq' };
}
