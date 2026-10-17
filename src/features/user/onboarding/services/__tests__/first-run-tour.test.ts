import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  FIRST_RUN_COACH,
  firstRunTourSeenKey,
  firstRunTourSteps,
  firstRunToursEnabled,
  hasMapDeepLink,
  isMapTourBlocked,
  presentSteps,
  shouldArmPlayerTour,
  shouldShowFirstRunTour,
  tourAfterWelcomeChoice,
  type FirstRunTourId,
} from '../first-run-tour';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

/** Onboarding tutorial slice 2 — first-run coach-mark tours. */

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const TOURS: FirstRunTourId[] = ['home', 'map', 'community', 'player'];
const params = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? o[k] : null) });

describe('gating', () => {
  it('needs BOTH enable_onboarding_tutorial_v1 and enable_home_v2', () => {
    expect(firstRunToursEnabled({ enableOnboardingTutorialV1: true, enableHomeV2: true })).toBe(true);
    expect(firstRunToursEnabled({ enableOnboardingTutorialV1: true, enableHomeV2: false })).toBe(false);
    expect(firstRunToursEnabled({ enableOnboardingTutorialV1: false, enableHomeV2: true })).toBe(false);
    expect(firstRunToursEnabled({})).toBe(false);
  });
  it('the tutorial flag stays off for users, on for super admins (owner review)', () => {
    const def = FLAG_DEFS.find((d) => d.key === 'enableOnboardingTutorialV1');
    expect(def?.defaultValue).toBe(false);
    expect(def?.superAdminValue).toBe(true);
  });
});

describe('seen once per tour per user', () => {
  it('shows until the seen flag exists — done and skip both count as seen', () => {
    expect(shouldShowFirstRunTour({ enabled: true, seenValue: null })).toBe(true);
    expect(shouldShowFirstRunTour({ enabled: true, seenValue: undefined })).toBe(true);
    expect(shouldShowFirstRunTour({ enabled: true, seenValue: 'done' })).toBe(false);
    expect(shouldShowFirstRunTour({ enabled: true, seenValue: 'skip' })).toBe(false);
  });
  it('never shows when disabled or blocked by another surface', () => {
    expect(shouldShowFirstRunTour({ enabled: false, seenValue: null })).toBe(false);
    expect(shouldShowFirstRunTour({ enabled: true, seenValue: null, blocked: true })).toBe(false);
  });
  it('keys are distinct per tour and per user', () => {
    const keys = new Set(TOURS.map((t) => firstRunTourSeenKey(t, 'u1')));
    expect(keys.size).toBe(TOURS.length);
    expect(firstRunTourSeenKey('map', 'u1')).not.toBe(firstRunTourSeenKey('map', 'u2'));
    expect(firstRunTourSeenKey('map', null)).toBe('first_run_tour_seen:map:anon');
  });
  it('FirstRunTour persists via onboardingPrefs and records skip as seen', () => {
    const c = src('../../components/FirstRunTour.tsx');
    expect(c).toContain("import { getOnboardingPrefAsync, setOnboardingPref } from '@/lib/onboardingPrefs';");
    expect(c).toContain('getOnboardingPrefAsync(firstRunTourSeenKey(tour, uid))');
    expect(c).toContain('setOnboardingPref(firstRunTourSeenKey(tour, uid), reason)');
    // "empty" (nothing to point at) must NOT write the flag — a later visit can still show it.
    const empty = c.slice(c.indexOf('shown.length === 0'), c.indexOf('setSteps(shown)'));
    expect(empty).not.toContain('setOnboardingPref');
  });
});

describe('tour selection', () => {
  it('only "סתם להסתכל" opens a tour on the spot (home)', () => {
    expect(tourAfterWelcomeChoice('browse')).toBe('home');
    expect(tourAfterWelcomeChoice('strength')).toBeNull();
    expect(tourAfterWelcomeChoice('nearby')).toBeNull();
    expect(tourAfterWelcomeChoice('skip-to-map')).toBeNull();
  });
  it('every tour has 1–3 steps, no emoji, real copy', () => {
    for (const t of TOURS) {
      for (const gender of ['male', 'female', 'other', null] as const) {
        const steps = firstRunTourSteps(t, gender);
        expect(steps.length).toBeGreaterThan(0);
        expect(steps.length).toBeLessThanOrEqual(3);
        for (const s of steps) {
          expect(s.text.length).toBeGreaterThan(3);
          expect(new RegExp('\\p{Extended_Pictographic}', 'u').test(s.text)).toBe(false);
        }
      }
    }
  });
  it('uses the specified copy and targets', () => {
    expect(firstRunTourSteps('home', 'male').map((s) => s.target)).toEqual([
      FIRST_RUN_COACH.homeWorkout, FIRST_RUN_COACH.homePlus, FIRST_RUN_COACH.homeWeek,
    ]);
    expect(firstRunTourSteps('home', 'male')[0].text).toBe('כאן האימון של היום — לחיצה ומתחילים');
    expect(firstRunTourSteps('map', 'male')[0].text).toBe('חיפוש פארק או כתובת');
    expect(firstRunTourSteps('community', 'male')[0].text).toBe('כאן הליגה של השכונה והעיר שלך');
  });
  it('copy is gendered (no slash forms)', () => {
    const m = firstRunTourSteps('map', 'male')[1].text;
    const f = firstRunTourSteps('map', 'female')[1].text;
    const o = firstRunTourSteps('map', 'other')[1].text;
    expect(new Set([m, f, o]).size).toBe(3);
    for (const t of TOURS) for (const s of firstRunTourSteps(t, 'other')) expect(s.text).not.toMatch(/\/ה|את\/ה/);
  });
  it('drops steps whose target is missing, except centered ones', () => {
    const steps = firstRunTourSteps('map', 'male');
    const kept = presentSteps(steps, (t) => t === FIRST_RUN_COACH.mapSearch);
    expect(kept.map((s) => s.target)).toEqual([FIRST_RUN_COACH.mapSearch, FIRST_RUN_COACH.mapPark]);
    expect(presentSteps(firstRunTourSteps('home', 'male'), () => false)).toEqual([]);
  });
});

describe('map tour guards', () => {
  it('deep links (which open a drawer / flow) defer the tour', () => {
    expect(hasMapDeepLink(params({}))).toBe(false);
    expect(hasMapDeepLink(null)).toBe(false);
    expect(hasMapDeepLink(params({ openRun: 'walking' }))).toBe(true);
    expect(hasMapDeepLink(params({ openHybridSlots: '1' }))).toBe(true);
    expect(hasMapDeepLink(params({ openDiscover: '1' }))).toBe(true);
    expect(hasMapDeepLink(params({ openPark: 'p1' }))).toBe(true);
    expect(hasMapDeepLink(params({ targetSteps: '8000' }))).toBe(true);
  });
  it('blocked during a workout, on a deep-linked arrival, or with any surface open', () => {
    const calm = { workoutActive: false, openedByDeepLink: false, surfaceOpen: false };
    expect(isMapTourBlocked(calm)).toBe(false);
    expect(isMapTourBlocked({ ...calm, workoutActive: true })).toBe(true);
    expect(isMapTourBlocked({ ...calm, openedByDeepLink: true })).toBe(true);
    expect(isMapTourBlocked({ ...calm, surfaceOpen: true })).toBe(true);
  });
});

describe('player tour — before the first set only', () => {
  const base = {
    eligible: true, workoutState: 'PREPARING', segmentIndex: 0, exerciseIndex: 0,
    resumed: false, guidedGates: false,
  };
  it('arms on the first set while still PREPARING', () => {
    expect(shouldArmPlayerTour(base)).toBe(true);
  });
  it('never mid-exercise / later sets / resumed / hybrid station / ineligible', () => {
    expect(shouldArmPlayerTour({ ...base, workoutState: 'ACTIVE' })).toBe(false);
    expect(shouldArmPlayerTour({ ...base, workoutState: 'RESTING' })).toBe(false);
    expect(shouldArmPlayerTour({ ...base, exerciseIndex: 1 })).toBe(false);
    expect(shouldArmPlayerTour({ ...base, segmentIndex: 1 })).toBe(false);
    expect(shouldArmPlayerTour({ ...base, resumed: true })).toBe(false);
    expect(shouldArmPlayerTour({ ...base, guidedGates: true })).toBe(false);
    expect(shouldArmPlayerTour({ ...base, eligible: false })).toBe(false);
  });
});
