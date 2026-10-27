/**
 * ל4 / ל4ב "השבוע שלך מוכן!": the week the tutorial shows, adapted from engine v2. Pure, no copy: the
 * labels are codes the screens translate (__tests__/tutorialWeek.test.ts).
 *
 * - planStructure decides how many strength days (beginner: 3 + movement days) and the full-body
 *   emphasis rotation; buildWeek places the sessions (and runs) on the free days. Engine logic is
 *   only called, never changed.
 * - The engine has no daily cards yet (engine-combination-rules.md §3), so the steps goal, the
 *   optional short sessions and the walk minutes are filled here (see STUB notes).
 * - `strengthWeek` is the same shape the existing week step saves (buildStrengthScheduleWrite).
 */
import { buildWeek, profileOf } from '@/features/schedule/engine-v2';
import { planStructure } from '@/features/schedule/engine-v2/structure';
import { EMPHASIS_ROTATION, MOVEMENT_ROTATION } from '@/features/schedule/engine-v2/structure/config';
import type { Emphasis, GroupLevels, MovementKind, SkillId as StructureSkillId } from '@/features/schedule/engine-v2/structure/types';
import type { PlacedSession, RunSlot, TimeWindow, TrainingLevel } from '@/features/schedule/engine-v2/types';
import type { ScheduleItemId, SkillId } from '@/features/schedule/types/smartSchedule.types';
import {
  itemOfSlug,
  strengthEngineInput,
  strengthMainItems,
  slugOfItem,
  type StrengthSeed,
  type StrengthWeekRecommendation,
} from '@/features/schedule/utils/strengthWeekRecommendation';
import { freeDays, timeOfChoice, type DaysState } from './days';

// ── Output shapes ──────────────────────────────────────────────────

export type StrengthLabel =
  | { kind: 'full_body'; emphasis: Emphasis }
  | { kind: 'upper' }
  | { kind: 'legs' }
  | { kind: 'skill'; family: 'push' | 'pull'; skill: SkillId };

export interface TutorialStrength {
  label: StrengthLabel;
  items: ScheduleItemId[];
  minutes: number;
  window: TimeWindow;
  time: string;
  /** Second session of a run day. */
  afterRun: boolean;
  /** A chosen skill leads most of the session ("רוב האימון סקיל"). */
  skillLed: boolean;
}

export interface TutorialRun {
  slot: RunSlot;
  minutes: number;
  window: TimeWindow;
  time: string;
}

export type OptionalKind = 'core_tabata' | 'mobility';
export interface TutorialOptional {
  kind: OptionalKind;
  minutes: number;
  /** 'recovery' on a movement day built around it, else just 'optional' ("רשות"). */
  role: 'optional' | 'recovery';
}

export interface TutorialDay {
  dow: number;
  free: boolean;
  strength: TutorialStrength | null;
  runs: TutorialRun[];
  movement: MovementKind | null;
  stepsGoal: number;
  optional: TutorialOptional[];
}

export type WeekChip =
  | { type: 'group'; group: Emphasis | 'core'; count: number }
  | { type: 'strength'; label: StrengthLabel; count: number }
  | { type: 'run'; count: number };

export interface TutorialWeek {
  /** In the display order passed in (default Sunday first). */
  days: TutorialDay[];
  minutes: { strength: number; run: number; walk: number };
  strengthCount: number;
  movementCount: number;
  runCount: number;
  /** Skills or runs: the "complex" copy (ל3ב / ל4ב). */
  complex: boolean;
  chips: WeekChip[];
  strengthWeek: StrengthWeekRecommendation;
}

export interface TutorialWeekInput {
  seed: StrengthSeed;
  levels: GroupLevels;
  engineLevel: TrainingLevel;
  days: DaysState;
  /** Minutes per strength session ("כמה זמן לאימון?"). */
  minutes: number;
  running: { slots: RunSlot[]; level: TrainingLevel } | null;
  twoPerDay: boolean;
  longRunDay: number | null;
  /** The user's daily steps goal. */
  stepsGoal: number;
  /** Display order of the seven days (e.g. the coming week from today). */
  order?: readonly number[];
}

// ── STUB constants (no engine source yet) ──────────────────────────

/** STUB: a walking movement day raises the steps goal by this much (board: 8,000 → 10,000). */
export const MOVEMENT_DAY_EXTRA_STEPS = 2000;
/** STUB: brisk-walk minutes a walking movement day adds to the weekly ring. */
export const WALK_MINUTES_PER_MOVEMENT_DAY = 15;
/** STUB: run minutes when the engine leaves them out. */
export const RUN_MINUTES_BY_SLOT: Record<RunSlot, number> = {
  quality_primary: 40, quality_secondary: 40, long_run: 55, easy_run: 30, recovery: 25,
};
/** STUB: the strength session after a morning run starts in the evening. */
export const AFTER_RUN_TIME = '18:00';
export const OPTIONAL_MINUTES: Record<OptionalKind, number> = { core_tabata: 8, mobility: 10 };

const SKILL_TO_STRUCTURE: Partial<Record<SkillId, StructureSkillId>> = {
  PLANCHE: 'planche', HSPU: 'hspu', FRONT_LEVER: 'front_lever', OAPU: 'one_arm_pullup', MUSCLE_UP: 'muscle_up',
};
const PUSH_SKILLS = new Set<SkillId>(['PLANCHE', 'HSPU', 'HANDSTAND']);
const isSkillItem = (id: ScheduleItemId): id is SkillId => id in SKILL_TO_STRUCTURE || id === 'HANDSTAND';

function labelOf(items: readonly ScheduleItemId[], fullBodyIndex: number): StrengthLabel {
  const skill = items.find((i): i is SkillId => isSkillItem(i) && i !== 'HANDSTAND');
  if (skill) return { kind: 'skill', family: PUSH_SKILLS.has(skill) ? 'push' : 'pull', skill };
  if (items.includes('LOWER_BODY')) return { kind: 'legs' };
  if (items.includes('FULL_BODY')) return { kind: 'full_body', emphasis: EMPHASIS_ROTATION[fullBodyIndex % EMPHASIS_ROTATION.length] };
  return { kind: 'upper' };
}

export const strengthLabelKey = (l: StrengthLabel): string =>
  l.kind === 'skill' ? `skill:${l.skill}` : l.kind === 'full_body' ? `full_body:${l.emphasis}` : l.kind;

/** Muscle groups a session works (the simple week's chips: full body hits each group every time). */
function groupsOf(l: StrengthLabel): Array<Emphasis | 'core'> {
  switch (l.kind) {
    case 'full_body': return ['push', 'pull', 'legs', 'core'];
    case 'upper': return ['push', 'pull', 'core'];
    case 'legs': return ['legs', 'core'];
    case 'skill': return [l.family, 'core'];
  }
}

const runMinutes = (s: PlacedSession): number => s.minutes ?? RUN_MINUTES_BY_SLOT[s.slot ?? 'easy_run'];

export function buildTutorialWeek(input: TutorialWeekInput): TutorialWeek {
  const free = freeDays(input.days);
  const mainItems = strengthMainItems(input.seed);
  const hardSkills = input.seed.skills.filter((s) => s.id !== 'HANDSTAND');
  const structure = planStructure({
    days: Math.max(1, free.length),
    levels: input.levels,
    skills: hardSkills.map((s) => SKILL_TO_STRUCTURE[s.id]).filter((s): s is StructureSkillId => !!s).map((id) => ({ id })),
    sessionMinutes: input.minutes,
  });
  const frequency = Math.min(structure.strengthDays, free.length);

  const placed = new Map<number, PlacedSession[]>();
  let warningsHe: string[] = [];
  if (free.length > 0 && (frequency > 0 || input.running)) {
    const base = strengthEngineInput(input.seed, Math.max(1, frequency), free, input.engineLevel);
    const plan = buildWeek({
      ...base,
      strength: frequency > 0 ? base.strength : [],
      availability: {
        days: free,
        maxSessionsPerDay: input.running && input.twoPerDay ? 2 : 1,
        maxTrainingDays: input.running ? free.length : frequency,
        preferredLongRunDay: input.running ? input.longRunDay : null,
      },
      running: input.running
        ? { level: input.running.level, targetDistance: '5k', sessions: input.running.slots.map((slot) => ({ slot })) }
        : null,
      levels: { strength: input.engineLevel, running: input.running?.level ?? null },
    });
    for (const d of plan.days) placed.set(d.dow, d.sessions);
    warningsHe = plan.warningsHe;
  }

  const movementKinds: MovementKind[] = structure.sequence.flatMap((s) => (s.type === 'movement' ? [s.kind] : []));
  const skillLed = hardSkills.length > 0;
  let fullBodyIndex = 0;
  let movementIndex = 0;
  const byDow = new Map<number, TutorialDay>();
  const strengthDays: StrengthWeekRecommendation['days'] = [];

  for (let dow = 0; dow <= 6; dow++) {
    const choice = input.days[dow];
    const sessions = placed.get(dow) ?? [];
    const strengthSessions = sessions.filter((s) => s.kind === 'strength' && s.slug && !s.optional);
    const runs: TutorialRun[] = choice
      ? sessions.filter((s) => s.kind === 'run').map((s) => ({ slot: s.slot ?? 'easy_run', minutes: runMinutes(s), window: choice.window, time: timeOfChoice(choice) }))
      : [];

    let strength: TutorialStrength | null = null;
    if (choice && strengthSessions.length) {
      const ordered = [...strengthSessions].sort((a, b) => (a.slug === 'handstand' ? -1 : b.slug === 'handstand' ? 1 : 0));
      const items = Array.from(new Set(ordered.map((s) => itemOfSlug(s.slug!))));
      const label = labelOf(items, fullBodyIndex);
      if (label.kind === 'full_body') fullBodyIndex++;
      const afterRun = runs.length > 0;
      strength = {
        label, items, minutes: input.minutes, window: afterRun ? 'evening' : choice.window,
        time: afterRun ? AFTER_RUN_TIME : timeOfChoice(choice), afterRun, skillLed: skillLed && label.kind === 'skill',
      };
      strengthDays.push({ dow, items, window: strength.window, minutes: input.minutes, reasonHe: '' });
    }

    const movement: MovementKind | null =
      choice && !strength && runs.length === 0 ? movementKinds[movementIndex] ?? MOVEMENT_ROTATION[movementIndex % MOVEMENT_ROTATION.length] : null;
    if (movement) movementIndex++;

    const optional: TutorialOptional[] = [];
    if (movement === 'core_short') optional.push({ kind: 'core_tabata', minutes: OPTIONAL_MINUTES.core_tabata, role: 'recovery' });
    else if (movement) optional.push({ kind: 'mobility', minutes: OPTIONAL_MINUTES.mobility, role: 'optional' });
    else if (!choice && input.running) optional.push({ kind: 'mobility', minutes: OPTIONAL_MINUTES.mobility, role: 'optional' });

    byDow.set(dow, {
      dow, free: !!choice, strength, runs, movement,
      stepsGoal: input.stepsGoal + (movement === 'walk' ? MOVEMENT_DAY_EXTRA_STEPS : 0),
      optional,
    });
  }

  const days = (input.order ?? [0, 1, 2, 3, 4, 5, 6]).map((d) => byDow.get(d)!).filter(Boolean);
  const all = Array.from(byDow.values());
  const strengthList = all.flatMap((d) => (d.strength ? [d.strength] : []));
  const runCount = all.reduce((n, d) => n + d.runs.length, 0);
  const movementCount = all.filter((d) => d.movement).length;
  const complex = skillLed || !!input.running;

  return {
    days,
    minutes: {
      strength: strengthList.reduce((n, s) => n + s.minutes, 0),
      run: all.reduce((n, d) => n + d.runs.reduce((m, r) => m + r.minutes, 0), 0),
      walk: all.filter((d) => d.movement === 'walk').length * WALK_MINUTES_PER_MOVEMENT_DAY,
    },
    strengthCount: strengthList.length,
    movementCount,
    runCount,
    complex,
    chips: complex ? complexChips(strengthList, runCount) : groupChips(strengthList),
    strengthWeek: {
      days: strengthDays,
      warningsHe,
      recoveryHours: profileOf(slugOfItem(mainItems[0])).idealRecoveryHours,
    },
  };
}

function groupChips(list: TutorialStrength[]): WeekChip[] {
  const counts = new Map<Emphasis | 'core', number>();
  for (const s of list) for (const g of groupsOf(s.label)) counts.set(g, (counts.get(g) ?? 0) + 1);
  return (['push', 'pull', 'legs', 'core'] as const).flatMap((g) => (counts.get(g) ? [{ type: 'group' as const, group: g, count: counts.get(g)! }] : []));
}

function complexChips(list: TutorialStrength[], runCount: number): WeekChip[] {
  const out: WeekChip[] = [];
  for (const s of list) {
    const key = strengthLabelKey(s.label);
    const hit = out.find((c) => c.type === 'strength' && strengthLabelKey(c.label) === key);
    if (hit && hit.type === 'strength') hit.count++;
    else out.push({ type: 'strength', label: s.label, count: 1 });
  }
  if (runCount > 0) out.push({ type: 'run', count: runCount });
  return out;
}

/** The labels the complex smart note / summary list ("פלאנץ׳, פרונט ליבר, רגליים ו-3 ריצות"), deduped. */
export function programLabels(week: TutorialWeek): StrengthLabel[] {
  const seen = new Set<string>();
  const out: StrengthLabel[] = [];
  for (const d of week.days) {
    if (!d.strength) continue;
    const l = d.strength.label.kind === 'full_body' ? ({ kind: 'full_body', emphasis: 'push' } as const) : d.strength.label;
    const key = l.kind === 'full_body' ? 'full_body' : strengthLabelKey(l);
    if (!seen.has(key)) { seen.add(key); out.push(l); }
  }
  return out;
}
