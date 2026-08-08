import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserContext } from '../../types/user-context.types';
import type { Suggestion } from '../../types/suggestion.types';
// vi.mock calls are hoisted above all imports by vitest's transform, so the store below
// picks up the mocked module even though this line is written after vi.mock() textually.
import { useSuggestionEngineStore, buildContextKey } from '../useSuggestionEngineStore';

const runSuggestionEngineMock = vi.fn();
vi.mock('../../engine/suggestion-engine', () => ({
  runSuggestionEngine: (...args: unknown[]) => runSuggestionEngineMock(...args),
}));

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const ctx = (overrides: Partial<UserContext> = {}): UserContext => ({
  userId: 'u1',
  baseLevel: 1,
  domainLevels: {},
  weeklyPerformance: { trainedDomainsThisWeek: [], neglectedDomains: [], totalSetsCompleted: 0, weeklyBudget: 0 },
  recoveryState: { isDetrainingLocked: false, daysInactive: 0 },
  todayGoal: null,
  stepGoal: 0, stepsToday: 0, stepsRemaining: 0,
  availableTimeMin: 30,
  preferences: {},
  questionnaires: {},
  location: { lat: 32, lng: 34 },
  timeOfDay: 'morning',
  surface: 'map',
  venue: null, transitState: null, workdayState: null, activitySignal: null,
  ...overrides,
});

const suggestions: Suggestion[] = [];

beforeEach(() => {
  runSuggestionEngineMock.mockReset();
  useSuggestionEngineStore.setState({ contextKey: null, status: 'idle', suggestions: null, error: null });
});

describe('buildContextKey', () => {
  it('is stable for equivalent contexts and differs when a relevant field changes', () => {
    expect(buildContextKey(ctx())).toBe(buildContextKey(ctx()));
    expect(buildContextKey(ctx())).not.toBe(buildContextKey(ctx({ availableTimeMin: 45 })));
  });
});

describe('useSuggestionEngineStore — dedup and stale-response guarding', () => {
  it('setContext triggers exactly one engine run for a fresh context', () => {
    const { promise } = deferred<Suggestion[]>();
    runSuggestionEngineMock.mockReturnValue(promise);

    useSuggestionEngineStore.getState().setContext(ctx());

    expect(runSuggestionEngineMock).toHaveBeenCalledTimes(1);
    expect(useSuggestionEngineStore.getState().status).toBe('loading');
  });

  it('calling setContext again with the SAME context while loading does NOT re-run', () => {
    const { promise } = deferred<Suggestion[]>();
    runSuggestionEngineMock.mockReturnValue(promise);

    const c = ctx();
    useSuggestionEngineStore.getState().setContext(c);
    useSuggestionEngineStore.getState().setContext(c);
    useSuggestionEngineStore.getState().setContext(ctx()); // equivalent, different object

    expect(runSuggestionEngineMock).toHaveBeenCalledTimes(1);
  });

  it('a stale response from a superseded context is dropped silently', async () => {
    const first = deferred<Suggestion[]>();
    const second = deferred<Suggestion[]>();
    runSuggestionEngineMock.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    useSuggestionEngineStore.getState().setContext(ctx({ availableTimeMin: 10 }));
    useSuggestionEngineStore.getState().setContext(ctx({ availableTimeMin: 99 })); // supersedes the first

    expect(runSuggestionEngineMock).toHaveBeenCalledTimes(2);

    // Second (newer) resolves first — should win.
    second.resolve(suggestions);
    await Promise.resolve(); await Promise.resolve();
    expect(useSuggestionEngineStore.getState().status).toBe('ready');
    const readyKey = useSuggestionEngineStore.getState().contextKey;

    // First (stale) resolves LATER — must NOT overwrite the newer ready state.
    first.resolve(suggestions);
    await Promise.resolve(); await Promise.resolve();
    expect(useSuggestionEngineStore.getState().contextKey).toBe(readyKey);
    expect(useSuggestionEngineStore.getState().status).toBe('ready');
  });

  it('sets status to error when the engine rejects', async () => {
    const { promise, reject } = deferred<Suggestion[]>();
    runSuggestionEngineMock.mockReturnValue(promise);

    useSuggestionEngineStore.getState().setContext(ctx());
    reject(new Error('boom'));
    await Promise.resolve().catch(() => {});
    await new Promise((r) => setTimeout(r, 0));

    expect(useSuggestionEngineStore.getState().status).toBe('error');
    expect(useSuggestionEngineStore.getState().error).toBe('boom');
  });
});
