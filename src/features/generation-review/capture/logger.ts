/**
 * The capture worker — loaded with a dynamic import by ./hooks.ts only when the gate is open,
 * so a flag-off device never even downloads it. Every function is fire-and-forget and swallows
 * its own errors: logging must never break or slow a generator.
 */
import type { ComposedHybridSession } from '@/features/workout-engine/hybrid/start-hybrid-session';
import type { GeneratedWorkout } from '@/features/workout-engine/logic/workout-generator.types';
import type { Route } from '@/features/parks/core/types/route.types';
import type { RunWorkout } from '@/features/workout-engine/players/running/types/run-workout.type';
import { fingerprintOf } from '@/lib/generation-review/fingerprint';
import type { GenerationInput, GenerationLogDraft, GenerationOutput, GenerationType, OutcomeStatus } from '@/lib/generation-review/types';
import { postGenerationReview } from './api';
import { familyOf, getActive, markStored, matchStarted, remember, seenRecently, setActive, type Family } from './memory';
import { strengthParts, type StrengthCtx } from './adapters/strength';
import { hybridParts, type HybridCtx } from './adapters/hybrid';
import { routeParts, type RouteCtx } from './adapters/route';
import { plannedRunParts } from './adapters/planned-run';

function newLogId(): string {
  const rnd = Math.random().toString(36).slice(2, 10);
  return `g${Date.now().toString(36)}${rnd}`.toLowerCase();
}

function appVersion(): string | null {
  const explicit = process.env.NEXT_PUBLIC_APP_VERSION;
  const sha = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;
  return explicit || (sha ? sha.slice(0, 7) : null);
}

function platform(): GenerationLogDraft['platform'] {
  try {
    const cap = (globalThis as unknown as { Capacitor?: { getPlatform?: () => string } }).Capacitor;
    const p = cap?.getPlatform?.();
    return p === 'ios' || p === 'android' ? p : 'web';
  } catch {
    return 'web';
  }
}

export function buildDraft(type: GenerationType, input: GenerationInput, output: GenerationOutput, generator?: string | null): GenerationLogDraft {
  return {
    id: newLogId(),
    type,
    generator: generator ?? null,
    input,
    output,
    fingerprint: fingerprintOf({ type, output }),
    appVersion: appVersion(),
    platform: platform(),
    shownAtMs: Date.now(),
  };
}

async function send(draft: GenerationLogDraft, routeId: string | null = null): Promise<string | null> {
  if (seenRecently(draft.type, draft.fingerprint)) return null;
  const exerciseIds = new Set([...draft.output.exercises, ...draft.output.legs.flatMap((l) => l.exercises ?? [])].map((e) => e.id));
  remember({ draft, family: familyOf(draft.type), exerciseIds, routeId, stored: false });
  const res = await postGenerationReview('log', draft);
  markStored(draft.id, res.ok && res.data?.stored === true);
  return draft.id;
}

const safe = <A extends unknown[]>(fn: (...a: A) => Promise<unknown>) => (...a: A) => {
  fn(...a).catch((err) => console.warn('[generation-review] capture failed', err instanceof Error ? err.message : err));
};

export const logWorkout = safe(async (type: 'home_strength' | 'kelly_workout', workout: GeneratedWorkout, ctx: StrengthCtx = {}) => {
  if (!workout?.exercises?.length) return;
  const { input, output } = strengthParts(workout, ctx);
  await send(buildDraft(type, input, output, ctx.generator));
});

export const logHybrid = safe(async (composed: ComposedHybridSession, ctx: HybridCtx = {}) => {
  if (!composed?.plan) return;
  const { type, input, output } = hybridParts(composed, ctx);
  await send(buildDraft(type, input, output, ctx.mode ?? null));
});

export const logRoutes = safe(async (routes: Route[], ctx: RouteCtx = {}) => {
  const list = (routes ?? []).slice(0, 3);
  for (let i = 0; i < list.length; i++) {
    const route = list[i];
    if (!route?.path?.length) continue;
    const { type, input, output } = routeParts(route, ctx);
    await send(buildDraft(type, input, output, `${output.route?.source ?? 'unknown'}:${i}`), route.id ?? null);
  }
});

export const logPlannedRun = safe(async (w: RunWorkout) => {
  if (!w?.blocks?.length) return;
  const { input, output } = plannedRunParts(w);
  await send(buildDraft('planned_run', input, output, w.category ?? null));
});

export const outcome = safe(async (family: Family, status: OutcomeStatus, hint: { exerciseIds?: string[]; routeId?: string | null } = {}) => {
  if (status === 'started') {
    const r = matchStarted(family, hint);
    // Not gated on `stored`: the log POST may still be in flight. An unsampled id → 404, harmless.
    setActive(family, r ? r.draft.id : null);
    if (r) await postGenerationReview('outcome', { id: r.draft.id, status });
    return;
  }
  const a = getActive(family);
  if (!a) return;
  // An early exit is followed by the normal save of the partial log — keep "abandoned".
  if (status === 'completed' && a.abandoned) {
    setActive(family, null);
    return;
  }
  if (status === 'abandoned') a.abandoned = true;
  await postGenerationReview('outcome', { id: a.id, status, swappedExercises: a.swaps });
  if (status === 'completed') setActive(family, null);
});

export function swap(family: Family) {
  const a = getActive(family);
  if (a) a.swaps++;
}
