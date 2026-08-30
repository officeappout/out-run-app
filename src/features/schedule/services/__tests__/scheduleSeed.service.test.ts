import { describe, it, expect } from 'vitest';
import { resolveScheduleSeed, WIZARD_OPTIONS } from '../scheduleSeed.service';

// Pins the extraction from ScheduleStep.tsx's inline useMemo (30.08.2026) —
// the priority cascade (skillFocusSlugs override -> programPath override ->
// profile.progression.activePrograms -> DEFAULT_SEED_*) plus the hybrid
// UPPER_CALISTHENICS auto-injection and HANDSTAND special-casing must all
// behave exactly as the original inline memo did.

describe('resolveScheduleSeed', () => {
  it('source 1 wins: skillFocusSlugs resolves in order, seedPrograms still falls back to DEFAULT_SEED_PROGRAMS for a skill-only selection (not [])', () => {
    // A single hard skill deliberately, so this test isolates source-1
    // priority + the programs fallback — 2+ hard skills also triggers the
    // hybrid UPPER_CALISTHENICS injection, covered by its own test below.
    const result = resolveScheduleSeed(undefined, {
      skillFocusSlugs: ['planche', 'handstand'],
    });
    expect(result.activeWizardOptions.map((o) => o.id)).toEqual(['PLANCHE', 'HANDSTAND']);
    expect(result.seedSkills.map((s) => s.id)).toEqual(['PLANCHE', 'HANDSTAND']);
    expect(result.seedSkills[0].priority).toBe(1);
    expect(result.seedSkills[1].priority).toBe(2);
    expect(result.seedPrograms).toEqual(['UPPER_BODY']); // DEFAULT_SEED_PROGRAMS, not []
  });

  it('source 1 present but empty array falls through to source 2', () => {
    const result = resolveScheduleSeed(undefined, {
      skillFocusSlugs: [],
      programPath: 'health',
    });
    expect(result.seedPrograms).toEqual(['FULL_BODY']);
  });

  it('source 1 present but all-unknown slugs falls through to source 2', () => {
    const result = resolveScheduleSeed(undefined, {
      skillFocusSlugs: ['not_a_real_slug'],
      programPath: 'body_focus',
    });
    expect(result.seedPrograms).toEqual(['UPPER_BODY']);
  });

  it("source 2: programPath 'health' resolves to FULL_BODY", () => {
    const result = resolveScheduleSeed(undefined, { programPath: 'health' });
    expect(result.seedPrograms).toEqual(['FULL_BODY']);
  });

  it("source 2: programPath 'body_focus' resolves to UPPER_BODY", () => {
    const result = resolveScheduleSeed(undefined, { programPath: 'body_focus' });
    expect(result.seedPrograms).toEqual(['UPPER_BODY']);
  });

  it('source 2: unrecognized programPath value falls through to source 3/4', () => {
    const result = resolveScheduleSeed(undefined, { programPath: 'something_else' });
    expect(result.seedPrograms).toEqual(['UPPER_BODY']); // DEFAULT_SEED_PROGRAMS
  });

  it('source 3: activePrograms resolved via exact slug match on templateId', () => {
    const result = resolveScheduleSeed({
      progression: { activePrograms: [{ templateId: 'planche' }] },
    });
    expect(result.seedSkills.map((s) => s.id)).toEqual(['PLANCHE']);
  });

  it('source 3: activePrograms resolved via dash-normalized templateId', () => {
    const result = resolveScheduleSeed({
      progression: { activePrograms: [{ templateId: 'front-lever' }] },
    });
    expect(result.seedSkills.map((s) => s.id)).toEqual(['FRONT_LEVER']);
  });

  it('source 3: activePrograms resolved via Hebrew name substring match', () => {
    const result = resolveScheduleSeed({
      progression: { activePrograms: [{ name: 'תוכנית עמידת ידיים מתקדמת', templateId: '' }] },
    });
    expect(result.seedSkills.map((s) => s.id)).toEqual(['HANDSTAND']);
  });

  it('source 3: activePrograms resolved via English name substring match', () => {
    const result = resolveScheduleSeed({
      progression: { activePrograms: [{ name: 'Muscle Up Program', templateId: '' }] },
    });
    expect(result.seedSkills.map((s) => s.id)).toEqual(['MUSCLE_UP']);
  });

  it('source 3: unresolvable activePrograms entries fall through to source 4', () => {
    const result = resolveScheduleSeed({
      progression: { activePrograms: [{ name: 'totally unrelated thing', templateId: 'xyz' }] },
    });
    expect(result.seedPrograms).toEqual(['UPPER_BODY']); // DEFAULT_SEED_PROGRAMS
    expect(result.seedSkills).toEqual([]);
  });

  it('source 4: no profile, no overrides -> DEFAULT_SEED_PROGRAMS, no skills, full WIZARD_OPTIONS catalog', () => {
    const result = resolveScheduleSeed(undefined, undefined);
    expect(result.seedPrograms).toEqual(['UPPER_BODY']);
    expect(result.seedSkills).toEqual([]);
    expect(result.activeWizardOptions).toBe(WIZARD_OPTIONS);
  });

  it('profile as null, undefined, and {} are all accepted without throwing, and all fall through to DEFAULT_SEED_*', () => {
    for (const profile of [null, undefined, {}]) {
      const result = resolveScheduleSeed(profile);
      expect(result.seedPrograms).toEqual(['UPPER_BODY']);
      expect(result.seedSkills).toEqual([]);
    }
  });

  it('dedup: duplicate slugs collapse to one option', () => {
    const result = resolveScheduleSeed(undefined, {
      skillFocusSlugs: ['planche', 'planche'],
    });
    expect(result.activeWizardOptions.map((o) => o.id)).toEqual(['PLANCHE']);
  });

  it('hybrid injection: 2+ hard skills (excluding HANDSTAND) auto-appends UPPER_CALISTHENICS', () => {
    const result = resolveScheduleSeed(undefined, {
      skillFocusSlugs: ['planche', 'front_lever'],
    });
    expect(result.activeWizardOptions.map((o) => o.id)).toContain('UPPER_CALISTHENICS');
  });

  it('hybrid injection does not double-append when UPPER_CALISTHENICS is already present', () => {
    const result = resolveScheduleSeed(undefined, {
      skillFocusSlugs: ['planche', 'front_lever', 'calisthenics_upper'],
    });
    const count = result.activeWizardOptions.filter((o) => o.id === 'UPPER_CALISTHENICS').length;
    expect(count).toBe(1);
  });

  it('hybrid injection does NOT fire for a single hard skill', () => {
    const result = resolveScheduleSeed(undefined, { skillFocusSlugs: ['planche'] });
    expect(result.activeWizardOptions.map((o) => o.id)).not.toContain('UPPER_CALISTHENICS');
  });

  it('HANDSTAND gets isFreeSlot/countsTowardCap/minRestHours special-casing and does not count toward the 2+ hard-skill hybrid trigger', () => {
    const result = resolveScheduleSeed(undefined, {
      skillFocusSlugs: ['handstand', 'planche'],
    });
    const handstand = result.seedSkills.find((s) => s.id === 'HANDSTAND')!;
    expect(handstand.isFreeSlot).toBe(true);
    expect(handstand.countsTowardCap).toBe(false);
    expect(handstand.minRestHours).toBe(24);
    // Only 1 real hard skill (planche) + HANDSTAND (excluded) -> no hybrid injection.
    expect(result.activeWizardOptions.map((o) => o.id)).not.toContain('UPPER_CALISTHENICS');
  });

  it('priority ordinals follow input order', () => {
    const result = resolveScheduleSeed(undefined, {
      skillFocusSlugs: ['muscle_up', 'hspu', 'oapu'],
    });
    expect(result.seedSkills.map((s) => [s.id, s.priority])).toEqual([
      ['MUSCLE_UP', 1],
      ['HSPU', 2],
      ['OAPU', 3],
    ]);
  });
});
