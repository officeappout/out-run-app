import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Program } from '@/features/content/programs/core/program.types';

vi.mock('@/features/content/programs/core/program.service', () => ({
  getAllPrograms: vi.fn(async (): Promise<Program[]> => []),
  MASTER_PROGRAM_SLUG_TO_ID: {},
}));

import { getAllPrograms } from '@/features/content/programs/core/program.service';
import { resolveCategoryToProgramId, clearContentCache } from '../visual-content-resolver.service';

/**
 * Regression coverage for the onboarding-assessment category-map
 * movementPattern-ambiguity bug (2026-10-10 fix). Companion to
 * lead-program.service.ts's full-body-budget fix -- same root cause
 * (PR #160, 08.10.2026, wrote movementPattern onto 7 skill programs),
 * different call site: `loadCategoryMap`'s `!map.has(pattern)` first-write-
 * wins indexing let whichever skill program happened to sort first by name
 * (getAllPrograms()'s own orderBy) claim the 'push'/'pull' slot before the
 * real generic program was ever reached -- the onboarding "push" slider
 * then showed Human Flag's video/copy instead of Push's.
 */

function makeProgram(id: string, name: string, slug: string, movementPattern?: string): Program {
  return { id, name, slug, movementPattern, isMaster: false } as any;
}

beforeEach(() => {
  clearContentCache(); // resets the module-level categoryProgramMap between tests
  vi.mocked(getAllPrograms).mockReset();
});

describe('resolveCategoryToProgramId — movementPattern/slug collision (2026-10-10 fix)', () => {
  it('"push" category resolves to the real push program id, not a skill sorted first', async () => {
    vi.mocked(getAllPrograms).mockResolvedValue([
      makeProgram('human-flag-id', 'דגל אנושי', 'human_flag', 'push'),
      makeProgram('push-id', 'דחיפה', 'push', 'push'),
    ]);

    const resolved = await resolveCategoryToProgramId('push');
    expect(resolved).toBe('push-id');
  });

  it('a skill\'s own slug ("human_flag") still resolves directly to its own program, unaffected', async () => {
    vi.mocked(getAllPrograms).mockResolvedValue([
      makeProgram('human-flag-id', 'דגל אנושי', 'human_flag', 'push'),
      makeProgram('push-id', 'דחיפה', 'push', 'push'),
    ]);

    const resolved = await resolveCategoryToProgramId('human_flag');
    expect(resolved).toBe('human-flag-id');
  });
});
