/**
 * program-card-state.service.ts — Progression System v2, Phase 4a.
 *
 * Pure state->variant mapping for ProgramProgressCard's new `state` prop:
 * maps Phase 1's 6-value ProgramState (active/tracked/available/
 * locked_prereq/needs_assessment/locked_pro) down to this phase's
 * card-visual states (no PRO yet — locked_pro is defensively folded into
 * locked_prereq with no hint, since it should be structurally unreachable
 * while every Program.requiredTier check is tier-1-passes).
 * needs_assessment renders identically to locked_prereq, distinguished
 * only by lockedHint text ("בצע מבדק" vs the derived prerequisite label).
 *
 * Phase 4a-fix: 'available' is never returned bare — see
 * resolveProgramCardState's own reasoning. A program that's structurally
 * "never assessed, no blocking prerequisite" gets the SAME locked_prereq/
 * "בצע מבדק" treatment as needs_assessment when it's a leaf/skill program
 * (it has its own questionnaire), or the new not_started_master state when
 * it doesn't (a master has no own questionnaire, no own real level to
 * fabricate).
 *
 * Phase 4b round 3: 'tracked' is ALSO folded into not_started_master for a
 * master with fewer than 2 real configured children (configuredMasterChildCount).
 * Root cause this closes (recon'd, not guessed): onboarding-sync's
 * SKILL_TO_FOUNDATION_OFFSET cascade writes a `tracks` entry for a master
 * (e.g. calisthenics_upper) as a side effect of assessing just ONE skill,
 * which used to satisfy getProgramState's bare `tracks[id] != null` check
 * and surface a card for a master that isn't meaningfully populated yet —
 * the exact "too many masters at L14" / "calisthenics_upper opens with only
 * [pull] configured" bugs. Scoped to 'tracked' only (not 'active') per
 * David's explicit call: an active master reflects deliberate user intent
 * (onboarding focus selection), a cascade-derived tracked entry doesn't.
 *
 * All inputs are plain, already-slug-normalized data — no Firestore/store
 * access here, so this is independently unit-testable without React/jsdom
 * (this repo's vitest config is node-only, no jsdom — see the hook wrapper,
 * useProgramCardState.ts, for the React/store-reading side).
 */
import { derivePrerequisites } from './prerequisite-derivation.service';
import { evaluateProgramGate, getProgramState, type ProgramState } from './program-gating.service';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

/**
 * Progression v2 Phase 4a-fix: 'available' is included for spec-fidelity
 * (the original 4-state brief named it) but resolveProgramCardState below
 * never actually RETURNS it bare anymore — see that function's reasoning.
 * 'not_started_master' is new: a master's own rollup level is never a real
 * assessed level (no own questionnaire exists for a master), so it needs a
 * visibly DIFFERENT "not started" treatment than a locked leaf program —
 * never "בצע מבדק" (nothing to assess), never a fabricated level.
 */
export type ProgramCardVisualState = 'active' | 'tracked' | 'available' | 'locked_prereq' | 'not_started_master';

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
  /**
   * Only meaningful when !isLeafSkillProgram (a master). How many of this
   * master's own subPrograms resolve to a slug with a real (>0) track level
   * — undefined while the caller hasn't fetched the master's Program doc
   * yet (never gates in that case, matching this hook's existing "don't
   * flash a wrong state during a brief loading window" pattern elsewhere).
   */
  configuredMasterChildCount?: number;
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

  if (rawState === 'active') {
    return { state: 'active' };
  }
  if (rawState === 'tracked') {
    const notMeaningfullyPopulated =
      !params.isLeafSkillProgram &&
      params.configuredMasterChildCount != null &&
      params.configuredMasterChildCount < 2;
    return notMeaningfullyPopulated ? { state: 'not_started_master' } : { state: 'tracked' };
  }
  if (rawState === 'available') {
    // Progression v2 Phase 4a-fix: 'available' structurally means "not
    // active, not tracked" — i.e. this program has NEVER been assessed
    // either way (no real track entry to read a level from). A leaf/skill
    // program in this state genuinely can be assessed (it has its own
    // mini-questionnaire), so it gets the SAME treatment as
    // needs_assessment (dashed card + "בצע מבדק"). A master has no own
    // questionnaire at all — it gets a distinct "not started" treatment
    // instead (never a fabricated own level, never an assessment CTA
    // that doesn't exist for it).
    return params.isLeafSkillProgram
      ? { state: 'locked_prereq', lockedHint: NEEDS_ASSESSMENT_HINT }
      : { state: 'not_started_master' };
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
