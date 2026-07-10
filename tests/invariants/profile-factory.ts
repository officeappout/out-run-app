/**
 * profile-factory.ts — builds mock UserFullProfiles for the invariants matrix.
 * Ported verbatim from src/app/admin/workout-simulator/page.tsx buildMockProfile()
 * so the gate exercises the SAME profile shape the QA simulator uses. Keep in sync.
 */
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { LifestylePersona } from '@/features/workout-engine/logic/ContextualEngine';
import type { InjuryShieldArea } from '@/features/content/exercises/core/exercise.types';

export interface ActiveProgramItem {
  id: string;
  name: string;
  level: number;
}

// Domain slug → tracks key mapping (engine resolves by slug). From the simulator.
const DOMAIN_PROGRAM_IDS: Record<string, string> = {
  pull: 'pulling',
  push: 'pushing',
  legs: 'legs',
  core: 'core',
};

export function buildMockProfile(params: {
  level: number;
  persona: LifestylePersona | '';
  injuries: InjuryShieldArea[];
  domainLevels?: Record<string, number>;
  coldStart?: boolean;
  gear?: string[];
  activePrograms?: ActiveProgramItem[];
}): UserFullProfile {
  const { level, persona, injuries, domainLevels, coldStart, gear, activePrograms = [] } = params;

  const effectiveLevel = coldStart ? 1 : level;
  const effectivePersona = coldStart ? '' : persona;
  const effectiveGear = coldStart ? [] : (gear ?? ['pullup_bar', 'dip_bar', 'parallel_bars']);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const domainTracks: Record<string, any> = {};
  if (!coldStart && domainLevels) {
    for (const [domain, lvl] of Object.entries(domainLevels)) {
      const slug = DOMAIN_PROGRAM_IDS[domain] ?? domain;
      const entry = { level: lvl, progressPercent: 50, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      domainTracks[slug] = entry;
      domainTracks[domain] = entry;
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const programTracks: Record<string, any> = {};
  const activeProgramEntries = coldStart ? [] : activePrograms;
  for (const prog of activeProgramEntries) {
    programTracks[prog.id] = { level: prog.level, progressPercent: 50, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  }

  const fallbackId = 'full_body';
  const primaryId = activeProgramEntries[0]?.id ?? fallbackId;

  const pullLevel = coldStart ? 1 : (domainLevels?.pull ?? effectiveLevel);
  const pushLevel = coldStart ? 1 : (domainLevels?.push ?? Math.max(1, effectiveLevel - 3));
  const legsLevel = coldStart ? 1 : (domainLevels?.legs ?? Math.max(1, effectiveLevel - 5));
  const coreLevel = coldStart ? 1 : (domainLevels?.core ?? Math.max(1, effectiveLevel - 7));

  return {
    id: 'invariants_user',
    core: {
      name: 'Invariants',
      initialFitnessTier: effectiveLevel > 15 ? 3 : effectiveLevel > 8 ? 2 : 1,
      trackingMode: 'performance',
      mainGoal: 'performance_boost',
      gender: 'male',
      weight: 75,
    },
    progression: {
      globalLevel: effectiveLevel,
      globalXP: effectiveLevel * 1000,
      avatarId: 'default',
      unlockedBadges: [],
      coins: 0,
      totalCaloriesBurned: 0,
      hasUnlockedAdvancedStats: false,
      daysActive: 100,
      lemurStage: 5,
      dailyStepGoal: 5000,
      dailyFloorGoal: 5,
      currentStreak: 10,
      goalHistory: [],
      domains: {
        upper_body: { currentLevel: Math.max(pullLevel, pushLevel), maxLevel: 25, isUnlocked: true },
        lower_body: { currentLevel: legsLevel, maxLevel: 25, isUnlocked: true },
        core: { currentLevel: coreLevel, maxLevel: 25, isUnlocked: true },
        full_body: { currentLevel: effectiveLevel, maxLevel: 25, isUnlocked: true },
      },
      activePrograms: activeProgramEntries.length > 0
        ? activeProgramEntries.map(p => ({
            id: p.id, templateId: p.id, name: p.name,
            startDate: new Date(), durationWeeks: 52, currentWeek: 4, focusDomains: [],
          }))
        : [{ id: primaryId, templateId: primaryId, name: primaryId, startDate: new Date(), durationWeeks: 52, currentWeek: 4, focusDomains: [] }],
      unlockedBonusExercises: [],
      tracks: {
        [primaryId]: { level: effectiveLevel, progressPercent: 50, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ...domainTracks,
        ...programTracks,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
    equipment: {
      home: effectiveGear,
      office: [],
      outdoor: effectiveGear,
    },
    lifestyle: {
      hasDog: false,
      commute: { method: 'car', enableChallenges: false },
      lifestyleTags: effectivePersona ? [effectivePersona] : [],
    },
    health: {
      injuries: injuries as string[],
      connectedWatch: 'none',
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    running: {} as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}
