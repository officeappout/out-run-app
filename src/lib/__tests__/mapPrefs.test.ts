// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readOwnedMapPrefs, clearMapPrefs, stampMapPrefsOwner, MAP_PREFS_OWNER_KEY } from '@/lib/mapPrefs';
import { MAP_PREFS_GUEST_OWNER } from '@/lib/mapPrefsOwnership';

function seed(owner: string | null) {
  localStorage.setItem('map_authority_id', 'city-a');
  localStorage.setItem('map_anchor_lat', '32.1');
  localStorage.setItem('map_anchor_lng', '34.8');
  if (owner) localStorage.setItem(MAP_PREFS_OWNER_KEY, owner);
}

describe('mapPrefs', () => {
  beforeEach(() => localStorage.clear());

  it('returns the answer for its owner', async () => {
    seed('u1');
    const saved = await readOwnedMapPrefs({ currentUid: 'u1' });
    expect(saved?.authorityId).toBe('city-a');
  });

  it('returns null and clears for another account', async () => {
    seed('u1');
    expect(await readOwnedMapPrefs({ currentUid: 'u2' })).toBeNull();
    expect(localStorage.getItem('map_authority_id')).toBeNull();
    expect(localStorage.getItem(MAP_PREFS_OWNER_KEY)).toBeNull();
  });

  it('legacy: loads the profile city lazily and claims on match', async () => {
    seed(null);
    const load = vi.fn().mockResolvedValue('city-a');
    const saved = await readOwnedMapPrefs({ currentUid: 'u1', loadProfileAuthorityId: load });
    expect(load).toHaveBeenCalledOnce();
    expect(saved?.lat).toBe('32.1');
    expect(localStorage.getItem(MAP_PREFS_OWNER_KEY)).toBe('u1');
  });

  it('legacy: a new account without a city gets nothing and the prefs are cleared', async () => {
    seed(null);
    const saved = await readOwnedMapPrefs({ currentUid: 'u2', loadProfileAuthorityId: async () => null });
    expect(saved).toBeNull();
    expect(localStorage.getItem('map_anchor_lat')).toBeNull();
  });

  it('stamps guest before auth and clears everything on sign-out', () => {
    stampMapPrefsOwner(undefined);
    expect(localStorage.getItem(MAP_PREFS_OWNER_KEY)).toBe(MAP_PREFS_GUEST_OWNER);
    seed(null);
    clearMapPrefs();
    expect(localStorage.length).toBe(0);
  });
});
