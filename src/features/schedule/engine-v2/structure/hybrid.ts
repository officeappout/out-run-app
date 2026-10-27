/**
 * Hybrid weeks (calisthenics + running), owner 27.10.2026, engine-combination-rules.md §2ו.
 *
 * R26: a week with runs has a FOCUS (strength / half-half / run). It maps onto the engine's
 * existing priority (strength_first / balanced / run_first), so the conflict ladder and the
 * double-day costs follow it. The focus also picks the 5-day template below, which decides how
 * many hard days each side gets. buildWeek still places the sessions on the user's real days
 * under the hard rules (H11 = R29 + R30); the template is the recommended input, not a layout.
 *
 * Templates (5 days):
 *   strength: upper skill A | legs + easy run | upper skill B | tempo | upper / full body combined
 *   balanced: upper | legs + easy run | intervals | upper | long
 *   run:      easy run + upper | intervals | legs + easy run | tempo | long
 * Pure, no copy.
 */
import type { RunSessionInput, RunSlot, RunWorkoutType, SchedulePriority, StrengthProgramInput } from '../types';
import { CORE_FINISHER, SHORT_SESSION_MINUTES } from './config';
import { applySkillFocus } from './skillFocus';
import { splitSkills } from './skills';
import { HOST_SLUG } from './toPrograms';
import type { CoreFinisher, SkillId, StrengthDay, StrengthDayKind, StructureInput } from './types';

export type HybridFocus = 'strength' | 'balanced' | 'run';
export type HybridRun = Extract<RunWorkoutType, 'easy' | 'intervals' | 'tempo' | 'long'>;

export interface HybridTemplateDay {
  strength?: Extract<StrengthDayKind, 'upper' | 'lower' | 'full_body'>;
  run?: HybridRun;
}

export const HYBRID_TEMPLATE_DAYS = 5;

export const HYBRID_TEMPLATES: Readonly<Record<HybridFocus, readonly HybridTemplateDay[]>> = {
  strength: [
    { strength: 'upper' },
    { strength: 'lower', run: 'easy' },
    { strength: 'upper' },
    { run: 'tempo' },
    { strength: 'full_body' },
  ],
  balanced: [
    { strength: 'upper' },
    { strength: 'lower', run: 'easy' },
    { run: 'intervals' },
    { strength: 'upper' },
    { run: 'long' },
  ],
  run: [
    { strength: 'upper', run: 'easy' },
    { run: 'intervals' },
    { strength: 'lower', run: 'easy' },
    { run: 'tempo' },
    { run: 'long' },
  ],
};

/** R26: the focus reuses the engine's existing "more strength / more running" priority. */
export const FOCUS_PRIORITY: Readonly<Record<HybridFocus, SchedulePriority>> = {
  strength: 'strength_first',
  balanced: 'balanced',
  run: 'run_first',
};

export const focusOfPriority = (p: SchedulePriority): HybridFocus =>
  p === 'strength_first' ? 'strength' : p === 'run_first' ? 'run' : 'balanced';

export interface HybridDay {
  strength: StrengthDay | null;
  run: HybridRun | null;
}

export interface HybridWeekPlan {
  focus: HybridFocus;
  priority: SchedulePriority;
  /** The template order (abstract days; buildWeek places them on real days). */
  days: HybridDay[];
  runSessions: RunSessionInput[];
  strengthPrograms: StrengthProgramInput[];
  unlockedSkills: SkillId[];
  coreFinisher: CoreFinisher;
}

/** Run type → engine slot: intervals is the primary quality run, tempo the second one (or the first when alone). */
export function runSlotOf(run: HybridRun, hasIntervals: boolean): RunSlot {
  switch (run) {
    case 'easy': return 'easy_run';
    case 'long': return 'long_run';
    case 'intervals': return 'quality_primary';
    case 'tempo': return hasIntervals ? 'quality_secondary' : 'quality_primary';
  }
}

export type HybridInput = Pick<StructureInput, 'levels' | 'skills' | 'sessionMinutes' | 'handstandChestToWall'> & {
  focus: HybridFocus;
};

export function planHybridWeek(input: HybridInput): HybridWeekPlan {
  const template = HYBRID_TEMPLATES[input.focus];
  const short = input.sessionMinutes != null && input.sessionMinutes <= SHORT_SESSION_MINUTES;
  let strengthDays: StrengthDay[] = template
    .filter((t) => t.strength)
    .map((t) => ({ type: 'strength' as const, kind: t.strength! }));
  // R28: skill A on the first upper host, skill B on the second, then a combined day.
  const sk = splitSkills(input);
  strengthDays = applySkillFocus(strengthDays, sk.unlocked, input.sessionMinutes);
  // R27: upper = push + pull together, supersets when short.
  if (short) strengthDays = strengthDays.map((d) => (d.kind === 'upper' ? { ...d, pairing: 'push_pull_supersets' as const } : d));

  let si = 0;
  const days: HybridDay[] = template.map((t) => ({ strength: t.strength ? strengthDays[si++] : null, run: t.run ?? null }));

  const hasIntervals = template.some((t) => t.run === 'intervals');
  const runSessions: RunSessionInput[] = template
    .filter((t) => t.run)
    .map((t) => ({ slot: runSlotOf(t.run!, hasIntervals), workout: t.run! }));

  const counts = new Map<string, number>();
  for (const d of strengthDays) counts.set(HOST_SLUG[d.kind], (counts.get(HOST_SLUG[d.kind]) ?? 0) + 1);
  const strengthPrograms = Array.from(counts).map(([slug, sessionsPerWeek], i) => ({ slug, sessionsPerWeek, priority: i + 1 }));

  return {
    focus: input.focus,
    priority: FOCUS_PRIORITY[input.focus],
    days,
    runSessions,
    strengthPrograms,
    unlockedSkills: sk.unlocked.map((s) => s.id),
    coreFinisher: { ...CORE_FINISHER },
  };
}
