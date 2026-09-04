/**
 * Extracted verbatim from src/app/admin/workout-simulator/page.tsx (buildMockProfile,
 * ActiveProgramItem, DOMAIN_PROGRAM_IDS) so it can be reused from a headless Node/tsx
 * script (scripts/audit/build-snapshot.ts) without importing a 'use client' page.
 * Zero behavior change — the simulator page now imports this instead of defining it
 * locally. Do not diverge the two call sites; if the simulator's mock-profile logic
 * changes, change it here.
 */
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { LifestylePersona } from '@/features/workout-engine/logic/ContextualEngine';
import type { InjuryShieldArea } from '@/features/content/exercises/core/exercise.types';

export interface ActiveProgramItem {
  id: string;
  name: string;
  level: number;
}

// Domain slug → tracks key mapping (engine resolves by slug)
export const DOMAIN_PROGRAM_IDS: Record<string, string> = {
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

  // Cold Start: L1 everywhere, no persona, no gear
  const effectiveLevel   = coldStart ? 1 : level;
  const effectivePersona = coldStart ? '' : persona;
  const effectiveGear    = coldStart ? [] : (gear ?? ['pullup_bar', 'dip_bar', 'parallel_bars']);

  // ── Build tracks ──
  // 1. Domain fallback tracks (dual-keyed by slug and domain name)
  const domainTracks: Record<string, any> = {};
  if (!coldStart && domainLevels) {
    for (const [domain, lvl] of Object.entries(domainLevels)) {
      const slug = DOMAIN_PROGRAM_IDS[domain] ?? domain;
      // Field names match the real DomainTrackProgress type (progression.types.ts:71-73)
      // — currentLevel/percent, NOT level/progressPercent. The mismatch here (before
      // this fix) meant home-workout.service.ts:2289's `track.percent` was always
      // undefined, so context.levelProgressPercent was always 0 — every match-tier
      // exercise in every simulator/snapshot run got the <50%-progress staircase
      // range regardless of the level being simulated. See docs/workout-engine/
      // 03-CHANGES.md for the trace that found this.
      const entry = { currentLevel: lvl, percent: 50, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      domainTracks[slug] = entry;
      domainTracks[domain] = entry;
    }
  }

  // 2. Active programs from the Program Builder (take precedence, keyed by program ID)
  const programTracks: Record<string, any> = {};
  const activeProgramEntries = coldStart ? [] : activePrograms;
  for (const prog of activeProgramEntries) {
    programTracks[prog.id] = { currentLevel: prog.level, percent: 50, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  }

  // Fall back to full_body if no specific programs
  const fallbackId = 'full_body';
  const primaryId = activeProgramEntries[0]?.id ?? fallbackId;

  const pullLevel = coldStart ? 1 : (domainLevels?.pull ?? effectiveLevel);
  const pushLevel = coldStart ? 1 : (domainLevels?.push ?? Math.max(1, effectiveLevel - 3));
  const legsLevel = coldStart ? 1 : (domainLevels?.legs ?? Math.max(1, effectiveLevel - 5));
  const coreLevel = coldStart ? 1 : (domainLevels?.core ?? Math.max(1, effectiveLevel - 7));

  return {
    id: 'simulator_user',
    core: {
      name: 'Simulator',
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
        core:       { currentLevel: coreLevel, maxLevel: 25, isUnlocked: true },
        full_body:  { currentLevel: effectiveLevel, maxLevel: 25, isUnlocked: true },
      },
      activePrograms: activeProgramEntries.length > 0
        ? activeProgramEntries.map(p => ({
            id: p.id, templateId: p.id, name: p.name,
            startDate: new Date(), durationWeeks: 52, currentWeek: 4, focusDomains: [],
          }))
        : [{ id: primaryId, templateId: primaryId, name: primaryId, startDate: new Date(), durationWeeks: 52, currentWeek: 4, focusDomains: [] }],
      unlockedBonusExercises: [],
      tracks: {
        [primaryId]: { currentLevel: effectiveLevel, percent: 50, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
        ...domainTracks,
        ...programTracks,   // Program Builder tracks override domain tracks
      },
    },
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
    running: {} as any,
  };
}
