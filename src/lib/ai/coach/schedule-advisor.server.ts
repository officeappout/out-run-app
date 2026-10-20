/**
 * AI coach — the schedule advisor's SERVER adapter (Admin SDK reads → AdvisorInput).
 * Read-only: the user doc (already loaded by the route), the last 14 days of workouts, the
 * userSchedule day docs of the window, and the program index (raw program id → slug).
 * What the server cannot know is passed as unknown, never as zero: the device-local
 * per-domain sets (useWeeklyVolumeStore) → weeklyDomainSets: null.
 *
 * Only reached when system_config/feature_flags.ai_coach_schedule_advisor is on (route.ts).
 */
import 'server-only';
import { Timestamp } from 'firebase-admin/firestore';
import { getIsraelDateKey } from '@/lib/israelTime';
import { adviseToday, adviseWeek } from '@/features/schedule/advisor/advisor';
import { addDaysToKey, keysBetween, weekKeysOf } from '@/features/schedule/advisor/planned';
import { toAdvisorWorkouts } from '@/features/schedule/advisor/workouts';
import { isStrengthTemplateId } from '@/features/schedule/engine/strengthVocabulary';
import type { AdvisorInput, AdvisorProfile, AdvisorScheduleDay, TodayAdvice, WeekAdvice } from '@/features/schedule/advisor/types';
import { DAY_LETTERS } from '@/features/schedule/types/smartSchedule.types';
import { COACH_DOMAINS } from './tools';
import { loadProgramIndex, type ServerToolContext } from './server-tools.server';
import { sheetPlanOf, todayToolResult, weekToolResult, type SheetPlan } from './schedule-tools';

const WINDOW_DAYS = 14;

function toDateValue(v: unknown): Date | string | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  if (typeof (v as { toDate?: unknown }).toDate === 'function') return (v as { toDate: () => Date }).toDate();
  if (typeof v === 'string' || typeof v === 'number') return new Date(v);
  return null;
}

/** Admin SDK Timestamps → Dates where the pure advisor reads a date (startDate fields). */
export function normalizeAdvisorProfile(raw: Record<string, unknown>): AdvisorProfile {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw Firestore document data, read through field guards
  const p = JSON.parse(JSON.stringify(raw ?? {}, (_k, v) => (v instanceof Timestamp ? v.toDate().toISOString() : v))) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const r = raw as any;
  const runStart = toDateValue(r?.running?.activeProgram?.startDate);
  if (p.running?.activeProgram && runStart) p.running.activeProgram.startDate = runStart instanceof Date ? runStart.toISOString() : runStart;
  if (Array.isArray(p.progression?.activePrograms)) {
    p.progression.activePrograms = p.progression.activePrograms.map((ap: Record<string, unknown>, i: number) => {
      const d = toDateValue(r.progression.activePrograms[i]?.startDate);
      return d ? { ...ap, startDate: d instanceof Date ? d.toISOString() : d } : ap;
    });
  }
  return p as AdvisorProfile;
}

async function readWorkoutsForAdvisor(ctx: ServerToolContext, sinceMs: number) {
  const snap = await ctx.db
    .collection('workouts')
    .where('userId', '==', ctx.uid)
    .where('date', '>=', Timestamp.fromMillis(sinceMs))
    .orderBy('date', 'desc')
    .limit(120)
    .get();
  return toAdvisorWorkouts(
    snap.docs.map((d) => {
      const x = d.data();
      const date: Date | null = x.date?.toDate?.() ?? null;
      return {
        dateKey: date ? getIsraelDateKey(date) : null,
        workoutType: x.workoutType,
        activityType: x.activityType,
        category: x.category,
        durationSec: x.duration,
        isRecovery: x.isRecovery,
      };
    }),
  );
}

async function readScheduleDays(ctx: ServerToolContext, keys: string[]): Promise<AdvisorScheduleDay[]> {
  if (!keys.length) return [];
  const snaps = await ctx.db.getAll(...keys.map((k) => ctx.db.collection('userSchedule').doc(`${ctx.uid}_${k}`)));
  const out: AdvisorScheduleDay[] = [];
  snaps.forEach((s, i) => {
    if (!s.exists) return;
    const entries = s.data()?.entries;
    if (Array.isArray(entries)) out.push({ date: keys[i], entries });
  });
  return out;
}

/** One read pass for a turn: everything both tools and the sheet need. */
export async function loadAdvisorInput(ctx: ServerToolContext): Promise<AdvisorInput> {
  const todayKey = getIsraelDateKey(ctx.now);
  const keys = Array.from(new Set([...keysBetween(addDaysToKey(todayKey, -(WINDOW_DAYS - 1)), addDaysToKey(todayKey, 1)), ...weekKeysOf(todayKey)])).sort();
  const [workouts, scheduleDays, programIndex] = await Promise.all([
    readWorkoutsForAdvisor(ctx, ctx.now.getTime() - (WINDOW_DAYS + 1) * 86_400_000),
    readScheduleDays(ctx, keys),
    loadProgramIndex(ctx.db, ctx.now.getTime()),
  ]);
  return {
    todayKey,
    profile: normalizeAdvisorProfile(ctx.profile),
    workouts,
    scheduleDays,
    resolveSlug: programIndex?.resolveSlug,
    weeklyDomainSets: null, // device-local only — unknown on the server
    // enable_home_v2 (this user's value, route.ts): runs by slot type, the week home shows.
    ...(ctx.runsByType ? { runsByType: true } : {}),
  };
}

export interface AdvisorTurn {
  input: AdvisorInput;
  week: WeekAdvice | null;
  today: TodayAdvice;
}

export async function runAdvisor(ctx: ServerToolContext): Promise<AdvisorTurn> {
  const input = await loadAdvisorInput(ctx);
  return { input, week: adviseWeek(input), today: adviseToday(input) };
}

export async function recommendWeek(ctx: ServerToolContext) {
  const { week } = await runAdvisor(ctx);
  return weekToolResult(week);
}

export async function recommendToday(ctx: ServerToolContext) {
  const { today } = await runAdvisor(ctx);
  return todayToolResult(today, COACH_DOMAINS);
}

export function sheetPlanFromTurn(turn: AdvisorTurn): SheetPlan {
  const template = turn.input.profile.lifestyle?.recurringTemplate ?? {};
  const dows = DAY_LETTERS.map((l, i) => ((template[l] ?? []).some((id) => isStrengthTemplateId(id, turn.input.resolveSlug)) ? i : -1)).filter((i) => i >= 0);
  return sheetPlanOf(turn.today, turn.week, dows);
}
