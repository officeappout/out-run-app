/**
 * Kelly phase 3 — one slice of a proactive run (POST /api/ai-coach/proactive/run, driven
 * every 15 minutes by the kellyProactiveScheduler Cloud Function).
 *
 * 1. Which triggers are due now (slots.ts). None (quiet hours) → done.
 * 2. Candidates, by cheap queries: workouts saved 30–75 min ago (post_workout); users with
 *    an open training entry today (morning / weather); users with a workout this week
 *    (weekly); users with a workout in the last 3 days (assessment, active users only).
 *    Sorted by uid; `cursor` = the last uid handled by the previous slice.
 * 3. Per candidate: build the state, select at most one message, render it (optionally with
 *    the model's flex sentence), write it (send.server.ts). The push follows from the
 *    message (onKellyThreadMessage).
 * Each slice stops after `timeBudgetMs` and reports `remaining` + `cursor`.
 *
 * Flags (read here, the server is the enforcer): ai_coach_proactive AND kelly_unified_v1
 * must be on, else nothing is read or written (`stoppedBy: 'flag_off'`).
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { getServerFeatureFlags, type ServerFeatureFlags } from '@/lib/ai/entitlement.server';
import { isDemoUid } from '@/lib/demo';
import { isDemoKellyOn, recordDemoKellyUsage } from '@/lib/ai/demo-kelly.server';
import { buildProactiveState, israelClock } from './context.server';
import { personalizeFlex, PROACTIVE_LLM_MAX_PER_RUN } from './llm.server';
import { usersActiveSince, usersTrainingToday, workoutsSavedBetween } from './loaders.server';
import { flexFacts } from './flex-facts';
import { selectProactive } from './select';
import { writeProactiveMessage } from './send.server';
import { dueTriggers } from './slots';
import { renderProactive } from './templates';
import { POST_WORKOUT_MAX_MS, POST_WORKOUT_MIN_MS } from './triggers/post-workout';
import type { ProactiveTrigger, RecentWorkout } from './types';

export interface ProactiveRunOptions {
  now?: Date;
  cursor?: string | null;
  timeBudgetMs?: number;
  /** Log decisions, write nothing. */
  dryRun?: boolean;
  /** Tests: injected flags. */
  flags?: ServerFeatureFlags;
  /** Tests: injected demo_kelly switch (else read from the flag doc; read failure = off). */
  demoKelly?: boolean;
}

export interface ProactiveRunResult {
  due: ProactiveTrigger[];
  candidates: number;
  /** demo_kelly off: demo users dropped before any per-user work (uid prefix, or core.demo on the user doc). */
  skippedDemo: number;
  /** demo_kelly on: LLM calls made for demo users (counted in demo_registry usage). */
  demoLlmCalls: number;
  evaluated: number;
  sent: number;
  byTrigger: Partial<Record<ProactiveTrigger, number>>;
  llmCalls: number;
  costUsd: number;
  remaining: boolean;
  cursor: string | null;
  stoppedBy: string | null;
}

export function proactiveEnabled(f: ServerFeatureFlags): boolean {
  return f.aiCoachProactive === true && f.kellyUnifiedV1 === true;
}

interface Candidates {
  uids: string[];
  /** uid → the due triggers this user is a candidate for. */
  dueFor: Map<string, ProactiveTrigger[]>;
  recent: Map<string, RecentWorkout>;
  /** Distinct `demo_` uids dropped from the candidate list (no read, no LLM). */
  demoDropped: number;
}

async function collectCandidates(db: Firestore, due: ProactiveTrigger[], now: Date, dateKey: string, allowDemo: boolean): Promise<Candidates> {
  const t = now.getTime();
  const recent = new Map<string, RecentWorkout>();
  const dueFor = new Map<string, ProactiveTrigger[]>();
  const add = (uid: string, triggers: ProactiveTrigger[]) => {
    const cur = dueFor.get(uid) ?? [];
    for (const x of triggers) if (!cur.includes(x)) cur.push(x);
    dueFor.set(uid, cur);
  };
  const jobs: Array<Promise<void>> = [];
  if (due.includes('post_workout')) {
    jobs.push(
      workoutsSavedBetween(db, t - POST_WORKOUT_MAX_MS, t - POST_WORKOUT_MIN_MS).then((rows) => {
        for (const r of rows) {
          const prev = recent.get(r.uid);
          if (!prev || r.workout.endedAtMs > prev.endedAtMs) recent.set(r.uid, r.workout);
        }
      }),
    );
  }
  const morning = due.filter((x): x is ProactiveTrigger => x === 'morning' || x === 'weather');
  if (morning.length) jobs.push(usersTrainingToday(db, dateKey).then((u) => u.forEach((x) => add(x, morning))));
  if (due.includes('weekly')) jobs.push(usersActiveSince(db, t - 6 * 86_400_000).then((u) => u.forEach((x) => add(x, ['weekly']))));
  if (due.includes('assessment')) jobs.push(usersActiveSince(db, t - 3 * 86_400_000).then((u) => u.forEach((x) => add(x, ['assessment']))));
  await Promise.all(jobs);
  recent.forEach((_w, uid) => add(uid, ['post_workout']));
  // Demo world (demo_kelly off): simulated users never cost a read past this point, nor an LLM call.
  const all = Array.from(dueFor.keys());
  const uids = all.filter((u) => allowDemo || !isDemoUid(u)).sort();
  return { uids, dueFor, recent, demoDropped: all.length - uids.length };
}

export async function runProactiveSlice(db: Firestore, opts: ProactiveRunOptions = {}): Promise<ProactiveRunResult> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const budget = opts.timeBudgetMs ?? 40_000;
  const clock = israelClock(now);
  const due = dueTriggers(clock);
  const out: ProactiveRunResult = { due, candidates: 0, skippedDemo: 0, demoLlmCalls: 0, evaluated: 0, sent: 0, byTrigger: {}, llmCalls: 0, costUsd: 0, remaining: false, cursor: null, stoppedBy: null };

  const flags = opts.flags ?? (await getServerFeatureFlags(db));
  if (!proactiveEnabled(flags)) return { ...out, stoppedBy: 'flag_off' };
  if (due.length === 0) return { ...out, stoppedBy: 'nothing_due' };

  const allowDemo = opts.demoKelly ?? (await isDemoKellyOn(db, flags));
  const { uids, dueFor, recent, demoDropped } = await collectCandidates(db, due, now, clock.dateKey, allowDemo);
  out.candidates = uids.length;
  out.skippedDemo = demoDropped;
  const start = opts.cursor ? uids.findIndex((u) => u > opts.cursor!) : 0;
  const todo = start < 0 ? [] : uids.slice(start);
  const llmOn = flags.aiCoachProactiveLlm === true;

  for (const uid of todo) {
    if (Date.now() - started > budget) {
      out.remaining = true;
      out.stoppedBy = 'time_budget';
      return out;
    }
    out.cursor = uid;
    out.evaluated++;
    try {
      // Only the triggers this user is a candidate for (a post-workout candidate is not
      // evaluated for the morning unless today's schedule list has them too).
      const mine = dueFor.get(uid) ?? [];
      const state = await buildProactiveState({ db, uid, now, flags, due: mine, recentWorkout: recent.get(uid) ?? null, allowDemo, onDemo: () => { out.skippedDemo++; } });
      if (!state) continue;
      const pick = selectProactive(state, { only: mine });
      if (!pick) continue;
      let rendered = renderProactive({ templateKey: pick.templateKey, vars: pick.vars, gender: state.gender, firstName: state.firstName });
      let llm = false;
      if (llmOn && rendered.flexHint && out.llmCalls < PROACTIVE_LLM_MAX_PER_RUN && !opts.dryRun) {
        out.llmCalls++;
        const r = await personalizeFlex(db, { uid, gender: state.gender, hint: rendered.flexHint, facts: flexFacts(state) });
        out.costUsd += r.costUsd;
        if (state.demo) {
          out.demoLlmCalls++;
          await recordDemoKellyUsage(db, r.usage, r.model ?? null, now);
        }
        if (r.sentence) {
          rendered = renderProactive({ templateKey: pick.templateKey, vars: pick.vars, gender: state.gender, firstName: state.firstName, flex: r.sentence });
          llm = true;
        }
      }
      if (opts.dryRun) {
        console.info(`[kelly-proactive] dry run ${uid} → ${pick.trigger}: ${pick.why}`);
        continue;
      }
      const res = await writeProactiveMessage(db, { uid, clock, trigger: pick.trigger, templateKey: pick.templateKey, vars: pick.vars, rendered, llm });
      if (res.written) {
        out.sent++;
        out.byTrigger[pick.trigger] = (out.byTrigger[pick.trigger] ?? 0) + 1;
      }
    } catch (err) {
      console.warn(`[kelly-proactive] user failed`, (err as Error)?.message);
    }
  }
  out.cursor = null;
  out.stoppedBy = 'done';
  return out;
}
