/**
 * levelup-preview — the level-up screen's result, computed INSTANTLY on the
 * device from the same engine inputs and the same pure formulas the service
 * stores with (progression-calc.ts). No Firestore here: the inputs are
 * pre-loaded (levelup-inputs.service.ts) and the stored result, when it lands,
 * goes through `outcomeFromStored` so the screen can reconcile silently.
 *
 * "One number = exactly what gets stored":
 *   • leaf   → track.percent + (base + performance + goals + mastery), ≥100 → next level, carry
 *   • master → the stored definition: recalculateMasterLevel's plain average of
 *              the configured children (after this session's child gains), with
 *              the monotonic level floor — NOT "average + Σ gains".
 */
import type {
  WorkoutCompletionResult,
  WorkoutExerciseResult,
} from '../../core/types/progression.types';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { LevelGoal } from '@/types/workout';
import {
  applyGainToTrack,
  averageMasterChildren,
  classifyExerciseToChild,
  computeGoalBonus,
  computeSessionGain,
  computeSkillMasteryBonus,
  type MasterChildEntry,
  type SessionGainRule,
} from './progression-calc';

export interface LevelPoint {
  level: number;
  percent: number;
}

export interface TrackSnapshot {
  currentLevel: number;
  percent: number;
  completedGoalIds?: string[];
  totalWorkoutsCompleted?: number;
}

export interface LeafLevelUpInputs {
  kind: 'leaf';
  programId: string;
  track: TrackSnapshot;
  rule: SessionGainRule & { linkedPrograms?: { targetProgramId: string; multiplier: number }[] };
  goals: LevelGoal[];
  /** PROGRESSION_RULES_FROM_ADMIN_V1 — goal bonus once per level. */
  oneTimeGoals: boolean;
}

export interface MasterLevelUpInputs {
  kind: 'master';
  programId: string;
  childSlugs: string[];
  childTracks: Record<string, TrackSnapshot | undefined>;
  childRules: Record<string, SessionGainRule>;
  exerciseLookup: Map<string, Exercise>;
  idToSlug: Map<string, string> | null;
  /** tracks[activeProgramId] before the session (undefined = never written). */
  masterTrack: TrackSnapshot | undefined;
  /** Pre-session getMasterProgramProgress (null = the master isn't recalculated). */
  averaging: (MasterAveraging & {
    /** tracks[masterDocId].currentLevel when the master's doc id ≠ activeProgramId (legacy hash key). */
    hashKeyLevel?: number;
  }) | null;
}

/** One master's pre-session average (recalculateMasterLevel's inputs). */
export interface MasterAveraging {
  masterSlug: string;
  subPrograms: MasterChildEntry[];
  configuredChildIds: string[];
  skillFocusIds?: string[];
  /** Stored point before the session (= max(average, prior) level, average percent). */
  displayLevel: number;
  displayPercent: number;
  /** A child that is itself a master (e.g. full_body → upper_body) — recalculated first. */
  nested?: Record<string, MasterAveraging>;
}

/**
 * recalculateMasterLevel for one master after the session: children with a
 * new track (or a nested master's new average) replace their entries, a
 * written child counts as configured, then the plain average with the
 * monotonic level floor (`priorLevel`). An aborted average keeps the old point.
 */
export function averagingAfter(
  avg: MasterAveraging,
  childNew: Map<string, LevelPoint>,
  priorLevel: number,
): LevelPoint {
  const configured = new Set(avg.configuredChildIds);
  const subPrograms = avg.subPrograms.map((sp) => {
    const nested = avg.nested?.[sp.programId];
    const next = nested ? averagingAfter(nested, childNew, nested.displayLevel) : childNew.get(sp.programId);
    if (!next) return sp;
    if (next.level > 0) configured.add(sp.programId);
    return { programId: sp.programId, level: next.level, percent: next.percent };
  });
  const out = averageMasterChildren({
    masterSlug: avg.masterSlug,
    subPrograms,
    configuredChildIds: configured,
    skillFocusIds: avg.skillFocusIds,
  });
  if (out.routingEmptySkip) return { level: Math.max(avg.displayLevel, priorLevel), percent: avg.displayPercent };
  return { level: Math.max(out.displayLevel, priorLevel), percent: out.displayPercent };
}

export type LevelUpInputs =
  | LeafLevelUpInputs
  | MasterLevelUpInputs
  | { kind: 'skipped'; programId: string };

export type GainChipKind = 'completion' | 'performance' | 'goals' | 'mastery' | 'domain' | 'linked';

export interface GainChip {
  id: string;
  kind: GainChipKind;
  /** Program slug for domain / linked chips (label lookup). */
  programId?: string;
  /** The gain in the chip's own track (percentage points). */
  gain: number;
  /** True when the chip moves THIS screen's ring. */
  pushesRing: boolean;
}

export interface LevelUpOutcome {
  kind: 'leaf' | 'master';
  programId: string;
  before: LevelPoint;
  after: LevelPoint;
  leveledUp: boolean;
  /** Leaf: the session's total gain. Master: null (the ring is an average). */
  totalGain: number | null;
  chips: GainChip[];
  isFirstWorkout: boolean;
}

const EPS = 1e-9;
const DEFAULT_TRACK: TrackSnapshot = { currentLevel: 1, percent: 0 };

function leafChips(parts: { base: number; bonus: number; goals: number; mastery: number }): GainChip[] {
  return [
    { id: 'completion', kind: 'completion' as const, gain: parts.base, pushesRing: true },
    { id: 'performance', kind: 'performance' as const, gain: parts.bonus, pushesRing: true },
    { id: 'goals', kind: 'goals' as const, gain: parts.goals, pushesRing: true },
    { id: 'mastery', kind: 'mastery' as const, gain: parts.mastery, pushesRing: true },
  ].filter((c) => c.gain > EPS);
}

function computeLeaf(inputs: LeafLevelUpInputs, exercises: WorkoutExerciseResult[]): LevelUpOutcome {
  const track = inputs.track;
  const { baseGain, bonusGain } = computeSessionGain(exercises, inputs.rule);
  const { goalBonusGain } = computeGoalBonus({
    goals: inputs.goals,
    exercises,
    completedGoalIds: track.completedGoalIds,
    oneTimeGoals: inputs.oneTimeGoals,
  });
  const { masteryBonusGain } = computeSkillMasteryBonus(inputs.programId, exercises);
  const totalGain = baseGain + bonusGain + goalBonusGain + masteryBonusGain;
  const applied = applyGainToTrack(track, totalGain);
  const linked: GainChip[] = (inputs.rule.linkedPrograms ?? [])
    .map((lp) => ({
      id: `linked:${lp.targetProgramId}`,
      kind: 'linked' as const,
      programId: lp.targetProgramId,
      gain: totalGain * lp.multiplier,
      pushesRing: false,
    }))
    .filter((c) => c.gain > EPS);
  return {
    kind: 'leaf',
    programId: inputs.programId,
    before: { level: track.currentLevel, percent: track.percent },
    after: { level: applied.newLevel, percent: applied.newPercent },
    leveledUp: applied.leveledUp,
    totalGain,
    chips: [...leafChips({ base: baseGain, bonus: bonusGain, goals: goalBonusGain, mastery: masteryBonusGain }), ...linked],
    isFirstWorkout: !(track.totalWorkoutsCompleted ?? 0),
  };
}

/** The stored master point (what recalculateMasterLevel leaves in tracks) before the session. */
export function masterBefore(inputs: MasterLevelUpInputs): LevelPoint {
  if (inputs.masterTrack) {
    return { level: inputs.masterTrack.currentLevel, percent: inputs.masterTrack.percent };
  }
  const a = inputs.averaging;
  if (a) return { level: a.displayLevel, percent: a.displayPercent };
  return { level: DEFAULT_TRACK.currentLevel, percent: DEFAULT_TRACK.percent };
}

/** Per-child gain (only children with sets) — the bottom-up master flow. */
export function computeChildGains(
  inputs: MasterLevelUpInputs,
  exercises: WorkoutExerciseResult[],
): { childId: string; gain: number; sets: number; base: number; bonus: number; newLevel: number; newPercent: number }[] {
  const buckets: Record<string, WorkoutExerciseResult[]> = {};
  for (const slug of inputs.childSlugs) buckets[slug] = [];
  const slugMap = inputs.idToSlug ? { idToSlug: inputs.idToSlug } : null;
  for (const ex of exercises) {
    const fs = inputs.exerciseLookup.get(ex.exerciseId) ?? null;
    const { childSlug } = classifyExerciseToChild(ex.exerciseName, ex.programLevels, inputs.childSlugs, fs, slugMap);
    if (childSlug && buckets[childSlug]) buckets[childSlug].push(ex);
  }
  const out: ReturnType<typeof computeChildGains> = [];
  for (const childId of inputs.childSlugs) {
    const rule = inputs.childRules[childId];
    const childExercises = buckets[childId] ?? [];
    if (!rule || childExercises.length === 0) continue;
    const { setsPerformed, baseGain, bonusGain } = computeSessionGain(childExercises, rule);
    if (setsPerformed === 0) continue;
    const track = inputs.childTracks[childId] ?? DEFAULT_TRACK;
    const applied = applyGainToTrack(track, baseGain + bonusGain);
    out.push({
      childId,
      gain: baseGain + bonusGain,
      sets: setsPerformed,
      base: baseGain,
      bonus: bonusGain,
      newLevel: applied.newLevel,
      newPercent: applied.newPercent,
    });
  }
  return out;
}

/**
 * The master point stored after the session, given each child's new track:
 * updateProgressionTracks writes tracks[active] = masterTrack + volume-weighted
 * gain (≥100 → +1 level), then recalculateMasterLevel overwrites it with the
 * plain average of configured children and level = max(average, prior).
 */
export function masterAfter(
  inputs: MasterLevelUpInputs,
  children: { childId: string; sets: number; base: number; bonus: number; newLevel: number; newPercent: number }[],
): LevelPoint {
  const totalSets = children.reduce((s, c) => s + c.sets, 0);
  const weighted = totalSets > 0
    ? children.reduce((s, c) => s + c.base * c.sets, 0) / totalSets +
      children.reduce((s, c) => s + c.bonus * c.sets, 0) / totalSets
    : 0;
  const written = applyGainToTrack(inputs.masterTrack ?? DEFAULT_TRACK, weighted);
  const a = inputs.averaging;
  if (!a) return { level: written.newLevel, percent: written.newPercent };

  const childNew = new Map(children.map((c) => [c.childId, { level: c.newLevel, percent: c.newPercent }]));
  // An aborted average leaves the track updateProgressionTracks wrote.
  const probe = averagingAfter({ ...a, displayLevel: written.newLevel, displayPercent: written.newPercent }, childNew, a.hashKeyLevel ?? written.newLevel);
  return probe;
}

function domainChips(children: { childId: string; gain: number }[]): GainChip[] {
  return children
    .filter((c) => c.gain > EPS)
    .map((c) => ({ id: `domain:${c.childId}`, kind: 'domain' as const, programId: c.childId, gain: c.gain, pushesRing: true }));
}

function computeMaster(inputs: MasterLevelUpInputs, exercises: WorkoutExerciseResult[]): LevelUpOutcome {
  const before = masterBefore(inputs);
  const children = computeChildGains(inputs, exercises);
  const after = masterAfter(inputs, children);
  return {
    kind: 'master',
    programId: inputs.programId,
    before,
    after,
    leveledUp: after.level > before.level,
    totalGain: null,
    chips: domainChips(children),
    isFirstWorkout: !(inputs.masterTrack?.totalWorkoutsCompleted ?? 0),
  };
}

/** Instant result from pre-loaded inputs. null = nothing to show (skipped user). */
export function computeLevelUpPreview(
  inputs: LevelUpInputs,
  exercises: WorkoutExerciseResult[],
): LevelUpOutcome | null {
  if (inputs.kind === 'leaf') return computeLeaf(inputs, exercises);
  if (inputs.kind === 'master') return computeMaster(inputs, exercises);
  return null;
}

/**
 * The outcome as STORED (reconciliation). Leaf: the service's own numbers.
 * Master: the stored master track (read back after the writes) when given,
 * else the average re-run with the service's child results.
 */
export function outcomeFromStored(
  inputs: LevelUpInputs | null,
  stored: WorkoutCompletionResult,
  fallbackBefore: LevelPoint,
  storedMasterTrack?: LevelPoint | null,
): LevelUpOutcome | null {
  if (!stored.success || stored.skipped) return null;
  const g = stored.activeProgramGain;
  if (stored.childDomainGains && stored.childDomainGains.length > 0) {
    const masterInputs = inputs?.kind === 'master' ? inputs : null;
    const before = masterInputs ? masterBefore(masterInputs) : fallbackBefore;
    const children = stored.childDomainGains
      .filter((c) => c.setsPerformed > 0)
      .map((c) => ({
        childId: c.childId,
        gain: c.totalGain,
        sets: c.setsPerformed,
        base: c.baseGain,
        bonus: c.bonusGain,
        newLevel: c.newLevel ?? (masterInputs?.childTracks[c.childId]?.currentLevel ?? DEFAULT_TRACK.currentLevel),
        newPercent: c.newPercent,
      }));
    const after = storedMasterTrack ?? (masterInputs ? masterAfter(masterInputs, children) : null);
    if (!after) return null;
    return {
      kind: 'master',
      programId: g.programId,
      before,
      after,
      leveledUp: after.level > before.level,
      totalGain: null,
      chips: domainChips(children),
      isFirstWorkout: masterInputs ? !(masterInputs.masterTrack?.totalWorkoutsCompleted ?? 0) : false,
    };
  }
  const leafInputs = inputs?.kind === 'leaf' ? inputs : null;
  const before = leafInputs
    ? { level: leafInputs.track.currentLevel, percent: leafInputs.track.percent }
    : fallbackBefore;
  const linked: GainChip[] = stored.linkedProgramGains
    .filter((l) => l.gain > EPS)
    .map((l) => ({ id: `linked:${l.programId}`, kind: 'linked' as const, programId: l.programId, gain: l.gain, pushesRing: false }));
  return {
    kind: 'leaf',
    programId: g.programId,
    before,
    after: { level: g.leveledUp ? (g.newLevel ?? before.level + 1) : before.level, percent: g.newPercent },
    leveledUp: g.leveledUp,
    totalGain: g.totalGain,
    chips: [
      ...leafChips({ base: g.baseGain, bonus: g.bonusGain, goals: g.goalBonusGain, mastery: g.masteryBonusGain }),
      ...linked,
    ],
    isFirstWorkout: leafInputs ? !(leafInputs.track.totalWorkoutsCompleted ?? 0) : false,
  };
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Same stored result to 0.1 (what the screen can show)? Used to skip no-op reconciles. */
export function sameOutcome(a: LevelUpOutcome | null, b: LevelUpOutcome | null): boolean {
  if (!a || !b) return a === b;
  if (a.after.level !== b.after.level || r1(a.after.percent) !== r1(b.after.percent)) return false;
  if (a.chips.length !== b.chips.length) return false;
  return a.chips.every((c, i) => c.id === b.chips[i].id && r1(c.gain) === r1(b.chips[i].gain));
}
