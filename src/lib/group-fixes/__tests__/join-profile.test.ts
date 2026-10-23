import { describe, it, expect, vi } from 'vitest';
import { profileReadyForJoin } from '../join-profile';

function store(state: { _hasHydrated: boolean; profile: { core?: { ageGroup?: unknown } } | null }, fresh?: unknown) {
  const s = {
    ...state,
    refreshProfile: vi.fn(async () => { if (fresh) s.profile = { core: { ageGroup: fresh } }; }),
  };
  return { getState: () => s, s };
}
const noSleep = async () => {};

describe('profileReadyForJoin (P2-18)', () => {
  it('complete profile in the store → true, no fetch', async () => {
    const st = store({ _hasHydrated: true, profile: { core: { ageGroup: 'adult' } } });
    expect(await profileReadyForJoin(st, noSleep)).toBe(true);
    expect(st.s.refreshProfile).not.toHaveBeenCalled();
  });
  it('store still empty → refresh from Firestore before deciding', async () => {
    const st = store({ _hasHydrated: true, profile: null }, 'adult');
    expect(await profileReadyForJoin(st, noSleep)).toBe(true);
    expect(st.s.refreshProfile).toHaveBeenCalledOnce();
  });
  it('really incomplete → false (goes to identity)', async () => {
    const st = store({ _hasHydrated: false, profile: null });
    expect(await profileReadyForJoin(st, noSleep)).toBe(false);
  });
});
