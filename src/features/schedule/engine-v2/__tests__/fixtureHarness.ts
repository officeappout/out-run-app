/**
 * Test-only: maps agent-briefs/schedule-combos.fixtures.json scenarios onto the engine
 * input, and checks layouts against the fixture's `expected` (exact layout, mustHold rules,
 * constraints, reason codes).
 *
 * Mapping choices (documented, not guessed per test):
 * - `current` is the fixture's "today's stored state" (documentation for the `today` block),
 *   NOT an existing week to keep — v2 is recommendation-first. It becomes `existing` only for
 *   the "add a session" scenario (S16, add_track mode), where runs are labelled positionally
 *   (Q1, L, Q2 over the sorted run days) because that is what today's stored ordinal means.
 * - `primaryTrack` is NOT mapped to a priority: S26's expected week is the balanced answer
 *   (double on the quality day). strength_first is covered by priority.test.ts.
 * - `running.preferredLongRunDay` → availability.preferredLongRunDay.
 */
import { profileOf } from '../programProfiles';
import type { HardRuleId } from '../rules';
import { validateLayout } from '../validate';
import type {
  ExistingWeek,
  PlacedSession,
  RunSlot,
  ScheduleEngineInput,
  StrengthProgramInput,
  TrainingLevel,
  WeekPlan,
} from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Fixture = any;

export function toEngineInput(f: Fixture): ScheduleEngineInput {
  const i = f.input;
  const run = i.running;
  const strength: StrengthProgramInput[] = (i.strength ?? []).map((p: any) => ({
    slug: p.slug,
    sessionsPerWeek: p.perWeek,
    priority: p.priority,
    freeSlot: p.freeSlot,
  }));
  let existing: ExistingWeek | null = null;
  const addSession = (i.events ?? []).some((e: any) => e.type === 'addSession');
  if (addSession && i.current?.strengthDays) {
    const days: ExistingWeek['days'] = {};
    for (const [d, slugs] of Object.entries(i.current.strengthDays as Record<string, string[]>)) {
      days[Number(d)] = slugs.map((slug) => ({ kind: 'strength' as const, slug }));
    }
    const runDays: number[] = [...(i.current.runDays ?? [])].sort((a, b) => a - b);
    const positional: RunSlot[] = ['quality_primary', 'long_run', 'quality_secondary', 'easy_run'];
    runDays.forEach((d, k) => {
      days[d] = [...(days[d] ?? []), { kind: 'run', slot: positional[k] }];
    });
    existing = { days, mode: 'add_track', source: 'user' };
  }
  return {
    availability: {
      days: i.availability.days,
      windows: i.availability.windows,
      maxSessionsPerDay: i.availability.maxSessionsPerDay,
      maxTrainingDays: i.availability.maxTrainingDays,
      exceptions: i.availability.exceptions,
      preferredLongRunDay: run?.preferredLongRunDay ?? null,
    },
    strength,
    running: run
      ? {
          level: (i.levels.running ?? 'intermediate') as TrainingLevel,
          targetDistance: run.targetDistance,
          phase: run.phase,
          sessions: (run.slotsThisWeek as RunSlot[]).map((slot) => ({ slot })),
          isDeloadWeek: run.isDeloadWeek,
          fixed: (i.fixed ?? []).map((x: any) => ({ dow: x.dow, time: x.time, fills: x.fills, source: x.source })),
        }
      : null,
    levels: { strength: i.levels.strength, running: i.levels.running },
    existing,
    walking: i.walking,
    strengthCycleWeek: run?.strengthCycleWeek,
  };
}

/** Fixture reason vocabulary → engine codes (where the engine's name is more general). */
export const REASON_ALIASES: Record<string, string> = {
  SIX_DAYS_IN_A_ROW: 'LONG_TRAINING_STREAK',
};

export const layoutOf = (plan: WeekPlan): PlacedSession[][] => plan.days.map((d) => d.sessions);

const main = (s: PlacedSession) =>
  !s.optional && (s.kind === 'run' || (s.kind === 'strength' && !!s.slug && (profileOf(s.slug).slotKind === 'main' || !!s.variantOf)));

function norm(s: any): string {
  if (s.kind === 'run') return `run:${s.slot}${s.makeup ? ':makeup' : ''}`;
  if (s.kind === 'strength') return `strength:${s.slug}@${s.volumePct ?? 100}${s.makeup ? ':makeup' : ''}`;
  return `${s.kind}`;
}

export function layoutDiffs(expected: Record<string, any[]>, actual: PlacedSession[][]): string[] {
  const out: string[] = [];
  for (let d = 0; d < 7; d++) {
    const e = (expected[String(d)] ?? []).map(norm).join(' → ');
    const a = actual[d].map(norm).join(' → ');
    if (e !== a) out.push(`day ${d}: expected [${e}] got [${a}]`);
  }
  return out;
}

function matches(s: PlacedSession, spec: any): boolean {
  if (!main(s)) return false;
  if (spec.kind && spec.kind !== s.kind) return false;
  if (spec.slot && spec.slot !== s.slot) return false;
  if (spec.slug && spec.slug !== s.slug) return false;
  if (spec.pattern) {
    if (s.kind !== 'strength' || !s.slug) return false;
    if ((profileOf(s.slug).load as any)[spec.pattern] < 0.7) return false;
  }
  return true;
}

function daysOf(layout: PlacedSession[][], spec: any): number[] {
  const out: number[] = [];
  layout.forEach((ss, d) => ss.forEach((s) => matches(s, spec) && out.push(d)));
  return out;
}

export function constraintFailures(constraints: any[], layout: PlacedSession[][]): string[] {
  const fails: string[] = [];
  for (const c of constraints ?? []) {
    const tag = JSON.stringify(c);
    switch (c.type) {
      case 'slotOnDay':
        if (!layout[c.dow].some((s) => s.kind === 'run' && s.slot === c.slot && !s.optional)) fails.push(tag);
        break;
      case 'slotNotOnDay':
        if (layout[c.dow].some((s) => s.kind === 'run' && s.slot === c.slot && !s.optional)) fails.push(tag);
        break;
      case 'strengthOnDay':
        if (!layout[c.dow].some((s) => s.kind === 'strength' && s.slug === c.slug)) fails.push(tag);
        break;
      case 'notOnDays': {
        const [kind, slug] = String(c.kind).split(':');
        for (const d of c.days) {
          const bad = layout[d].some((s) => main(s) && (kind === 'hard' || (s.kind === kind && (!slug || s.slug === slug))));
          if (bad) fails.push(`${tag} (day ${d})`);
        }
        break;
      }
      case 'onlyDays':
        layout.forEach((ss, d) => {
          if (!c.days.includes(d) && ss.some(main)) fails.push(`${tag} (day ${d})`);
        });
        break;
      case 'sessionCount': {
        let n: number;
        if (c.kind === 'trainingDays') n = layout.filter((ss) => ss.some(main)).length;
        else n = layout.flat().filter((s) => matches(s, { kind: c.kind, slug: c.slug, slot: c.slot })).length;
        if (n !== c.count) fails.push(`${tag} (got ${n})`);
        break;
      }
      case 'maxDoubleDays': {
        const n = layout.filter((ss) => ss.some((s) => main(s) && s.kind === 'run') && ss.some((s) => main(s) && s.kind === 'strength')).length;
        if (n > c.count) fails.push(`${tag} (got ${n})`);
        break;
      }
      case 'minGapDays': {
        const a = daysOf(layout, c.a);
        const b = daysOf(layout, c.b);
        for (const da of a)
          for (const db of b) if (da !== db && Math.abs(da - db) < c.days) fails.push(`${tag} (${da},${db})`);
        break;
      }
      default:
        fails.push(`unknown constraint ${tag}`);
    }
  }
  return fails;
}

export function mustHoldFailures(mustHold: string[], plan: WeekPlan, input: ScheduleEngineInput): string[] {
  const open = plan.days.map((d) => d.available);
  const v = validateLayout(
    layoutOf(plan),
    { open, maxPerDay: input.availability.maxSessionsPerDay, maxTrainingDays: input.availability.maxTrainingDays },
    input.levels.running,
  );
  return v.filter((x) => mustHold.includes(x.rule as HardRuleId)).map((x) => `${x.rule} days ${x.days.join(',')}`);
}

export function reasonCodes(plan: WeekPlan): Set<string> {
  const s = new Set<string>();
  plan.warnings.forEach((r) => s.add(r.code));
  plan.days.forEach((d) => d.reasons.forEach((r) => s.add(r.code)));
  return s;
}

export function describe7(plan: WeekPlan): string {
  return plan.days.map((d) => `${d.dow}: ${d.sessions.map(norm).join(' → ') || '—'}`).join('\n');
}
