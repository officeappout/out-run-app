/**
 * Kelly's week — what is planned on each date, computed VIRTUALLY (nothing is written), the
 * way home (enable_home_v2) shows it. Pure: the caller reads the userSchedule day docs that
 * exist, plus the user doc it already has, and passes them in.
 *
 * K0 investigation (docs/kelly/K0-INVESTIGATION.md §1, fixes F1 / F2 / F3): Kelly used to read
 * ONLY the materialized userSchedule day docs, and the app writes a day doc only when a screen
 * opens that day. Home computes the week live, so the user saw a full week and Kelly saw
 * "nothing planned". Layering, per date (home's day-plan.ts / usePlannedDay.ts rules):
 *
 *   1. the day doc's own entries (an explicit rest override hides the day, as before). A running
 *      bridge entry (programIds = [running.activeProgram.programId], no category) is a RUN, never
 *      a buildable strength session (F3, home's excludeRunningShadowEntry);
 *   2. no personal (non-walk) entry in the doc → the recurring template's sessions for that
 *      weekday (recurring-day.core templateSessionsToMaterialize — the same core the training
 *      reminder uses). Template strength counts only for a user with an assessed strength
 *      program (home: `hasStrengthProgram`);
 *   3. still no strength session, and the weekday is in lifestyle.scheduleDays (a user with a
 *      strength program but NO template — the owner's own profile, 21.10.2026) → a strength
 *      session, exactly home's "אימון כוח" fallback (buildPlannedDay isStrengthScheduleDay);
 *   4. the running plan's run for that date (F2: placed by slot type with enable_home_v2 — the
 *      advisor's materializePlanned, the same mapper home uses), replacing the bare bridge entry
 *      for that date; a doc entry that is already a planned run (its own plannedRun) wins.
 *   Planned walks are day-doc entries (the walking signup writes them), so they come in through
 *   layer 1 and stay walks (kindOf in context-sheet.ts).
 */
import {
  templateSessionsToMaterialize,
  dayLetterOfDateKey,
  type RecurringReminderTimes,
  type RecurringTemplateLike,
} from '@/features/user/scheduling/utils/recurring-day.core';
import { materializePlanned } from '@/features/schedule/advisor/planned';
import { plannedActivityOf } from '@/features/schedule/advisor/plannedActivity';
import type { AdvisorProfile } from '@/features/schedule/advisor/types';
import { isPlannedWalkEntry } from '@/features/schedule/walking/walkEntry';
import { hasAssessedStrengthDomain } from '@/features/user/identity/services/access-control.service';
import { RUNNING_WORKOUT_CATEGORY_LABELS_HE } from '@/lib/running-workout-labels';
import type { WorkoutCategory } from '@/features/workout-engine/core/types/running.types';
import type { RawScheduleEntry } from './context-sheet';

type RawDocEntry = Record<string, unknown>;

export interface PlannedWeekInput {
  /** 'YYYY-MM-DD' keys, in order. */
  dates: string[];
  /** date → that day doc's entries. A date with no doc is absent. */
  docs: ReadonlyMap<string, readonly RawDocEntry[]>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore document data, read through field guards
  profile: Record<string, any>;
  /** The same profile with Timestamps as ISO strings (normalizeAdvisorProfile) — the running plan reads dates. */
  advisorProfile: AdvisorProfile;
  /** enable_home_v2 for this user: runs on their weekday by slot type. Absent = ordinal. */
  runsByType?: boolean;
}

const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function isWalk(e: RawDocEntry): boolean {
  return isPlannedWalkEntry({
    type: e.type,
    source: e.source,
    programIds: strList(e.programIds),
    scheduledCategories: strList(e.scheduledCategories),
    plannedRun: e.plannedRun,
  } as Parameters<typeof isPlannedWalkEntry>[0]);
}

/** A running bridge entry: the running program's own id, no plannedRun of its own. */
function isBridgeEntry(e: { type?: unknown; plannedRun?: unknown; programIds?: unknown }, runningProgramId: string | null): boolean {
  if (!runningProgramId || e.type !== 'training' || e.plannedRun) return false;
  return strList(e.programIds)[0] === runningProgramId;
}

function docEntryToRaw(date: string, e: RawDocEntry, runningProgramId: string | null): RawScheduleEntry {
  const bridge = isBridgeEntry(e, runningProgramId) && strList(e.scheduledCategories).length === 0;
  return {
    date,
    type: e.type,
    programIds: e.programIds,
    startTime: e.startTime,
    completed: e.completed,
    title: e.title,
    // F3: the bridge's run day carries only the running program's id → a run, never strength.
    scheduledCategories: bridge ? ['cardio'] : e.scheduledCategories,
    plannedRun: e.plannedRun,
  };
}

function runTitle(name: string | null, category: string | null | undefined): string {
  const label = category ? RUNNING_WORKOUT_CATEGORY_LABELS_HE[category as WorkoutCategory] : undefined;
  return name || label || 'ריצה';
}

/** Every planned entry of `dates` (doc entries + template + scheduleDays fallback + running plan). */
export function plannedWeekEntries(i: PlannedWeekInput): RawScheduleEntry[] {
  const p = i.profile ?? {};
  const life = p.lifestyle ?? {};
  const template = (life.recurringTemplate && typeof life.recurringTemplate === 'object' ? life.recurringTemplate : null) as RecurringTemplateLike | null;
  const reminders = (life.reminders && typeof life.reminders === 'object' ? life.reminders : null) as RecurringReminderTimes | null;
  const runningProgramId = typeof p.running?.activeProgram?.programId === 'string' ? (p.running.activeProgram.programId as string) : null;
  const scheduleDays = strList(life.scheduleDays);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the helper takes the client profile type; it reads two maps through guards
  const hasStrengthProgram = hasAssessedStrengthDomain(p as any);
  const strengthTime = typeof reminders?.strengthTime === 'string' && reminders.strengthTime ? reminders.strengthTime : null;
  const runningTime = typeof reminders?.runningTime === 'string' && reminders.runningTime ? reminders.runningTime : null;

  // The running plan's run per date (rest overrides already applied by materializePlanned).
  let runs = new Map<string, { name: string | null; category: string | null | undefined; completed: boolean }>();
  try {
    const scheduleDaysForPlan = Array.from(i.docs.entries()).map(([date, entries]) => ({ date, entries: [...entries] }));
    runs = new Map(
      materializePlanned(i.advisorProfile, i.dates, scheduleDaysForPlan, undefined, i.runsByType ? { runsByType: true } : {})
        .filter((e) => e.kind === 'run')
        .map((e) => [e.date, { name: e.runName, category: e.runDay?.category, completed: e.completedAtSource }]),
    );
  } catch {
    /* a malformed running plan never costs the rest of the week */
  }

  const out: RawScheduleEntry[] = [];
  for (const date of i.dates) {
    const docEntries = (i.docs.get(date) ?? []).filter((e): e is RawDocEntry => !!e && typeof e === 'object');
    const day: RawScheduleEntry[] = [];
    for (const e of docEntries) {
      if (e.override === true && e.type === 'rest') continue;
      day.push(docEntryToRaw(date, e, runningProgramId));
    }

    const personal = docEntries.filter((e) => e.source !== 'community');
    const blockedByDoc = personal.some((e) => !isWalk(e));
    if (!blockedByDoc) {
      const sessions = templateSessionsToMaterialize(template, date, docEntries, reminders, runningProgramId);
      let strengthAdded = false;
      for (const s of sessions) {
        if (s.category === 'strength' && !hasStrengthProgram) continue;
        if (s.category === 'strength') strengthAdded = true;
        day.push({ date, type: 'training', programIds: [s.programId], startTime: s.startTime, scheduledCategories: [s.category], source: 'template' });
      }
      if (!strengthAdded && hasStrengthProgram && scheduleDays.includes(dayLetterOfDateKey(date))) {
        day.push({ date, type: 'training', programIds: [], startTime: strengthTime, title: 'אימון כוח', scheduledCategories: ['strength'], source: 'schedule_days' });
      }
    }

    const run = runs.get(date);
    if (run) {
      const explicitRun = docEntries.some((e) => e.type === 'training' && !!e.plannedRun && plannedActivityOf(e) === 'run');
      if (!explicitRun) {
        // The bare bridge entry (doc or template) is the same run: replaced by the plan's own run.
        const bridges = day.filter((e) => isBridgeEntry(e, runningProgramId));
        const completed = run.completed || bridges.some((e) => e.completed === true);
        const rest = day.filter((e) => !bridges.includes(e));
        day.length = 0;
        day.push(...rest, {
          date,
          type: 'training',
          programIds: [],
          startTime: (bridges[0]?.startTime as string | undefined) ?? runningTime,
          completed,
          title: runTitle(run.name, run.category),
          scheduledCategories: ['cardio'],
          source: 'running_plan',
        });
      }
    }
    out.push(...day);
  }
  return out;
}
