/**
 * Onboarding step funnel — enable_onboarding_step_funnel (default OFF, owner-approved 22.10.2026,
 * docs/admin/ADMIN-AI-ASSISTANT-PLAN.md open question 9).
 *
 * Before this, `onboarding_step_completed` fired from only a few hand-picked places (SCHEDULE,
 * plus HISTORY whose step component is no longer mounted anywhere) and from
 * onboarding-sync.service's DEBOUNCED store write — which fires on every data change with the
 * step the user is currently ON, so it says "user was on X", not "user finished X". Neither can
 * give step-to-step drop-off.
 *
 * With the flag on, every live completion point of the 15 onboarding steps (the same 15 ids as
 * journey-activation.ts's STEP_LABELS) calls `logOnboardingFunnelStep(step)`, which writes ONE
 * event with the existing schema — step_name / step_index / time_spent — plus
 * `source: 'funnel_v1'`, so a funnel query can keep the clean events apart from the older
 * noisy ones (which are left exactly as they were). Count DISTINCT userId per step_name.
 *
 * Throttle: at most once per step per app session (sessionStorage). A full signup is ~6–11
 * events per user, once — see the PR for the write-cost estimate.
 *
 * Off = byte-identical: the flag is read first and nothing else happens (no event, no storage).
 * Privacy: no location, no free text — the step id, its index and seconds spent only; the
 * user's analytics opt-out is honoured inside logEvent.
 */
import { readLiveFlag } from '@/lib/feature-flag-live';
import { logEvent } from './AnalyticsService';

/**
 * The 15 funnel steps, in the order step_index reports for source 'funnel_v1' (a funnel order
 * across the live flows, not onboarding-sync's STEP_ORDER). Not every path visits every step.
 * Steps with no live screen today (no completion point can fire): HISTORY (HistoryStep is not
 * mounted anywhere), SOCIAL_MAP and COMMUNITY (no component), SUMMARY (OnboardingWizard renders
 * null for it). They stay in the list so a future screen only has to call the helper.
 */
export const ONBOARDING_FUNNEL_STEPS = [
  'IDENTITY',
  'ACCESS_CODE',
  'PERSONA',
  'PERSONAL_STATS',
  'ASSESSMENT',
  'LOCATION',
  'EQUIPMENT',
  'SCHEDULE',
  'HISTORY',
  'HEALTH_DECLARATION',
  'ACCOUNT_SECURE',
  'PROCESSING',
  'SOCIAL_MAP',
  'COMMUNITY',
  'SUMMARY',
] as const;

export type OnboardingFunnelStep = (typeof ONBOARDING_FUNNEL_STEPS)[number];

export const FUNNEL_SOURCE = 'funnel_v1';
export const FUNNEL_STORAGE_KEY = 'onb_funnel_v1';
/** time_spent cap — a step left open overnight is not "3 hours on this step". */
export const MAX_TIME_SPENT_SECONDS = 3600;

export interface FunnelSessionState {
  emitted: string[];
  lastMarkMs: number | null;
}

export interface FunnelEmit {
  step_name: OnboardingFunnelStep;
  step_index: number;
  time_spent: number;
}

/** Pure: what (if anything) to log for `step` now, and the next session state. */
export function planFunnelEmit(
  state: FunnelSessionState,
  step: string,
  nowMs: number,
): { emit: FunnelEmit | null; next: FunnelSessionState } {
  const index = (ONBOARDING_FUNNEL_STEPS as readonly string[]).indexOf(step);
  if (index < 0 || state.emitted.includes(step)) return { emit: null, next: state };
  const raw = state.lastMarkMs == null ? 0 : Math.round((nowMs - state.lastMarkMs) / 1000);
  const time_spent = Math.min(Math.max(raw, 0), MAX_TIME_SPENT_SECONDS);
  return {
    emit: { step_name: step as OnboardingFunnelStep, step_index: index, time_spent },
    next: { emitted: [...state.emitted, step], lastMarkMs: nowMs },
  };
}

function readState(): FunnelSessionState {
  try {
    const raw = window.sessionStorage.getItem(FUNNEL_STORAGE_KEY);
    if (!raw) return { emitted: [], lastMarkMs: null };
    const parsed = JSON.parse(raw) as Partial<FunnelSessionState>;
    return {
      emitted: Array.isArray(parsed?.emitted) ? parsed.emitted.filter((s) => typeof s === 'string') : [],
      lastMarkMs: typeof parsed?.lastMarkMs === 'number' ? parsed.lastMarkMs : null,
    };
  } catch {
    return { emitted: [], lastMarkMs: null };
  }
}

function writeState(state: FunnelSessionState): void {
  try {
    window.sessionStorage.setItem(FUNNEL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable — at worst a step is logged twice in this session */
  }
}

/**
 * Record that the user finished `step`. Fire-and-forget, never throws, never blocks navigation.
 * No-op when the flag is off, outside the browser, or for a step already logged this session.
 */
export function logOnboardingFunnelStep(step: OnboardingFunnelStep | string): void {
  if (!readLiveFlag('enableOnboardingStepFunnel')) return;
  if (typeof window === 'undefined') return;
  const { emit, next } = planFunnelEmit(readState(), step, Date.now());
  if (!emit) return;
  writeState(next);
  void logEvent('onboarding_step_completed', { ...emit, source: FUNNEL_SOURCE }).catch(() => {});
}
