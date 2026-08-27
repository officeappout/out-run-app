import { describe, it, expect, vi } from 'vitest';
import { runSuggestionEngineStreaming } from '../../engine/suggestion-engine';
import { buildHomeUserContext } from '../build-home-user-context';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

/**
 * Section 1 device-test prerequisite (27.08.2026, David's request): "test with a hard/incomplete
 * profile (a new user without much data) — confirm the system doesn't fall over." Proves the
 * REAL pipeline the home carousel actually calls — buildHomeUserContext ->
 * runSuggestionEngineStreaming, same two calls as home/page.tsx's own effect — never throws and
 * always resolves to at least one well-formed suggestion for a brand-new, unassessed profile
 * (no lifestyle, no progression, no schedule). safety-net's own header already documents it as
 * "provably total" (always eligible, generate() cannot throw/return null) — this test proves
 * that guarantee actually reaches an end-to-end call through the real context builder + real
 * engine, not just safety-net's own isolated unit test.
 *
 * useUserStore mock mirrors suggestion-engine.test.ts's own convention: full-strength/
 * recovery-follow-up read `useUserStore.getState().profile` directly (NOT the buildHomeUserContext
 * `profile` param) for their own eligible()/generate(). A non-null-but-empty profile here makes
 * full-strength cheaply self-exclude (no assessed domain/track — see full-strength.generator.ts's
 * own IS_CHEAP_SUGGESTION_RANKING_ENABLED branch) and recovery-follow-up take its real,
 * Firestore-touching generate() (gracefully catching in this test environment, same accepted
 * ~3.5s one-time SDK-init cost suggestion-engine.test.ts already documents) — a realistic
 * brand-new-user shape, not an artificially-stubbed one.
 */
vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: { getState: () => ({ id: 'new-user-1', profile: { core: {}, progression: {}, lifestyle: {} } }) },
}));

describe('home pipeline — incomplete/brand-new profile does not crash the ranking pipeline', () => {
  it('buildHomeUserContext + runSuggestionEngineStreaming resolve with >=1 well-formed suggestion', async () => {
    const barelyThereProfile = {
      id: 'new-user-1',
      core: {},
      progression: {},
      lifestyle: {},
    } as unknown as UserFullProfile;

    const context = buildHomeUserContext({ profile: barelyThereProfile, location: null, surface: 'home' });

    // buildHomeUserContext itself must not throw and must produce sane defaults — not
    // undefined/NaN — for every field the home ranking effect actually reads.
    expect(context.todayCompletedDomains).toEqual([]);
    expect(['strength', 'recovery']).toContain(context.todayGoal);
    expect(Number.isFinite(context.recoveryState.daysInactive)).toBe(true);

    const seen: string[] = [];
    const ranked = await runSuggestionEngineStreaming(context, (s) => seen.push(s.generatorId));

    // safety-net alone guarantees this is never empty, regardless of how unassessed the
    // profile is — exactly the "not an empty/broken card" concern this test exists to rule out.
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked.map((s) => s.generatorId)).toContain('safety-net');
    for (const s of ranked) {
      expect(s.title).toBeTruthy();
      expect(s.structure.durationMin).toBeGreaterThan(0);
    }
  }, 15000);
});
