import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Program } from '@/features/content/programs/core/program.types';

vi.mock('@/features/content/programs/core/program.service', () => ({
  getAllPrograms: vi.fn(async (): Promise<Program[]> => []),
}));

vi.mock('@/features/content/programs/core/programLevelSettings.service', () => ({
  getProgramLevelSettingsByProgram: vi.fn(async () => []),
}));

import { getAllPrograms } from '@/features/content/programs/core/program.service';
import {
  loadPathConfigAsync,
  getMaxLevelForCategory,
  getFollowUpMaxLevel,
  getPathConfigSync,
} from '../../services/assessment-path-config.service';
import {
  ASSESSMENT_MAX_LEVEL_DEFAULTS,
  findProgramForAssessmentKey,
  getEffectiveAssessmentMax,
  getFoundationAssessmentMax,
} from '../assessment-level-caps';
import { HIDDEN_PROGRAM_SLUGS, isHiddenProgram } from '@/lib/hidden-programs';
import { SKILL_PROGRAMS } from '../../constants/program-path.constants';
import { V2_HIDDEN_SKILLS, V2_SKILL_GROUPS } from '../skill-selection';

// Live `programs` docs (training-audit dump, 2026-10), in the
// getAllPrograms() order (by name) — skill programs share movementPattern
// push/pull with the real push/pull domains.
const PROGRAMS: Program[] = [
  { id: 'EtY8YCol0qpF6DzgcTx1', slug: 'human_flag', name: 'דגל אנושי', isMaster: false, movementPattern: 'push', maxLevels: 10 },
  { id: 'J0fLpmJhG0KDN2tQouxh', slug: 'push', name: 'דחיפה', isMaster: false, movementPattern: 'push', maxLevels: 25 },
  { id: 'kDMpobbKsuVTByTIKUpe', slug: 'core', name: 'ליבה', isMaster: false, movementPattern: 'core', maxLevels: 20 },
  { id: 'UPDBtTdCvX748dtBlWYj', slug: 'pull', name: 'משיכה', isMaster: false, movementPattern: 'pull', maxLevels: 25 },
  { id: 'cC0BOmm6KIqYAyQynEIo', slug: 'one_arm_pullup', name: 'מתח יד אחת', isMaster: false, movementPattern: 'pull', maxLevels: 15 },
  { id: 'IOfBZFeorTTDkcz3tOA6', slug: 'handstand', name: 'עמידת ידיים', isMaster: false, movementPattern: 'push', maxLevels: 15 },
  { id: 'fTLWzjP9gH2VNpamyCZF', slug: 'muscle_up', name: 'עליית כוח', isMaster: false, movementPattern: 'pull', maxLevels: 10 },
  { id: 'mFcuYlNgKXLqWVUFo0zt', slug: 'front_lever', name: 'פרונט לבר', isMaster: false, movementPattern: 'pull', maxLevels: 15 },
  { id: 'pCI5NHXpowu2ySucqDn8', slug: 'planche', name: 'פלאנץ׳', isMaster: false, movementPattern: 'push', maxLevels: 15 },
  { id: 'OrAmOH3F375dVio5yGdU', slug: 'legs', name: 'רגליים', isMaster: false, movementPattern: 'legs', maxLevels: 15 },
  { id: 'PAxprHuT7HjqrWU4wl0T', slug: 'handstand_pushup', name: 'שכיבות סמיכה בעמידת ידיים', isMaster: false, movementPattern: 'push', maxLevels: 15 },
];

// visual_assessment_content levels with showInOnboarding=true (the simple
// slider's stops), same dump.
const ONBOARDING_STOPS: Record<string, number[]> = {
  push: [1, 4, 6, 9, 12, 14, 16, 18, 19, 20],
  pull: [1, 4, 6, 10, 14, 17, 19, 20],
  legs: [1, 3, 6, 8, 10, 12],
  core: [1, 3, 5, 7, 8, 10, 11, 14],
  planche: [1, 3, 5, 7, 10, 12, 13, 14, 15],
  front_lever: [1, 3, 5, 7, 9, 11, 13],
  one_arm_pullup: [1, 4, 6, 7, 8, 10, 11, 13],
};

/** VisualSlider simple mode: stops filtered to [minLevel, maxLevel]. */
const topStop = (cat: string, max: number) =>
  Math.max(...ONBOARDING_STOPS[cat].filter((l) => l >= 1 && l <= max));

function stubStorage(values: Record<string, string>) {
  const store = new Map<string, string>(Object.entries(values));
  vi.stubGlobal('window', {});
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAllPrograms).mockResolvedValue(PROGRAMS);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('questionnaire caps — slider max per category (live programs data)', () => {
  it('health card: push 19 / pull 20 / legs 10 / core 13, and the top slider stop matches', async () => {
    stubStorage({ onboarding_program_path: JSON.stringify(['health']) });
    const cfg = await loadPathConfigAsync();
    const max = Object.fromEntries(cfg.categories.map((c) => [c, getMaxLevelForCategory(cfg, c)]));
    expect(max).toEqual({ push: 19, pull: 20, legs: 10, core: 13 });

    expect(topStop('push', max.push)).toBe(19);
    expect(topStop('pull', max.pull)).toBe(20);
    expect(topStop('legs', max.legs)).toBe(10);
    expect(topStop('core', max.core)).toBe(11);
  });

  it('skills card: planche 10 / front_lever 13 / one_arm_pullup 10 (matched by slug, not hash id)', async () => {
    stubStorage({
      onboarding_program_path: JSON.stringify(['skills']),
      onboarding_skill_focus: JSON.stringify(['planche', 'front_lever', 'one_arm_pullup']),
    });
    const cfg = await loadPathConfigAsync();
    expect(getMaxLevelForCategory(cfg, 'planche')).toBe(10);
    expect(getMaxLevelForCategory(cfg, 'front_lever')).toBe(13);
    expect(getMaxLevelForCategory(cfg, 'one_arm_pullup')).toBe(10);
    expect(getMaxLevelForCategory(cfg, 'core')).toBe(13);
    expect(topStop('planche', 10)).toBe(10);
    expect(topStop('front_lever', 13)).toBe(13);
    expect(topStop('one_arm_pullup', 10)).toBe(10);
  });

  it('a skill without a code cap keeps its own maxLevels (hspu → handstand_pushup slug alias)', async () => {
    stubStorage({
      onboarding_program_path: JSON.stringify(['skills']),
      onboarding_skill_focus: JSON.stringify(['hspu']),
    });
    const cfg = await loadPathConfigAsync();
    expect(getMaxLevelForCategory(cfg, 'hspu')).toBe(15);
  });

  it('sync config (CMS not loaded yet / failed) and follow-up sliders still honour the code caps', () => {
    stubStorage({ onboarding_program_path: JSON.stringify(['health']) });
    const sync = getPathConfigSync();
    expect(getMaxLevelForCategory(sync, 'push')).toBe(19);
    expect(getMaxLevelForCategory(sync, 'legs')).toBe(10);
    expect(getFollowUpMaxLevel(null, 'pull')).toBe(20);
    expect(getFollowUpMaxLevel(sync, 'core')).toBe(13);
  });
});

describe('B1 — skill programs no longer overwrite the push/pull max', () => {
  it('push/pull resolve to their own domain docs whatever the program order', () => {
    for (const order of [PROGRAMS, [...PROGRAMS].reverse()]) {
      expect(findProgramForAssessmentKey(order, 'push')?.slug).toBe('push');
      expect(findProgramForAssessmentKey(order, 'pull')?.slug).toBe('pull');
    }
  });

  it('a Firestore assessmentMaxLevel overrides the code default, still bounded by maxLevels', () => {
    const push = PROGRAMS.find((p) => p.slug === 'push')!;
    expect(getEffectiveAssessmentMax(push, 'push')).toBe(19);
    expect(getEffectiveAssessmentMax({ ...push, assessmentMaxLevel: 22 }, 'push')).toBe(22);
    expect(getEffectiveAssessmentMax({ ...push, assessmentMaxLevel: 30 }, 'push')).toBe(25);
    expect(getEffectiveAssessmentMax({ ...push, assessmentMaxLevel: null }, 'push')).toBe(19);
  });

  it('a program whose maxLevels is below the cap keeps maxLevels', () => {
    expect(getEffectiveAssessmentMax({ id: 'x', slug: 'legs', name: 'L', isMaster: false, maxLevels: 8 }, 'legs')).toBe(8);
  });

  it('slug-less legacy domain docs still resolve by movementPattern, skills excluded', () => {
    const legacy: Program[] = [
      { id: 'planche', name: 'Planche', isMaster: false, movementPattern: 'push', maxLevels: 15 },
      { id: 'push_child', name: 'Push', isMaster: false, movementPattern: 'push', maxLevels: 25 },
    ];
    expect(findProgramForAssessmentKey(legacy, 'push')?.id).toBe('push_child');
  });
});

describe('skill → foundation (+9) cap', () => {
  it('push 19 / pull 20 from live data and from code defaults alone', () => {
    expect(getFoundationAssessmentMax(PROGRAMS, 'push')).toBe(19);
    expect(getFoundationAssessmentMax(PROGRAMS, 'pull')).toBe(20);
    expect(getFoundationAssessmentMax(null, 'push')).toBe(ASSESSMENT_MAX_LEVEL_DEFAULTS.push);
    expect(getFoundationAssessmentMax(null, 'pull')).toBe(ASSESSMENT_MAX_LEVEL_DEFAULTS.pull);
    // planche L13 + 9 = 22 → 19; front_lever L13 + 9 = 22 → 20
    expect(Math.min(13 + 9, getFoundationAssessmentMax(PROGRAMS, 'push'))).toBe(19);
    expect(Math.min(13 + 9, getFoundationAssessmentMax(PROGRAMS, 'pull'))).toBe(20);
  });
});

describe('hidden skills — muscle_up / handstand / human_flag', () => {
  it('shared set + resolver accept slugs and raw doc ids', () => {
    expect(Array.from(HIDDEN_PROGRAM_SLUGS).sort()).toEqual(['handstand', 'human_flag', 'muscle_up']);
    expect(isHiddenProgram('muscle_up')).toBe(true);
    expect(isHiddenProgram('fTLWzjP9gH2VNpamyCZF')).toBe(true);
    expect(isHiddenProgram('IOfBZFeorTTDkcz3tOA6')).toBe(true);
    expect(isHiddenProgram('EtY8YCol0qpF6DzgcTx1')).toBe(true);
    expect(isHiddenProgram('planche')).toBe(false);
    expect(isHiddenProgram('one_arm_pullup')).toBe(false);
    expect(isHiddenProgram(undefined)).toBe(false);
  });

  it('neither onboarding skill picker offers them', () => {
    const legacyIds = SKILL_PROGRAMS.map((s) => s.id);
    expect(legacyIds).not.toContain('muscle_up');
    expect(legacyIds).not.toContain('handstand');
    expect(legacyIds).not.toContain('human_flag');
    expect(legacyIds).toEqual(['calisthenics_upper', 'front_lever', 'planche', 'hspu', 'one_arm_pullup']);

    const v2Ids = V2_SKILL_GROUPS.flatMap((g) => g.items.map((i) => i.id));
    expect(v2Ids.some((id) => isHiddenProgram(id))).toBe(false);
    expect(V2_HIDDEN_SKILLS).toBe(HIDDEN_PROGRAM_SLUGS);
  });
});
