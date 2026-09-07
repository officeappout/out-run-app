import { describe, it, expect } from 'vitest';
import { buildMockProfile } from '../mock-profile.utils';

/**
 * 03-CHANGES.md Addendum 29 (07.09.2026, David's fix): buildMockProfile used
 * to fabricate measurements in 3 ways, all now fixed:
 *   (a) wrong field names ({level, progressPercent} instead of
 *       {currentLevel, percent}) — the engine never actually read the levels.
 *   (b) an invented core:L1 registration whenever `domainLevels.core` was
 *       omitted (Math.max(1, effectiveLevel-7)) — the exact artifact source
 *       of the 223s rest-outlier investigated in Addendum 26.
 *   (c) activePrograms:[] silently falling back to a synthetic
 *       {templateId:'full_body'} entry — the ONE program shape that happens
 *       to expand correctly (resolveChildDomainsForParent special-cases
 *       'full_body'), which masked the activePrograms[0]-only read bug for
 *       the entire session (doc 10) since every test profile went through it.
 */
describe('buildMockProfile — structural fidelity to a real Firestore profile', () => {
  it('(a) uses currentLevel/percent, never level/progressPercent, in tracks', () => {
    const profile = buildMockProfile({
      level: 8, persona: '', injuries: [], domainLevels: { push: 8, pull: 6 },
    });
    const pushTrack = profile.progression!.tracks!['push'];
    expect(pushTrack).toBeDefined();
    expect(pushTrack).toHaveProperty('currentLevel', 8);
    expect(pushTrack).toHaveProperty('percent', 50);
    expect(pushTrack).not.toHaveProperty('level');
    expect(pushTrack).not.toHaveProperty('progressPercent');
  });

  it('(b) never fabricates a core level when domainLevels.core is omitted', () => {
    const profile = buildMockProfile({
      level: 8, persona: '', injuries: [], domainLevels: { push: 8, pull: 8 },
    });
    expect(profile.progression!.tracks!['core']).toBeUndefined();
    expect((profile.progression!.domains as any).core).toBeUndefined();
  });

  it('(b) never fabricates push/pull/legs either — same rule, all four domains', () => {
    const profile = buildMockProfile({
      level: 8, persona: '', injuries: [], domainLevels: { push: 8 },
    });
    expect(profile.progression!.tracks!['pull']).toBeUndefined();
    expect(profile.progression!.tracks!['legs']).toBeUndefined();
    expect((profile.progression!.domains as any).lower_body).toBeUndefined();
  });

  it('(b) DOES include exactly what was provided, with the real values, no rounding/offset', () => {
    const profile = buildMockProfile({
      level: 20, persona: '', injuries: [], domainLevels: { core: 3 },
    });
    expect(profile.progression!.tracks!['core']).toMatchObject({ currentLevel: 3, percent: 50 });
    expect((profile.progression!.domains as any).core).toMatchObject({ currentLevel: 3 });
  });

  it('(c) activePrograms:[] (default) produces a truly empty array, not a synthetic full_body entry', () => {
    const profile = buildMockProfile({
      level: 8, persona: '', injuries: [], domainLevels: { push: 8, pull: 8 },
    });
    expect(profile.progression!.activePrograms).toEqual([]);
  });

  it('(c) a real push_pull_legs-style 3-program input is preserved verbatim, activePrograms[1]/[2] included', () => {
    const profile = buildMockProfile({
      level: 8, persona: '', injuries: [],
      activePrograms: [
        { id: 'push', name: 'Push', level: 8 },
        { id: 'pull', name: 'Pull', level: 8 },
        { id: 'legs', name: 'Legs', level: 8 },
      ],
    });
    expect(profile.progression!.activePrograms).toHaveLength(3);
    expect(profile.progression!.activePrograms.map(p => p.templateId)).toEqual(['push', 'pull', 'legs']);
    expect(profile.progression!.tracks!['push']).toMatchObject({ currentLevel: 8 });
    expect(profile.progression!.tracks!['pull']).toMatchObject({ currentLevel: 8 });
    expect(profile.progression!.tracks!['legs']).toMatchObject({ currentLevel: 8 });
  });

  it('domains.full_body is still populated from the required `level` param (explicit input, not a fabrication)', () => {
    const profile = buildMockProfile({ level: 12, persona: '', injuries: [] });
    expect((profile.progression!.domains as any).full_body).toMatchObject({ currentLevel: 12 });
  });

  it('coldStart leaves every domain genuinely absent (no L1 invention anywhere)', () => {
    const profile = buildMockProfile({
      level: 20, persona: '', injuries: [], domainLevels: { push: 20, pull: 20, legs: 20, core: 20 }, coldStart: true,
    });
    expect(profile.progression!.tracks).toEqual({});
    expect((profile.progression!.domains as any).upper_body).toBeUndefined();
    expect((profile.progression!.domains as any).lower_body).toBeUndefined();
    expect((profile.progression!.domains as any).core).toBeUndefined();
    expect(profile.progression!.activePrograms).toEqual([]);
  });
});
