/**
 * active-set-priority.test.ts — Progression System v2, Phase 3.
 *
 * Unit tests for the general active-set-in-priority-order sourcing that
 * replaced the old tracks-derived, gender/PPL-heuristic fallback in
 * resolvePrioritySkillIds. Covers: single-program identical-to-today
 * (P2 stays empty so selectExercisesWithDominance's own gate never
 * fires), multi-program blended by activePrograms' own array order, a
 * master's children expansion preserved, and a program that's tracked
 * but NOT active correctly excluded (tracked/available are
 * progression-only, never workout drivers).
 */
import { describe, it, expect } from 'vitest';
import { resolveActiveSetPriorityTiers, resolvePrioritySkillIds } from '../SplitDecisionService';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

function activeProgram(templateId: string): UserFullProfile['progression'] extends infer P
  ? P extends { activePrograms: (infer E)[] }
    ? E
    : never
  : never {
  return {
    id: templateId,
    templateId,
    name: templateId,
    startDate: '2026-01-01',
    durationWeeks: 52,
    currentWeek: 1,
    focusDomains: [],
  } as any;
}

function profileWith(opts: {
  activeTemplateIds?: (string | undefined)[];
  domains?: Record<string, number>;
  tracks?: Record<string, number>;
}): UserFullProfile {
  const domains: Record<string, { currentLevel: number }> = {};
  for (const [k, v] of Object.entries(opts.domains ?? {})) domains[k] = { currentLevel: v };
  const tracks: Record<string, { currentLevel: number; percent: number }> = {};
  for (const [k, v] of Object.entries(opts.tracks ?? {})) tracks[k] = { currentLevel: v, percent: 0 };

  return {
    progression: {
      activePrograms: (opts.activeTemplateIds ?? []).map((id) =>
        id === undefined ? ({ id: undefined, name: 'bad' } as any) : activeProgram(id),
      ),
      domains: domains as any,
      tracks: tracks as any,
    },
  } as unknown as UserFullProfile;
}

describe('resolveActiveSetPriorityTiers', () => {
  it('a single leaf active program yields one tier of just itself', () => {
    const profile = profileWith({ activeTemplateIds: ['push'] });
    expect(resolveActiveSetPriorityTiers(profile)).toEqual([['push']]);
  });

  it('a single MASTER active program expands to its assessed children, still one tier', () => {
    const profile = profileWith({
      activeTemplateIds: ['full_body'],
      domains: { push: 8, pull: 6 }, // legs/core NOT assessed
    });
    expect(resolveActiveSetPriorityTiers(profile)).toEqual([['push', 'pull']]);
  });

  it('multiple active programs are blended in activePrograms array order (priority)', () => {
    const profile = profileWith({ activeTemplateIds: ['planche', 'front_lever', 'oap'] });
    expect(resolveActiveSetPriorityTiers(profile)).toEqual([['planche'], ['front_lever'], ['oap']]);
  });

  it('a program present only in tracks (not activePrograms) never becomes a tier', () => {
    const profile = profileWith({
      activeTemplateIds: ['push'],
      tracks: { pull: 5 }, // tracked, never activated — must not drive the generator
    });
    expect(resolveActiveSetPriorityTiers(profile)).toEqual([['push']]);
  });

  it('a malformed entry (missing templateId) is skipped, not crashed on', () => {
    const profile = profileWith({ activeTemplateIds: ['push', undefined, 'pull'] });
    expect(resolveActiveSetPriorityTiers(profile)).toEqual([['push'], ['pull']]);
  });

  it('a 4th+ active program does not force a 4th tier (documented scope limit)', () => {
    const profile = profileWith({ activeTemplateIds: ['push', 'pull', 'planche', 'front_lever'] });
    const tiers = resolveActiveSetPriorityTiers(profile);
    expect(tiers.length).toBe(4); // all 4 ARE returned by this helper...
    // ...but resolvePrioritySkillIds (below) only wires the first 3 into P1/P2/P3.
  });

  it('no active programs at all returns no tiers', () => {
    expect(resolveActiveSetPriorityTiers(profileWith({}))).toEqual([]);
  });
});

describe('resolvePrioritySkillIds — general fallback (non-calisthenics_upper)', () => {
  it('single active program: P1 = that program, P2 empty — keeps selectExercisesWithDominance\'s gate closed, identical to today', () => {
    const profile = profileWith({ activeTemplateIds: ['push'] });
    const result = resolvePrioritySkillIds(profile, 'full_body_ab', undefined, '2026-09-30', ['א', 'ג', 'ה']);
    expect(result.priority1SkillIds).toEqual(['push']);
    expect(result.priority2SkillIds).toEqual([]);
    expect(result.priority3SkillIds).toBeUndefined();
  });

  it('two active programs: P1/P2 follow activePrograms array order', () => {
    const profile = profileWith({ activeTemplateIds: ['planche', 'front_lever'] });
    const result = resolvePrioritySkillIds(profile, 'full_body_ab', undefined, '2026-09-30', ['א', 'ג', 'ה']);
    expect(result.priority1SkillIds).toEqual(['planche']);
    expect(result.priority2SkillIds).toEqual(['front_lever']);
    expect(result.priority3SkillIds).toBeUndefined();
  });

  it('three active programs: P1/P2/P3 all populated, in order', () => {
    const profile = profileWith({ activeTemplateIds: ['planche', 'front_lever', 'oap'] });
    const result = resolvePrioritySkillIds(profile, 'full_body_ab', undefined, '2026-09-30', ['א', 'ג', 'ה']);
    expect(result.priority1SkillIds).toEqual(['planche']);
    expect(result.priority2SkillIds).toEqual(['front_lever']);
    expect(result.priority3SkillIds).toEqual(['oap']);
  });

  it('a tracked-but-not-active program never contributes a tier (gating requirement)', () => {
    const profile = profileWith({ activeTemplateIds: ['push'], tracks: { planche: 3 } });
    const result = resolvePrioritySkillIds(profile, 'full_body_ab', undefined, '2026-09-30', ['א', 'ג', 'ה']);
    expect(result.priority1SkillIds).toEqual(['push']);
    expect(result.priority2SkillIds).toEqual([]);
  });

  it('no active programs at all: both empty, matching the old empty-return shape', () => {
    const result = resolvePrioritySkillIds(profileWith({}), 'full_body_ab', undefined, '2026-09-30', ['א', 'ג', 'ה']);
    expect(result).toEqual({ priority1SkillIds: [], priority2SkillIds: [] });
  });
});

describe('resolvePrioritySkillIds — calisthenics_upper path stays fully unchanged', () => {
  it('Dominance Day: scheduleDays >= skillCount still produces the dominant/maintenance split', () => {
    const profile = {
      progression: {
        activePrograms: [activeProgram('calisthenics_upper')],
        skillFocusIds: ['planche', 'front_lever'],
        domains: {},
        tracks: {},
      },
    } as unknown as UserFullProfile;
    // 2 schedule days, 2 skills -> scheduleDays.length (2) >= skillCount (2) triggers
    // Dominance Day specifically (NOT the 3-day/2-skill Pendulum special case).
    // 2026-09-30 (Wed) is scheduleDays[1] here, i.e. dayIndex 1 -> dominant = skillFocusIds[1].
    const result = resolvePrioritySkillIds(profile, 'skill_dominance', undefined, '2026-09-30', ['א', 'ד']);
    expect(result.priority1SkillIds).toEqual(['front_lever']);
    expect(result.priority2SkillIds).toEqual(['planche']);
  });

  // Fix (11.10.2026, domain-balance audit): Math.min(dayIndex, skillCount - 1)
  // clamped to the LAST skill forever once dayIndex reached skillCount - 1,
  // instead of rotating. scheduleDays=4, skillCount=2 is the clamp's own
  // minimal reproduction: dayIndex 2 and 3 both used to resolve to
  // skillFocusIds[1] (clamp), vs. skillFocusIds[0]/[1] alternating (rotation).
  it('Dominance Day rotates through all skills across the week, not just the first skillCount days', () => {
    const profile = {
      progression: {
        activePrograms: [activeProgram('calisthenics_upper')],
        skillFocusIds: ['planche', 'front_lever'],
        domains: {},
        tracks: {},
      },
    } as unknown as UserFullProfile;
    const scheduleDays = ['א', 'ב', 'ג', 'ד']; // 4 days, 2 skills
    // 2026-10-11 = Sunday (א, dayIndex 0), 2026-10-12 = Monday (ב, dayIndex 1),
    // 2026-10-13 = Tuesday (ג, dayIndex 2), 2026-10-14 = Wednesday (ד, dayIndex 3).
    const dominantByDate = (date: string) =>
      resolvePrioritySkillIds(profile, 'skill_dominance', undefined, date, scheduleDays).priority1SkillIds;

    expect(dominantByDate('2026-10-11')).toEqual(['planche']);     // dayIndex 0
    expect(dominantByDate('2026-10-12')).toEqual(['front_lever']); // dayIndex 1
    expect(dominantByDate('2026-10-13')).toEqual(['planche']);     // dayIndex 2 — would be 'front_lever' under the old clamp
    expect(dominantByDate('2026-10-14')).toEqual(['front_lever']); // dayIndex 3 — would be 'front_lever' under the old clamp too
  });
});

describe('resolvePrioritySkillIds — Pendulum split (3 days, 2 skills)', () => {
  const profile = {
    progression: {
      activePrograms: [activeProgram('calisthenics_upper')],
      skillFocusIds: ['planche', 'front_lever'],
      domains: {},
      tracks: {},
    },
  } as unknown as UserFullProfile;
  const scheduleDays = ['א', 'ג', 'ה'];

  it('bootstrap session (lastSessionFocus undefined) is a 50/50 hybrid blend', () => {
    const result = resolvePrioritySkillIds(profile, 'skill_dominance', undefined, '2026-10-11', scheduleDays);
    expect(result.pendulumFocus).toBe('hybrid_blend');
  });

  it('lastSessionFocus "push" alternates to pull_focus', () => {
    const result = resolvePrioritySkillIds(profile, 'skill_dominance', 'push', '2026-10-11', scheduleDays);
    expect(result.pendulumFocus).toBe('pull_focus');
    expect(result.priority1SkillIds).toEqual(['front_lever']);
  });

  it('lastSessionFocus "pull" alternates to push_focus', () => {
    const result = resolvePrioritySkillIds(profile, 'skill_dominance', 'pull', '2026-10-11', scheduleDays);
    expect(result.pendulumFocus).toBe('push_focus');
    expect(result.priority1SkillIds).toEqual(['planche']);
  });

  // Fix (11.10.2026): 'hybrid' was never written by any real caller — treating
  // it as a bootstrap-equivalent (hybrid_blend) rather than a literal restart
  // condition is the documented, intentional fallback, not a special case.
  it('an unrecognized lastSessionFocus value (e.g. a stale "hybrid" literal) falls back to hybrid_blend', () => {
    const result = resolvePrioritySkillIds(profile, 'skill_dominance', 'hybrid', '2026-10-11', scheduleDays);
    expect(result.pendulumFocus).toBe('hybrid_blend');
  });
});
