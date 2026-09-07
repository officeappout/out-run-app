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
  // Domain fallback tracks (dual-keyed by slug and domain name), ONLY for
  // domains the caller actually specified. Field names match the real
  // DomainTrackProgress type (progression.types.ts:71-73) — currentLevel/
  // percent, NOT level/progressPercent.
  const domainTracks: Record<string, any> = {};
  if (!coldStart && domainLevels) {
    for (const [domain, lvl] of Object.entries(domainLevels)) {
      const slug = DOMAIN_PROGRAM_IDS[domain] ?? domain;
      const entry = { currentLevel: lvl, percent: 50, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      domainTracks[slug] = entry;
      domainTracks[domain] = entry;
    }
  }

  // Active programs from the Program Builder (take precedence, keyed by program ID)
  const programTracks: Record<string, any> = {};
  const activeProgramEntries = coldStart ? [] : activePrograms;
  for (const prog of activeProgramEntries) {
    programTracks[prog.id] = { currentLevel: prog.level, percent: 50, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  }

  // absent=absent (⑨), 07.09.2026 (David's fix — 03-CHANGES.md Addendum 26/29):
  // this function used to fabricate a level for every domain the caller
  // DIDN'T specify — Math.max(1, effectiveLevel - N) per domain — instead of
  // leaving it genuinely absent like an unassessed domain on a real Firestore
  // profile. `core`'s version of this fabrication was the exact artifact that
  // produced the 223s rest-outlier investigated in Addendum 26: a "push+pull
  // only" test profile silently carried a fake core:L1 registration, so the
  // engine correctly (from ITS perspective) treated core as assessed and
  // real. The same pattern existed for push/pull/legs too — fixed uniformly,
  // not just for core, since leaving the other three would just relocate the
  // same bug class. A domain now ends up in `domains`/`tracks` ONLY when
  // `domainLevels` explicitly names it — no formula-derived default.
  const domains: Record<string, any> = {
    // `full_body` is the one exception: `level` is a required, always-explicit
    // parameter (not a derived guess like the old push/pull/legs/core
    // formulas were), so mirroring it here is a passthrough of real input,
    // not a fabrication — same treatment as `progression.globalLevel` below.
    full_body: { currentLevel: effectiveLevel, maxLevel: 25, isUnlocked: true },
  };
  if (!coldStart && domainLevels) {
    if (domainLevels.push != null || domainLevels.pull != null) {
      domains.upper_body = {
        currentLevel: Math.max(domainLevels.push ?? 0, domainLevels.pull ?? 0),
        maxLevel: 25,
        isUnlocked: true,
      };
    }
    if (domainLevels.legs != null) {
      domains.lower_body = { currentLevel: domainLevels.legs, maxLevel: 25, isUnlocked: true };
    }
    if (domainLevels.core != null) {
      domains.core = { currentLevel: domainLevels.core, maxLevel: 25, isUnlocked: true };
    }
  }

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
      domains,
      // absent=absent (⑨): no `activePrograms.length === 0 → synthetic
      // full_body entry` fallback. That fallback was the ONE case that
      // happened to expand correctly (resolveChildDomainsForParent special-
      // cases 'full_body' to its assessed children) — which meant every test
      // profile built this way masked the activePrograms[0]-only read bug
      // (03-CHANGES.md Addendum 26-28 / docs/workout-engine/10) for the
      // entire session, instead of exercising the real push_pull_legs-split
      // shape a genuinely affected production user has. A real user with no
      // chosen program has activePrograms: [] — that's what this now returns.
      activePrograms: activeProgramEntries.map(p => ({
        id: p.id, templateId: p.id, name: p.name,
        startDate: new Date(), durationWeeks: 52, currentWeek: 4, focusDomains: [],
      })),
      unlockedBonusExercises: [],
      tracks: {
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
