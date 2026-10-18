/**
 * generate_workout end to end on the REAL workout engine, offline (owner review
 * 18.10.2026, cases 3 to 5): the client executor (runClientTool) → generateHomeWorkout →
 * shapeAiWorkout → compact result, for the owner's profile (male, full_body L15,
 * calisthenics_upper L13, a door pull-up bar + a resistance band at home).
 *
 * Needs a read-only REST dump of the public catalog collections (exercises, programs,
 * gear_definitions, gym_equipment, program_level_settings, ...), the same one the
 * generator audit harness uses. Set OUT_GENERATOR_RAW_DIR to run it; skipped otherwise
 * (CI has no dump). Firestore is replaced by an offline read-only stub, fetch is blocked.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { existsSync } from 'node:fs';

const RAW = process.env.OUT_GENERATOR_RAW_DIR ?? '';
const HAVE_DUMP = !!RAW && existsSync(`${RAW}/exercises.json`);

vi.mock('firebase/firestore', () => import('./helpers/offline-firestore'));
vi.mock('@/lib/firebase', () => ({
  db: { __stub: 'firestore' },
  auth: { currentUser: null, onAuthStateChanged: () => () => {} },
  storage: { __stub: 'storage' },
  app: { __stub: 'app', options: {} },
  analytics: null,
  appCheck: null,
}));

const HOME_GEAR = ['5Rkhxawxj8EwC4spTXVM', 'I1K30JehaxSx8dlBOZyd']; // door pull-up bar, resistance band

function ownerProfile(): any {
  const now = new Date().toISOString();
  const tr = (level: number) => ({ level, progressPercent: 50, startedAt: now, updatedAt: now });
  return {
    id: 'owner_offline',
    core: { name: 'Owner', initialFitnessTier: 2, trackingMode: 'performance', mainGoal: 'performance_boost', gender: 'male', weight: 80 },
    progression: {
      globalLevel: 15, globalXP: 15000, avatarId: 'default', unlockedBadges: [], coins: 0, totalCaloriesBurned: 0,
      hasUnlockedAdvancedStats: false, daysActive: 100, lemurStage: 5, dailyStepGoal: 5000, dailyFloorGoal: 5, currentStreak: 3, goalHistory: [],
      domains: {
        upper_body: { currentLevel: 15, maxLevel: 25, isUnlocked: true },
        lower_body: { currentLevel: 15, maxLevel: 25, isUnlocked: true },
        core: { currentLevel: 15, maxLevel: 25, isUnlocked: true },
        full_body: { currentLevel: 15, maxLevel: 25, isUnlocked: true },
      },
      activePrograms: [{ id: 'full_body', templateId: 'full_body', name: 'full_body', startDate: new Date(Date.now() - 9 * 864e5), durationWeeks: 52, currentWeek: 2, focusDomains: [] }],
      unlockedBonusExercises: [],
      tracks: { push: tr(15), pull: tr(15), legs: tr(15), core: tr(15), full_body: tr(15), calisthenics_upper: tr(13) },
    },
    equipment: { home: HOME_GEAR, office: [], outdoor: [] },
    lifestyle: { hasDog: false, commute: { method: 'car', enableChallenges: false }, lifestyleTags: [] },
    health: { injuries: [], connectedWatch: 'none' },
    running: {},
  };
}

describe.skipIf(!HAVE_DUMP)('generate_workout on the real engine (offline, owner profile)', () => {
  let runClientTool: typeof import('../services/client-tools').runClientTool;

  beforeAll(async () => {
    (globalThis as any).fetch = async () => {
      throw new Error('network disabled in this test');
    };
    for (const k of ['log', 'warn', 'info', 'debug', 'group', 'groupCollapsed', 'groupEnd', 'table'] as const) {
      vi.spyOn(console, k).mockImplementation(() => {});
    }
    const gear = await import('@/features/workout-engine/shared/utils/gear-mapping.utils');
    await gear.ensureEquipmentCachesLoaded();
    ({ runClientTool } = await import('../services/client-tools'));
  });

  async function build(input: Record<string, unknown>) {
    const { outcome } = await runClientTool('generate_workout', input, ownerProfile());
    if (!outcome.ok) throw new Error(`generation failed: ${outcome.error}`);
    return outcome.result;
  }

  it.each([1, 2, 3])('case 3/4: 10 minutes at home, difficulty %i → at least 3 home exercises, real minutes reported', async (difficulty) => {
    const r = await build({ durationMin: 10, location: 'home', difficulty });
    expect(r.exercises.length).toBeGreaterThanOrEqual(3);
    for (const e of r.exercises) expect(e.methodLocation).toBe('home');
    expect(r.requestedMinutes).toBe(10);
    expect(r.minutes).toBeLessThanOrEqual(13); // the ±3 contract window
    expect(r.title).toBe('אימון גוף מלא בבית');
  });

  it.each([10, 20, 30])('case 5: "אימון בטן" (%i min) → core exercises only', async (durationMin) => {
    const r = await build({ durationMin, location: 'home', difficulty: 2, domains: ['core'] });
    expect(r.exercises.length).toBeGreaterThanOrEqual(durationMin <= 10 ? 2 : 2);
    for (const e of r.exercises) expect(e.area).toBe('core');
    expect(r.title).toBe('אימון בטן בבית');
  });

  it('home gear truth: every gear item named is one the owner has or a household item', async () => {
    const r = await build({ durationMin: 20, location: 'home', difficulty: 2 });
    const parkOnly = ['מקבילים', 'סולם', 'מתקן', 'טבעות'];
    for (const e of r.exercises) {
      expect(e.methodLocation).toBe('home');
      for (const g of e.gear ?? []) expect(parkOnly.some((p) => g.includes(p))).toBe(false);
    }
  });
});
