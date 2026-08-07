import { describe, it, expect } from 'vitest';
import { resolveAdditionalProgramSlugs, domainTypeForSlug } from '../program-groups.utils';

// vitest.config.ts runs in a plain 'node' environment with no JSX transform
// configured (no jsdom/window globals either — component/browser rendering
// tests are an explicit separate decision for this repo, see
// mini-domain-assessment.test.ts). ProgramsSection.tsx itself can't be
// imported here (it's JSX) or rendered; these tests cover the two pieces of
// genuinely NEW logic this task added, extracted into a plain .ts module —
// the same pattern used for resolveEffectivePipelineLocation.

describe('resolveAdditionalProgramSlugs — Group 3 ("תוכניות נוספות") membership', () => {
  const identityResolver = (id: string) => id;

  it('BEFORE (documented bug): only activePrograms[0] was ever read — a second, ' +
     'genuinely independent active program (e.g. planche alongside push) was silently ' +
     'invisible. AFTER: every entry from index 1 onward is included.', () => {
    expect(
      resolveAdditionalProgramSlugs(
        [{ templateId: 'push' }, { templateId: 'planche' }],
        identityResolver,
      ),
    ).toEqual(['planche']);
  });

  it('supports 2+ additional independent programs, in order', () => {
    expect(
      resolveAdditionalProgramSlugs(
        [{ templateId: 'push' }, { templateId: 'planche' }, { templateId: 'handstand' }],
        identityResolver,
      ),
    ).toEqual(['planche', 'handstand']);
  });

  it('single-program case (existing/master-child scenario): index 0 only → no additional slugs — unchanged behavior', () => {
    expect(resolveAdditionalProgramSlugs([{ templateId: 'push' }], identityResolver)).toEqual([]);
  });

  it('empty or missing activePrograms → no additional slugs, no throw', () => {
    expect(resolveAdditionalProgramSlugs([], identityResolver)).toEqual([]);
    expect(resolveAdditionalProgramSlugs(undefined, identityResolver)).toEqual([]);
  });

  it('an index 1+ entry missing templateId is dropped, not surfaced as a broken card', () => {
    expect(
      resolveAdditionalProgramSlugs(
        [{ templateId: 'push' }, {}, { templateId: 'planche' }],
        identityResolver,
      ),
    ).toEqual(['planche']);
  });

  it('each additional templateId is run through the injected slug resolver (mirrors master/child resolution)', () => {
    const upperCaseResolver = (id: string) => id.toUpperCase();
    expect(
      resolveAdditionalProgramSlugs(
        [{ templateId: 'push' }, { templateId: 'planche' }],
        upperCaseResolver,
      ),
    ).toEqual(['PLANCHE']);
  });
});

describe('domainTypeForSlug — category vs skill routing for the "not yet assessed" CTA', () => {
  it('the 4 primary body categories route as "category" (matches Group 2/children, always categories today)', () => {
    expect(domainTypeForSlug('push')).toBe('category');
    expect(domainTypeForSlug('pull')).toBe('category');
    expect(domainTypeForSlug('legs')).toBe('category');
    expect(domainTypeForSlug('core')).toBe('category');
  });

  it('a skill program (only reachable via Group 3, additional independent programs) routes as "skill"', () => {
    expect(domainTypeForSlug('planche')).toBe('skill');
    expect(domainTypeForSlug('muscle_up')).toBe('skill');
    expect(domainTypeForSlug('handstand')).toBe('skill');
  });
});
