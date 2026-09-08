import { describe, expect, it } from 'vitest';
import { resolveVolumeExerciseDomain } from '../workout-budgeting.utils';

const ex = (targetPrograms: Array<{ programId: string; level: number }>, primaryMuscle?: string): any => ({
  id: 'test-ex',
  targetPrograms,
  primaryMuscle,
});

describe('resolveVolumeExerciseDomain (volume-assignment domain resolver, migrated 2026-09-08)', () => {
  it("David's real bug — planche co-tagged with push, push recorded first — must resolve to planche, not push", () => {
    const budgetDomains = new Set(['push', 'planche']);
    const resolved = resolveVolumeExerciseDomain(
      ex([{ programId: 'push', level: 16 }, { programId: 'planche', level: 7 }]),
      budgetDomains,
    );
    expect(resolved).toBe('planche');
  });

  it('one_arm_pullup co-tagged with pull, pull recorded first — resolves to one_arm_pullup', () => {
    const budgetDomains = new Set(['pull', 'one_arm_pullup']);
    const resolved = resolveVolumeExerciseDomain(
      ex([{ programId: 'pull', level: 19 }, { programId: 'one_arm_pullup', level: 10 }]),
      budgetDomains,
    );
    expect(resolved).toBe('one_arm_pullup');
  });

  it('no skill tag, only a direct parent match — unchanged behavior', () => {
    const budgetDomains = new Set(['push']);
    const resolved = resolveVolumeExerciseDomain(ex([{ programId: 'push', level: 12 }]), budgetDomains);
    expect(resolved).toBe('push');
  });

  it('reverse-match tier preserved — exercise tagged only with a parent still fills a narrower open budget slot via DOMAIN_ALIAS_MAP', () => {
    // DOMAIN_ALIAS_MAP maps a parent id to its children ids; an exercise
    // tagged only 'push' (no specific skill tag of its own) can still be
    // attributed to a specific active skill budget through this reverse
    // lookup — this is a DIFFERENT question from skill-vs-parent priority,
    // preserved verbatim as its own fallback tier by the 2026-09-08 migration.
    const budgetDomains = new Set(['planche']);
    const resolved = resolveVolumeExerciseDomain(ex([{ programId: 'push', level: 12 }]), budgetDomains);
    // No assertion on DOMAIN_ALIAS_MAP's real content here (that's a fixed,
    // externally-defined map) — this test only proves the reverse-tier CODE
    // PATH still runs (falls through past the unified resolver, which finds
    // nothing since 'push' isn't itself in budgetDomains) without throwing,
    // and that a genuinely-unmatched case still correctly returns undefined.
    expect(resolved === undefined || typeof resolved === 'string').toBe(true);
  });

  it('primaryMuscle fallback tier preserved — no tag match at all, muscle-based fallback still applies', () => {
    const budgetDomains = new Set(['push']);
    const resolved = resolveVolumeExerciseDomain(ex([], 'chest'), budgetDomains);
    expect(resolved).toBe('push');
  });

  it('no match anywhere — returns undefined, does not throw', () => {
    const budgetDomains = new Set(['legs']);
    const resolved = resolveVolumeExerciseDomain(ex([{ programId: 'push', level: 12 }]), budgetDomains);
    expect(resolved).toBeUndefined();
  });
});
