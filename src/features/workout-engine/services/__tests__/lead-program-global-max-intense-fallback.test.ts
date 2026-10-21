import { describe, it, expect, vi } from 'vitest';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

vi.mock('@/features/content/programs/core/programLevelSettings.service', () => ({
  getProgramLevelSetting: vi.fn().mockResolvedValue(null),
  isPlsCacheEnabled: vi.fn().mockReturnValue(false),
}));

import { resolveGlobalMaxIntense, getDefaultMaxIntense } from '../lead-program.service';

/**
 * Characterization test for the no-resolved-program fallback of
 * `resolveGlobalMaxIntense`, pinned when its `domains.overall` read was made
 * type-correct (21.10.2026). `overall` is not a TrainingDomainId and nothing
 * writes `progression.domains.overall`, so in production the fallback level
 * is effectively always 1. The type fix must not change that.
 */
function profile(domains: Record<string, { currentLevel: number }>): UserFullProfile {
  return {
    progression: { activePrograms: [], tracks: {}, domains },
  } as unknown as UserFullProfile;
}

describe('resolveGlobalMaxIntense — no resolved program fallback', () => {
  it('ignores real domain levels (no `overall` key) → level-1 default', async () => {
    const result = await resolveGlobalMaxIntense(profile({ full_body: { currentLevel: 20 } }), []);
    expect(result).toBe(getDefaultMaxIntense(1));
  });

  it('still reads `domains.overall` when such a key exists', async () => {
    const result = await resolveGlobalMaxIntense(profile({ overall: { currentLevel: 20 } }), []);
    expect(result).toBe(getDefaultMaxIntense(20));
  });
});
