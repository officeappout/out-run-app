import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';

const logEvent = vi.fn(async () => true);
vi.mock('../AnalyticsService', () => ({ logEvent: (...args: unknown[]) => logEvent(...(args as [])) }));

import {
  ONBOARDING_FUNNEL_STEPS,
  FUNNEL_SOURCE,
  FUNNEL_STORAGE_KEY,
  MAX_TIME_SPENT_SECONDS,
  planFunnelEmit,
  logOnboardingFunnelStep,
} from '../onboarding-funnel';
import { LIVE_FLAGS_CACHE_KEY } from '@/lib/feature-flag-live';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';
import { STEP_LABELS } from '@/features/admin/services/journey-activation';

function stubWindow(flagOn: boolean | null) {
  const local: Record<string, string> = {};
  const session: Record<string, string> = {};
  if (flagOn !== null) local[LIVE_FLAGS_CACHE_KEY] = JSON.stringify({ enableOnboardingStepFunnel: flagOn });
  const sessionStorage = {
    getItem: vi.fn((k: string) => session[k] ?? null),
    setItem: vi.fn((k: string, v: string) => { session[k] = v; }),
  };
  vi.stubGlobal('window', { localStorage: { getItem: (k: string) => local[k] ?? null }, sessionStorage });
  return { session, sessionStorage };
}

describe('onboarding step funnel — enable_onboarding_step_funnel', () => {
  beforeEach(() => logEvent.mockClear());
  afterEach(() => vi.unstubAllGlobals());

  it('is a panel flag, default OFF, same value for admins', () => {
    expect(FLAG_DEFS.find((d) => d.key === 'enableOnboardingStepFunnel')).toEqual({
      key: 'enableOnboardingStepFunnel',
      firestoreKey: 'enable_onboarding_step_funnel',
      defaultValue: false,
      superAdminValue: false,
    });
  });

  it('covers exactly the 15 steps the journey dashboard labels', () => {
    expect(ONBOARDING_FUNNEL_STEPS).toHaveLength(15);
    expect([...ONBOARDING_FUNNEL_STEPS].sort()).toEqual(Object.keys(STEP_LABELS).sort());
  });

  it('flag OFF → no event and no storage touched (byte-identical)', () => {
    const { sessionStorage } = stubWindow(false);
    logOnboardingFunnelStep('PERSONA');
    expect(logEvent).not.toHaveBeenCalled();
    expect(sessionStorage.getItem).not.toHaveBeenCalled();
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
  });

  it('flag missing from the cache → OFF', () => {
    const { sessionStorage } = stubWindow(null);
    logOnboardingFunnelStep('PERSONA');
    expect(logEvent).not.toHaveBeenCalled();
    expect(sessionStorage.setItem).not.toHaveBeenCalled();
  });

  it('no window (server) → nothing', () => {
    logOnboardingFunnelStep('PERSONA');
    expect(logEvent).not.toHaveBeenCalled();
  });

  it('flag ON → one event per step per session, existing schema + source', () => {
    const { session } = stubWindow(true);
    logOnboardingFunnelStep('IDENTITY');
    logOnboardingFunnelStep('IDENTITY');
    logOnboardingFunnelStep('PERSONA');
    expect(logEvent).toHaveBeenCalledTimes(2);
    expect(logEvent).toHaveBeenNthCalledWith(1, 'onboarding_step_completed', {
      step_name: 'IDENTITY',
      step_index: 0,
      time_spent: 0,
      source: FUNNEL_SOURCE,
    });
    expect((logEvent.mock.calls[1] as unknown[])[1]).toMatchObject({ step_name: 'PERSONA', step_index: 2, source: FUNNEL_SOURCE });
    expect(JSON.parse(session[FUNNEL_STORAGE_KEY]).emitted).toEqual(['IDENTITY', 'PERSONA']);
  });

  it('corrupt session state → starts fresh instead of throwing', () => {
    const { session } = stubWindow(true);
    session[FUNNEL_STORAGE_KEY] = '{nope';
    expect(() => logOnboardingFunnelStep('SCHEDULE')).not.toThrow();
    expect(logEvent).toHaveBeenCalledTimes(1);
  });
});

describe('planFunnelEmit (pure)', () => {
  const empty = { emitted: [] as string[], lastMarkMs: null };

  it('unknown step → nothing', () => {
    expect(planFunnelEmit(empty, 'COMPLETED', 1000).emit).toBeNull();
  });

  it('time_spent = seconds since the previous completion, clamped to [0, cap]', () => {
    const a = planFunnelEmit(empty, 'PERSONA', 10_000);
    expect(a.emit?.time_spent).toBe(0);
    const b = planFunnelEmit(a.next, 'SCHEDULE', 10_000 + 42_400);
    expect(b.emit?.time_spent).toBe(42);
    const c = planFunnelEmit(b.next, 'LOCATION', 10_000 + 42_400 + 10 * 3600 * 1000);
    expect(c.emit?.time_spent).toBe(MAX_TIME_SPENT_SECONDS);
    const clockBack = planFunnelEmit({ emitted: [], lastMarkMs: 50_000 }, 'EQUIPMENT', 1_000);
    expect(clockBack.emit?.time_spent).toBe(0);
  });

  it('already emitted → nothing, state unchanged', () => {
    const s = { emitted: ['PERSONA'], lastMarkMs: 5 };
    const r = planFunnelEmit(s, 'PERSONA', 99);
    expect(r.emit).toBeNull();
    expect(r.next).toBe(s);
  });
});
