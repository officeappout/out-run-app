import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Program, ProgramLevelSettings } from '@/features/content/programs/core/program.types';

vi.mock('@/features/content/programs/core/program.service', () => ({
  getAllPrograms: vi.fn(async (): Promise<Program[]> => []),
}));

vi.mock('@/features/content/programs/core/programLevelSettings.service', () => ({
  getProgramLevelSettingsByProgram: vi.fn(async (): Promise<ProgramLevelSettings[]> => []),
}));

import { getAllPrograms } from '@/features/content/programs/core/program.service';
import { getProgramLevelSettingsByProgram } from '@/features/content/programs/core/programLevelSettings.service';
import {
  getProgramPathListFromStorage,
  getProgramPathFromStorage,
  getPathConfigSync,
  loadPathConfigAsync,
  applySkillCollisionSuppression,
  getMuscleFocusFromStorage,
  getSkillFocusFromStorage,
} from '../assessment-path-config.service';

function stubStorage(values: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(values));
  const fakeStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
  };
  vi.stubGlobal('window', {});
  vi.stubGlobal('sessionStorage', fakeStorage);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getProgramPathListFromStorage — back-compat guard', () => {
  it('no window / no stored value → empty list', () => {
    expect(getProgramPathListFromStorage()).toEqual([]);
    stubStorage({});
    expect(getProgramPathListFromStorage()).toEqual([]);
  });

  it('new shape: JSON array, priority = array order', () => {
    stubStorage({ onboarding_program_path: JSON.stringify(['skills', 'body_focus']) });
    expect(getProgramPathListFromStorage()).toEqual(['skills', 'body_focus']);
  });

  it('legacy shape: bare string — the LIVE mini-domain-assessment.ts writer shape — resolves as a one-item list', () => {
    stubStorage({ onboarding_program_path: 'skills' });
    expect(getProgramPathListFromStorage()).toEqual(['skills']);

    stubStorage({ onboarding_program_path: 'body_focus' });
    expect(getProgramPathListFromStorage()).toEqual(['body_focus']);
  });

  it('legacy aliases (beginner/intermediate) still normalize correctly', () => {
    stubStorage({ onboarding_program_path: 'beginner' });
    expect(getProgramPathListFromStorage()).toEqual(['health']);
    stubStorage({ onboarding_program_path: 'intermediate' });
    expect(getProgramPathListFromStorage()).toEqual(['body_focus']);
  });

  it('garbage/unrecognized values are dropped, not thrown', () => {
    stubStorage({ onboarding_program_path: 'nonsense' });
    expect(getProgramPathListFromStorage()).toEqual([]);
    stubStorage({ onboarding_program_path: JSON.stringify(['nonsense', 'skills']) });
    expect(getProgramPathListFromStorage()).toEqual(['skills']);
  });
});

describe('getProgramPathFromStorage — back-compat single-value contract preserved', () => {
  it('returns the primary (first-priority) card for a multi-select', () => {
    stubStorage({ onboarding_program_path: JSON.stringify(['body_focus', 'skills']) });
    expect(getProgramPathFromStorage()).toBe('body_focus');
  });

  it('returns the legacy single value unchanged for a bare-string write', () => {
    stubStorage({ onboarding_program_path: 'skills' });
    expect(getProgramPathFromStorage()).toBe('skills');
  });

  it('returns null when nothing is selected', () => {
    stubStorage({});
    expect(getProgramPathFromStorage()).toBeNull();
  });
});

describe('getPathConfigSync — single-card parity with pre-Phase-1 behavior', () => {
  it('health alone: fixed 4 categories, skipTier, clamp [1,25]', () => {
    stubStorage({ onboarding_program_path: JSON.stringify(['health']) });
    const cfg = getPathConfigSync();
    expect(cfg.path).toBe('health');
    expect(cfg.categories).toEqual(['push', 'pull', 'legs', 'core']);
    expect(cfg.skillIds).toEqual([]);
    expect(cfg.skipTier).toBe(true);
    expect(cfg.clampTierLevel(999)).toBe(25);
    expect(cfg.clampTierLevel(-5)).toBe(1);
  });

  it('body_focus alone: categories derived from muscle chips, unaffected by the union resolver', () => {
    stubStorage({
      onboarding_program_path: JSON.stringify(['body_focus']),
      onboarding_muscle_focus: JSON.stringify(['chest', 'legs']),
    });
    const cfg = getPathConfigSync();
    expect(cfg.categories).toEqual(['push', 'legs']);
    expect(cfg.skillIds).toEqual([]);
  });

  it('skills alone: skill ladders first, D2 auto-adds core at the end', () => {
    stubStorage({
      onboarding_program_path: JSON.stringify(['skills']),
      onboarding_skill_focus: JSON.stringify(['planche']),
    });
    const cfg = getPathConfigSync();
    expect(cfg.skillIds).toEqual(['planche']);
    expect(cfg.categories).toEqual(['planche', 'core']);
    expect(cfg.clampTierLevel(999)).toBe(999); // identity clamp, unchanged from pre-Phase-1
  });

  it('no selection at all: legacy full-assessment fallback, byte-identical to before', () => {
    stubStorage({});
    const cfg = getPathConfigSync();
    expect(cfg.path).toBeNull();
    expect(cfg.categories).toEqual(['push', 'pull', 'legs', 'core']);
    expect(cfg.skipTier).toBe(false);
  });
});

describe('getPathConfigSync — D3 collision suppression (union cases)', () => {
  it('skill + same-domain muscle chip: the direct category slider is suppressed, skill ladder + core remain', () => {
    stubStorage({
      onboarding_program_path: JSON.stringify(['skills', 'body_focus']),
      onboarding_skill_focus: JSON.stringify(['planche']), // push-deriving
      onboarding_muscle_focus: JSON.stringify(['chest']),  // → 'push', same domain
    });
    const cfg = getPathConfigSync();
    expect(cfg.categories).toEqual(['planche', 'core']);
    expect(cfg.categories).not.toContain('push');
  });

  it('skill + different-domain muscle chip: no suppression, both sliders present', () => {
    stubStorage({
      onboarding_program_path: JSON.stringify(['skills', 'body_focus']),
      onboarding_skill_focus: JSON.stringify(['planche']), // push-deriving
      onboarding_muscle_focus: JSON.stringify(['legs']),   // → 'legs', different domain
    });
    const cfg = getPathConfigSync();
    expect(cfg.categories).toEqual(['planche', 'legs', 'core']);
  });

  it('skill + Health: D3 applies uniformly — Health\'s push/pull are suppressed the same as a muscle chip would be', () => {
    stubStorage({
      onboarding_program_path: JSON.stringify(['skills', 'health']),
      onboarding_skill_focus: JSON.stringify(['planche']), // push-deriving only
    });
    const cfg = getPathConfigSync();
    // push suppressed (planche covers it); pull/legs/core survive from Health,
    // core also would have been auto-added by D2 (deduped, not doubled).
    expect(cfg.categories).toEqual(['planche', 'pull', 'legs', 'core']);
    expect(cfg.categories).not.toContain('push');
  });

  it('pull-deriving skill + push muscle chip: no collision (different domains)', () => {
    stubStorage({
      onboarding_program_path: JSON.stringify(['skills', 'body_focus']),
      onboarding_skill_focus: JSON.stringify(['front_lever']), // pull-deriving
      onboarding_muscle_focus: JSON.stringify(['chest']),      // → 'push'
    });
    const cfg = getPathConfigSync();
    expect(cfg.categories).toEqual(['front_lever', 'push', 'core']);
  });

  it('multi-skill selection spanning both domains + core: core added once, not duplicated', () => {
    stubStorage({
      onboarding_program_path: JSON.stringify(['skills']),
      onboarding_skill_focus: JSON.stringify(['planche', 'front_lever']),
    });
    const cfg = getPathConfigSync();
    expect(cfg.categories).toEqual(['planche', 'front_lever', 'core']);
    expect(cfg.categories.filter((c) => c === 'core')).toHaveLength(1);
  });

  it('muscle chip already including core + a skill selection: core still appears once', () => {
    stubStorage({
      onboarding_program_path: JSON.stringify(['skills', 'body_focus']),
      onboarding_skill_focus: JSON.stringify(['planche']),
      onboarding_muscle_focus: JSON.stringify(['core']),
    });
    const cfg = getPathConfigSync();
    expect(cfg.categories).toEqual(['planche', 'core']);
    expect(cfg.categories.filter((c) => c === 'core')).toHaveLength(1);
  });
});

describe('getPathConfigSync — D2 auto-core is skipped during a mini-domain-assessment top-up', () => {
  it('single-skill mini top-up (mini-domain-assessment.ts shape): no auto-core added, stays single-domain', () => {
    stubStorage({
      onboarding_program_path: 'skills', // legacy bare-string writer shape
      onboarding_skill_focus: JSON.stringify(['planche']),
      mini_assessment_active: '1',
    });
    const cfg = getPathConfigSync();
    expect(cfg.categories).toEqual(['planche']);
    expect(cfg.categories).not.toContain('core');
  });

  it('the same selection WITHOUT mini-assessment mode gets the D2 core addition', () => {
    stubStorage({
      onboarding_program_path: 'skills',
      onboarding_skill_focus: JSON.stringify(['planche']),
    });
    const cfg = getPathConfigSync();
    expect(cfg.categories).toEqual(['planche', 'core']);
  });
});

describe('applySkillCollisionSuppression — standalone', () => {
  it('no skills → categories unchanged', () => {
    expect(applySkillCollisionSuppression(['push', 'pull', 'legs', 'core'], [])).toEqual([
      'push', 'pull', 'legs', 'core',
    ]);
  });

  it('skills with no foundation mapping (e.g. calisthenics_upper) suppress nothing', () => {
    expect(
      applySkillCollisionSuppression(['push', 'pull'], ['calisthenics_upper']),
    ).toEqual(['push', 'pull']);
  });

  it('a push-deriving skill removes only push, leaves pull/legs/core intact', () => {
    expect(
      applySkillCollisionSuppression(['push', 'pull', 'legs', 'core'], ['hspu']),
    ).toEqual(['pull', 'legs', 'core']);
  });

  it('both push- and pull-deriving skills together remove both', () => {
    expect(
      applySkillCollisionSuppression(['push', 'pull', 'legs', 'core'], ['handstand', 'muscle_up']),
    ).toEqual(['legs', 'core']);
  });
});

describe('getMuscleFocusFromStorage / getSkillFocusFromStorage — unchanged readers', () => {
  it('parse JSON arrays, filter non-strings, tolerate malformed JSON', () => {
    stubStorage({ onboarding_muscle_focus: JSON.stringify(['chest', 1, 'legs']) });
    expect(getMuscleFocusFromStorage()).toEqual(['chest', 'legs']);

    stubStorage({ onboarding_skill_focus: 'not json' });
    expect(getSkillFocusFromStorage()).toEqual([]);
  });
});

describe('loadPathConfigAsync — unified skillMaxLevels resolution for a mixed union', () => {
  it('resolves a literal category via movementPattern AND a skill ID via program.id from the SAME patternMaxMap pass', async () => {
    vi.mocked(getAllPrograms).mockResolvedValue([
      { id: 'push_master', name: 'Push', isMaster: true },
      { id: 'push_child', name: 'Push Child', isMaster: false, movementPattern: 'push', maxLevels: 25 },
      { id: 'planche', name: 'Planche', isMaster: false, movementPattern: 'push', maxLevels: 20 },
    ] as Program[]);

    stubStorage({
      onboarding_program_path: JSON.stringify(['skills', 'body_focus']),
      onboarding_skill_focus: JSON.stringify(['planche']),
      onboarding_muscle_focus: JSON.stringify(['legs']), // different domain, no suppression
    });

    const cfg = await loadPathConfigAsync();
    expect(cfg.categories).toEqual(['planche', 'legs', 'core']);
    // 'planche' resolved directly by program.id (maxLevels: 20) — the CMS
    // lookup fallback (getProgramLevelSettingsByProgram) is never called.
    expect(cfg.skillMaxLevels?.planche).toBe(20);
    expect(getProgramLevelSettingsByProgram).not.toHaveBeenCalled();
    // 'legs'/'core' have no CMS movementPattern entry here → left out of
    // skillMaxLevels, falling back to config.maxLevel (25) via getMaxLevelForCategory.
    expect(cfg.skillMaxLevels?.legs).toBeUndefined();
  });

  it('a skill ID absent from patternMaxMap falls back to getProgramLevelSettingsByProgram', async () => {
    vi.mocked(getAllPrograms).mockResolvedValue([]);
    const settingsFixture = (levelNumber: number): ProgramLevelSettings => ({
      id: `front_lever_level_${levelNumber}`,
      programId: 'front_lever',
      levelNumber,
      levelDescription: '',
      progressionWeight: 1,
    });
    vi.mocked(getProgramLevelSettingsByProgram).mockResolvedValue(
      [1, 2, 7].map(settingsFixture),
    );

    stubStorage({
      onboarding_program_path: JSON.stringify(['skills']),
      onboarding_skill_focus: JSON.stringify(['front_lever']),
    });

    const cfg = await loadPathConfigAsync();
    expect(getProgramLevelSettingsByProgram).toHaveBeenCalledWith('front_lever');
    expect(cfg.skillMaxLevels?.front_lever).toBe(7);
  });
});
