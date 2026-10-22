'use client';

/**
 * useRunCatchUp — the running-plan catch-up on home (enable_week_builder_v1 + enable_home_v2;
 * src/lib/calm-return/run-catch-up.ts). Once per app open, for the caller that passes `manage`:
 *
 *   - a change of plan week that needs no question (repeat a week, 2–3 week gap step back) is
 *     applied silently, and ONE calm line shows ("ממשיכים מהשבוע ה-X, בקצב שמתאים לך");
 *   - a 4+ week gap applies nothing: the "חוזרים לרוץ" drawer asks first (recommendation, the
 *     optional race date, three choices) and `choose` applies the answer.
 *
 * Flag off / guest / no running plan → nothing is read or written.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { UserFullProfile } from '@/features/user';
import { useWeekBuilderV1 } from '@/features/schedule/week-builder/useWeekBuilderV1';
import { resolveRunningLevel } from '@/features/schedule/engine/runningLevel';
import { calculateCurrentWeek } from '@/lib/running-current-week';
import {
  catchUpDue,
  catchUpLineHe,
  getDaysAway,
  isBeginnerRunPlan,
  localDayKey,
  resolveRunCatchUp,
  type CatchUpDecision,
  type FreshWeekScheduleEntry,
  type RaceGoal,
} from '@/lib/calm-return';
import { applyRunCatchUp } from '@/lib/calm-return/run-catch-up.write';

const judged = new Set<string>();

export type RunReturnChoice = 'recommended' | 'resume' | 'race';

export interface RunReturnAsk {
  decision: CatchUpDecision;
  beginner: boolean;
  level: string | null;
  daysAway: number | null;
  /** Weeks in the plan (for the race rules). */
  planWeeks: number;
  raceDate: string | null;
}

export interface UseRunCatchUpResult {
  notice: string | null;
  ask: RunReturnAsk | null;
  choose: (choice: RunReturnChoice, raceDate?: string | null) => Promise<boolean>;
  dismissNotice: () => void;
  dismissAsk: () => void;
}

type Program = { startDate: unknown; currentWeek?: number; schedule: FreshWeekScheduleEntry[] };

export function useRunCatchUp(profile: UserFullProfile | null | undefined, opts: { manage?: boolean; isGuest?: boolean } = {}): UseRunCatchUpResult {
  const on = useWeekBuilderV1();
  const nowRef = useRef(new Date());
  const [notice, setNotice] = useState<string | null>(null);
  const [ask, setAsk] = useState<RunReturnAsk | null>(null);

  const running = profile?.running as (UserFullProfile['running'] & { catchUp?: unknown; raceGoal?: { date?: string } | null }) | undefined;
  const program = running?.activeProgram as unknown as Program | undefined;

  const evaluation = useMemo(() => {
    if (!on || !opts.manage || opts.isGuest || !profile?.id || !running?.isUnlocked || !program?.schedule?.length || !program.startDate) return null;
    const now = nowRef.current;
    const start = new Date(program.startDate as string);
    if (Number.isNaN(start.getTime())) return null;
    const planWeek = calculateCurrentWeek(start, now);
    const weekStart = new Date(start.getFullYear(), start.getMonth(), start.getDate() + (planWeek - 1) * 7);
    const daysAway = getDaysAway(profile, now);
    const todayKey = localDayKey(now);
    if (!catchUpDue({ marker: running.catchUp, planWeekStartKey: localDayKey(weekStart), todayKey, daysAway })) return null;
    const level = resolveRunningLevel(running) ?? null;
    const beginner = isBeginnerRunPlan(running as Parameters<typeof isBeginnerRunPlan>[0], level);
    const decision = resolveRunCatchUp({ schedule: program.schedule, planWeek, daysAway, beginner });
    if (decision.reason === 'advance') return null;
    const planWeeks = Math.max(...program.schedule.map((e) => e.week));
    return { key: `${profile.id}:${todayKey}:${planWeek}`, decision, beginner, level, daysAway, planWeeks };
  }, [on, opts.manage, opts.isGuest, profile, running, program]);

  useEffect(() => {
    if (!evaluation || !profile?.id || !program || judged.has(evaluation.key)) return;
    judged.add(evaluation.key);
    const { decision } = evaluation;
    if (decision.ask) {
      setAsk({
        decision,
        beginner: evaluation.beginner,
        level: evaluation.level,
        daysAway: evaluation.daysAway,
        planWeeks: evaluation.planWeeks,
        raceDate: typeof running?.raceGoal?.date === 'string' ? running.raceGoal.date : null,
      });
      return;
    }
    void applyRunCatchUp({ uid: profile.id, program, targetWeek: decision.targetWeek, reason: decision.reason, now: nowRef.current }).then((ok) => {
      if (ok) setNotice(catchUpLineHe(decision));
    });
  }, [evaluation, profile?.id, program, running?.raceGoal?.date]);

  const choose = useCallback(
    async (choice: RunReturnChoice, raceDate?: string | null): Promise<boolean> => {
      if (!ask || !profile?.id || !program) return false;
      const d = ask.decision;
      // TODO(race-plan): 'race' rebuilds by the race rules once a race-plan generator exists
      // (run-race.ts); today it stores the date and starts from the safe recommendation.
      const targetWeek = choice === 'resume' ? d.reachedWeek : d.targetWeek;
      const reason = choice === 'resume' ? 'advance' : d.reason;
      const raceGoal: RaceGoal | null = raceDate ? { date: raceDate, v: 1 } : null;
      const ok = await applyRunCatchUp({ uid: profile.id, program, targetWeek, reason, now: nowRef.current, raceGoal });
      if (ok) {
        setAsk(null);
        setNotice(choice === 'resume' ? null : catchUpLineHe({ reason, targetWeek }));
      }
      return ok;
    },
    [ask, profile?.id, program],
  );

  return {
    notice,
    ask,
    choose,
    dismissNotice: () => setNotice(null),
    dismissAsk: () => setAsk(null),
  };
}
