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
  isNewUserForTours,
  toCreationMs,
  FIRST_RUN_NEW_USER_DAYS,
  presentSteps,
  shouldArmHomeTour,
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
  it('drops steps whose target is missing — the map "פארקים" step no longer floats centered', () => {
    const steps = firstRunTourSteps('map', 'male');
    const kept = presentSteps(steps, (t) => t === FIRST_RUN_COACH.mapSearch);
    expect(kept.map((s) => s.target)).toEqual([FIRST_RUN_COACH.mapSearch]);
    expect(steps.every((s) => !s.allowCentered)).toBe(true);
    // With the park anchor on the map, the step points at it.
    const withPark = presentSteps(steps, (t) => t === FIRST_RUN_COACH.mapSearch || t === FIRST_RUN_COACH.mapPark);
    expect(withPark.map((s) => s.target)).toEqual([FIRST_RUN_COACH.mapSearch, FIRST_RUN_COACH.mapPark]);
    expect(presentSteps(firstRunTourSteps('home', 'male'), () => false)).toEqual([]);
  });
  it('no step of any tour is centered over nothing (every step names a real target)', () => {
    const all: FirstRunTourId[] = ['home', 'map', 'community', 'player', 'route', 'route-player', 'plan'];
    for (const t of all) for (const s of firstRunTourSteps(t, 'male')) {
      expect(s.allowCentered).toBeFalsy();
      expect(s.title, `${t} → ${s.target} has a title`).toBeTruthy();
    }
  });
  it('home: no week strip (no program) → step 3 points at the map in the nav bar', () => {
    const steps = firstRunTourSteps('home', 'female');
    const noWeek = presentSteps(steps, (t) => t !== FIRST_RUN_COACH.homeWeek);
    expect(noWeek.map((s) => s.target)).toEqual([FIRST_RUN_COACH.homeWorkout, FIRST_RUN_COACH.homePlus, FIRST_RUN_COACH.homeNavMap]);
    expect(noWeek[2].title).toBe('המפה');
    expect(noWeek[2]).not.toHaveProperty('alt');
    // Week strip present → the real step, untouched.
    expect(presentSteps(steps, () => true)[2].target).toBe(FIRST_RUN_COACH.homeWeek);
    // Neither → dropped.
    const none = presentSteps(steps, (t) => t !== FIRST_RUN_COACH.homeWeek && t !== FIRST_RUN_COACH.homeNavMap);
    expect(none).toHaveLength(2);
    expect(src('../../../../navigation/BottomNavbar.tsx')).toContain('data-coach="nav-map"');
  });
  it('player "איך מבצעים" has exactly one target element', () => {
    const view = src('../../../../workout-engine/players/strength/components/ActiveExerciseView.tsx');
    const video = src('../../../../workout-engine/players/strength/components/ExerciseVideoPlayer.tsx');
    expect(view.match(/data-coach="player-how-to"/g)).toHaveLength(1);
    expect(video).not.toContain('player-how-to');
  });
});

describe('home tour — starts on a new user\'s first calm home visit (owner 21.10)', () => {
  const calm = {
    toursOn: true, requestedByWelcome: false, entryKind: 'inactive' as const, planArrival: false,
    todayCardPresent: true, surfaceOpen: false,
  };
  it('arms by itself on a calm home with the today card up', () => {
    expect(shouldArmHomeTour(calm)).toBe(true);
  });
  it('still arms from "סתם להסתכל"', () => {
    expect(shouldArmHomeTour({ ...calm, entryKind: 'loading', requestedByWelcome: true })).toBe(true);
  });
  it('never with flags off, over the WelcomeDrawer, while loading, on the plan arrival, before the card, or over a sheet', () => {
    expect(shouldArmHomeTour({ ...calm, toursOn: false })).toBe(false);
    expect(shouldArmHomeTour({ ...calm, entryKind: 'new' })).toBe(false);
    expect(shouldArmHomeTour({ ...calm, entryKind: 'new', requestedByWelcome: true })).toBe(false);
    expect(shouldArmHomeTour({ ...calm, entryKind: 'loading' })).toBe(false);
    expect(shouldArmHomeTour({ ...calm, planArrival: true })).toBe(false);
    expect(shouldArmHomeTour({ ...calm, todayCardPresent: false })).toBe(false);
    expect(shouldArmHomeTour({ ...calm, surfaceOpen: true })).toBe(false);
  });
  it('the home page wires it (once per user stays in FirstRunTour)', () => {
    const page = src('../../../../../app/home/page.tsx');
    expect(page).toContain('active={shouldArmHomeTour({');
    expect(page).toContain('useCoachTargetPresent(FIRST_RUN_COACH.homeWorkout');
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

describe('new users only (≤ 14 days since account creation)', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 9, 18, 12);
  it('account created within 14 days → new; older → never (even if never trained)', () => {
    expect(FIRST_RUN_NEW_USER_DAYS).toBe(14);
    expect(isNewUserForTours({ createdAtMs: now - 1 * DAY, nowMs: now, everTrained: true })).toBe(true);
    expect(isNewUserForTours({ createdAtMs: now - 14 * DAY, nowMs: now, everTrained: null })).toBe(true);
    expect(isNewUserForTours({ createdAtMs: now - 15 * DAY, nowMs: now, everTrained: false })).toBe(false);
    expect(isNewUserForTours({ createdAtMs: now - 400 * DAY, nowMs: now, everTrained: null })).toBe(false);
  });
  it('missing date → falls back to Gate 1 (never trained = new); unknown stays null', () => {
    expect(isNewUserForTours({ createdAtMs: null, nowMs: now, everTrained: false })).toBe(true);
    expect(isNewUserForTours({ createdAtMs: null, nowMs: now, everTrained: true })).toBe(false);
    expect(isNewUserForTours({ createdAtMs: null, nowMs: now, everTrained: null })).toBeNull();
  });
  it('parses Firebase Auth creationTime and other shapes', () => {
    expect(toCreationMs('Sat, 17 Oct 2026 09:00:00 GMT')).toBe(Date.UTC(2026, 9, 17, 9));
    expect(toCreationMs(new Date(5))).toBe(5);
    expect(toCreationMs({ toMillis: () => 7 })).toBe(7);
    expect(toCreationMs({ seconds: 2 })).toBe(2000);
    expect(toCreationMs(undefined)).toBeNull();
    expect(toCreationMs('not a date')).toBeNull();
  });
  it('FirstRunTour and the player page both require a new user', () => {
    const c = src('../../components/FirstRunTour.tsx');
    expect(c).toContain('useIsNewUserForTours(everActive)');
    expect(c).toContain("onCloseRef.current?.('not-new')");
    const page = src('../../../../../app/workouts/[id]/active/page.tsx');
    expect(page).toContain('playerTourNewUser === true');
  });
});
