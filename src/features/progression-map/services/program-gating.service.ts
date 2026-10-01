/**
 * program-gating.service.ts — Progression System v2, Phase 1.
 *
 * Pure gating logic: given a user's per-domain track levels + access tier,
 * and a program's derived prerequisites (prerequisite-derivation.service.ts)
 * + requiredTier, decides whether the program is available,
 * prerequisite-locked, needs-assessment, or PRO-locked — and
 * (getProgramState) folds in the read-side convention Phase 0's recon
 * already confirmed: active = in activePrograms; tracked = has a tracks
 * entry but is NOT in activePrograms. No stored status field anywhere —
 * every value here is derived at read time from existing data.
 *
 * Side-effect-free: takes plain data as arguments (not the real
 * UserFullProfile/Program types), same reasoning as
 * build-skill-tree.service.ts — no Firestore reads, testable in isolation.
 * A caller adapts real user data via user.progression.tracks[programId]
 * .currentLevel (DomainTrackProgress) and getUserAccessLevel(user)
 * (access-control.service.ts) for `tier`.
 *
 * Signature note (flagged, not silently done): the brief describes
 * evaluateProgramGate(user, programId) and getProgramState(user, programId).
 * Both are implemented here taking the PROGRAM DATA and (for
 * getProgramState) the already-computed GATE RESULT as explicit arguments
 * instead of a bare programId — a pure function can't fetch a Program doc
 * or build a skill tree by ID without becoming impure. This mirrors the
 * existing codebase convention (buildSkillTree(exercises, programId),
 * resolveLevelInProgram(exercise, programId) — both take data, not just an
 * ID to look up) and keeps derivePrerequisites → evaluateProgramGate →
 * getProgramState independently testable and composable.
 */
import type { DerivedPrerequisite } from './prerequisite-derivation.service';

export interface GateUserTracks {
  /** programId → this user's currentLevel in that program's track, if assessed. */
  [programId: string]: number;
}

export interface GateUserContext {
  tracks: GateUserTracks;
  /** The user's effective access tier — see getUserAccessLevel() in access-control.service.ts. */
  tier: 1 | 2 | 3;
}

export type ProgramGateResult =
  | { status: 'available' }
  | { status: 'locked_prereq'; requirements: { domainProgramId: string; need: number; have: number }[] }
  | { status: 'needs_assessment'; requirements: { domainProgramId: string; need: number }[] }
  | { status: 'locked_pro' };

/**
 * Precedence: prerequisite gating is decided FIRST — needs_assessment before
 * locked_prereq, since a below-level verdict presupposes a known level; a
 * program with an unassessed prerequisite domain is "unknown," not "known
 * too low." PRO-tier gating is checked LAST, matching the brief exactly
 * ("no point selling something not yet reachable").
 */
export function evaluateProgramGate(
  user: GateUserContext,
  program: { requiredTier?: 1 | 2 | 3 },
  prerequisites: DerivedPrerequisite[],
): ProgramGateResult {
  const unassessed: { domainProgramId: string; need: number }[] = [];
  const below: { domainProgramId: string; need: number; have: number }[] = [];

  for (const prereq of prerequisites) {
    const have = user.tracks[prereq.domainProgramId];
    if (have == null) {
      unassessed.push({ domainProgramId: prereq.domainProgramId, need: prereq.minLevel });
    } else if (have < prereq.minLevel) {
      below.push({ domainProgramId: prereq.domainProgramId, need: prereq.minLevel, have });
    }
  }

  if (unassessed.length > 0) return { status: 'needs_assessment', requirements: unassessed };
  if (below.length > 0) return { status: 'locked_prereq', requirements: below };

  const requiredTier = program.requiredTier ?? 1;
  if (user.tier < requiredTier) return { status: 'locked_pro' };

  return { status: 'available' };
}

/**
 * The brief's selector enumerates 5 output states
 * (active|tracked|available|locked_prereq|locked_pro), omitting
 * needs_assessment. Flagged rather than silently dropped: evaluateProgramGate
 * genuinely returns needs_assessment (and the brief's own required test list
 * includes a "prereq-unassessed→needs_assessment" case), so folding it into
 * locked_prereq here would misreport "never assessed" as "known too low" —
 * real information loss. Passing it through as a 6th possible state until
 * confirmed with David.
 */
export type ProgramState = 'active' | 'tracked' | ProgramGateResult['status'];

export interface GateUserActiveState extends GateUserContext {
  /** programIds currently in the user's activePrograms array. */
  activeProgramIds: Set<string>;
}

export function getProgramState(
  user: GateUserActiveState,
  programId: string,
  gate: ProgramGateResult,
): ProgramState {
  if (user.activeProgramIds.has(programId)) return 'active';
  if (user.tracks[programId] != null) return 'tracked';
  return gate.status;
}
