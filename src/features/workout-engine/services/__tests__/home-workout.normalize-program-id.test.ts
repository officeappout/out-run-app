import { describe, it, expect } from 'vitest';
import { normalizeProgramId } from '../home-workout.service';
import { buildIdToSlugMapFromPrograms } from '../program-hierarchy.utils';
import type { Program } from '@/features/content/programs/core/program.types';

// Stage 8 fix (program-identity audit §06): normalizeProgramId used to go
// straight from the known SKILL_DISPLAY-uppercase map to a bare
// `.toLowerCase()` fallback — a raw Firestore hash (never a SKILL_DISPLAY
// key) got silently garbled into a lowercase string matching nothing, not
// the hash, not any real slug. resolveToSlug is now tried in between.

describe('normalizeProgramId', () => {
  it('a known SKILL_DISPLAY uppercase key still maps via the exact table — unaffected by this fix', () => {
    expect(normalizeProgramId('UPPER_CALISTHENICS')).toBe('calisthenics_upper');
    expect(normalizeProgramId('PLANCHE')).toBe('planche');
  });

  it('an already-lowercase slug is unaffected', () => {
    expect(normalizeProgramId('push')).toBe('push');
  });

  it('a raw Firestore hash resolves to its real slug when the id→slug map is warm (fails pre-fix: garbled to a lowercased hash matching nothing)', () => {
    buildIdToSlugMapFromPrograms([
      { id: 'J0fLpmJhG0KDN2tQouxh', name: 'דחיפה', slug: 'push', movementPattern: 'push', isMaster: false } as Program,
    ]);
    expect(normalizeProgramId('J0fLpmJhG0KDN2tQouxh')).toBe('push');
  });

  it('a genuinely unresolvable id still falls back to .toLowerCase() — unchanged last-resort behavior', () => {
    expect(normalizeProgramId('SomeUnknownValue')).toBe('someunknownvalue');
  });
});
