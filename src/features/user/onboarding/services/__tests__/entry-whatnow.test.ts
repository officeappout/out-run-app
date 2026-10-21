import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  chooseWhatNowCards,
  consumeWhatNowPlanArrival,
  firstWorkoutNote,
  mapTourAfterWhatNow,
  markWhatNowPlanArrival,
  FIRST_WORKOUT_NOTE,
  isNearParkOrRoute,
  routeSuggestionFromSlots,
  shouldOpenWhatNow,
  starterChipsFor,
  WHATNOW_KELLY_CHIPS,
  WHATNOW_KELLY_URL,
  whatNowMiniMapUrl,
  whatNowRouteCopy,
  whatNowSeenKey,
  type WhatNowRouteSuggestion,
} from '../entry-whatnow';
import { firstRunTourChrome, firstRunTourSteps, FIRST_RUN_COACH } from '../first-run-tour';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';

/** Entry flow v2, step 2 — "מה בא לך עכשיו?" (enable_entry_whatnow_v1). */

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const walk: WhatNowRouteSuggestion = { minutes: 30, stops: 1, aerobicKind: 'walking' };

describe('flag', () => {
  it('fail-closed for users, on for super admins', () => {
    const def = FLAG_DEFS.find((d) => d.key === 'enableEntryWhatnowV1');
    expect(def?.firestoreKey).toBe('enable_entry_whatnow_v1');
    expect(def?.defaultValue).toBe(false);
    expect(def?.superAdminValue).toBe(true);
  });
});

describe('context chooser', () => {
  it('near a park (≤400 m) with a route suggestion → route + plan + kelly', () => {
    const l = chooseWhatNowCards({ nearestPark: { name: 'גינת סוטין', distanceM: 250 }, route: walk });
    expect(l.cards).toEqual(['route', 'plan', 'kelly']);
    expect(l.near).toBe(true);
    expect(l.title).toBe('מה בא לך עכשיו?');
    expect(l.planTagged).toBe(false);
  });
  it('park within walking reach of the suggested route → route first', () => {
    expect(chooseWhatNowCards({ nearestPark: { name: 'x', distanceM: 1100 }, route: walk }).cards[0]).toBe('route');
  });
  it('far from any park → plan (tagged "מומלץ לך") + kelly, no route card', () => {
    const l = chooseWhatNowCards({ nearestPark: { name: 'x', distanceM: 5000 }, route: walk });
    expect(l.cards).toEqual(['plan', 'kelly']);
    expect(l.planTagged).toBe(true);
    expect(l.title).toBe('מה בא לך?');
  });
  it('no park known / no position → plan + kelly', () => {
    expect(chooseWhatNowCards({ nearestPark: null, route: walk }).cards).toEqual(['plan', 'kelly']);
    expect(chooseWhatNowCards({ nearestPark: { name: 'x', distanceM: NaN }, route: walk }).cards).toEqual(['plan', 'kelly']);
  });
  it('near a park but no route suggestion (slots off) → no route card is invented', () => {
    expect(isNearParkOrRoute({ nearestPark: { name: 'x', distanceM: 100 }, route: null })).toBe(true);
    expect(chooseWhatNowCards({ nearestPark: { name: 'x', distanceM: 100 }, route: null }).cards).toEqual(['plan', 'kelly']);
  });
  it('a park beyond 400 m with no route is not "near"', () => {
    expect(isNearParkOrRoute({ nearestPark: { name: 'x', distanceM: 600 }, route: null })).toBe(false);
  });
});

describe('route card copy', () => {
  it('design N2 wording', () => {
    const c = whatNowRouteCopy({ minutes: 30, stops: 2, aerobicKind: 'walking' }, 'גינת סוטין');
    expect(c.tag).toBe('מומלץ לך עכשיו');
    expect(c.title).toBe('מסלול בשכונה שלך · 30 דק׳');
    expect(c.sub).toBe('הליכה מכאן, עם 2 עצירות כוח על המתקנים בגינת סוטין');
  });
  it('one stop / unknown stops / run / unnamed park', () => {
    expect(whatNowRouteCopy(walk, 'גינת הבנים').sub).toBe('הליכה מכאן, עם עצירת כוח על המתקנים בגינת הבנים');
    expect(whatNowRouteCopy({ ...walk, stops: null }, null).sub).toBe('הליכה מכאן, עם עצירות כוח על המתקנים בגינה הקרובה');
    expect(whatNowRouteCopy({ ...walk, aerobicKind: 'running' }, 'x').sub.startsWith('ריצה מכאן')).toBe(true);
  });
});

describe('route suggestion from the map slots', () => {
  it('takes the first walk/run + strength slot, never the full-park workout', () => {
    const r = routeSuggestionFromSlots([
      { kind: 'planned_run' },
      { kind: 'hybrid', timeBudgetMin: 45, preset: { mode: 'full_park_workout' } },
      { kind: 'hybrid', timeBudgetMin: 30, preset: {} },
    ], 'walking');
    expect(r).toEqual({ minutes: 30, stops: 1, aerobicKind: 'walking' });
  });
  it('route_stops → stop count unknown before the compose', () => {
    expect(routeSuggestionFromSlots([{ kind: 'hybrid', timeBudgetMin: 25, preset: { mode: 'route_stops' } }], 'walking')?.stops).toBeNull();
  });
  it('no hybrid slot → null', () => {
    expect(routeSuggestionFromSlots([{ kind: 'aerobic_quick' }], 'walking')).toBeNull();
    expect(routeSuggestionFromSlots(null, 'walking')).toBeNull();
  });
});

describe('once-only persistence', () => {
  it('per-user onboardingPrefs key', () => {
    expect(whatNowSeenKey('u1')).toBe('entry_whatnow_seen:u1');
    expect(whatNowSeenKey(null)).toBe('entry_whatnow_seen:anon');
    expect(whatNowSeenKey('u1')).not.toBe(whatNowSeenKey('u2'));
  });
  it('opens only with the flag, on a landing, not seen, not blocked', () => {
    const base = { enabled: true, landing: true, seenValue: null, blocked: false };
    expect(shouldOpenWhatNow(base)).toBe(true);
    expect(shouldOpenWhatNow({ ...base, enabled: false })).toBe(false);
    expect(shouldOpenWhatNow({ ...base, landing: false })).toBe(false);
    expect(shouldOpenWhatNow({ ...base, blocked: true })).toBe(false);
    for (const answer of ['route', 'plan', 'kelly', 'browse', 'dismiss']) {
      expect(shouldOpenWhatNow({ ...base, seenValue: answer })).toBe(false);
    }
  });
  it('the hook persists every answer (dismiss too) through onboardingPrefs', () => {
    const hook = src('../../hooks/useEntryWhatNow.ts');
    expect(hook).toContain("import { getOnboardingPrefAsync, setOnboardingPref } from '@/lib/onboardingPrefs';");
    expect(hook).toContain('getOnboardingPrefAsync(whatNowSeenKey(uid))');
    expect(hook).toContain('setOnboardingPref(whatNowSeenKey(uid), a)');
    expect(hook).not.toContain('localStorage.setItem');
  });
});

describe('Kelly chips', () => {
  it('the six ready chips, reached via /ai-coach?starter=entry', () => {
    expect(WHATNOW_KELLY_CHIPS).toHaveLength(6);
    expect(WHATNOW_KELLY_URL).toBe('/ai-coach?starter=entry');
    expect(starterChipsFor('entry')).toBe(WHATNOW_KELLY_CHIPS);
    expect(starterChipsFor(null)).toBeNull();
    expect(starterChipsFor('other')).toBeNull();
  });
});

describe('first-workout line', () => {
  it('only with the flag on and before the health declaration', () => {
    expect(firstWorkoutNote(true, false)).toBe(FIRST_WORKOUT_NOTE);
    expect(firstWorkoutNote(true, true)).toBeNull();
    expect(firstWorkoutNote(false, false)).toBeNull();
  });
});

describe('mini map', () => {
  it('needs a centre and a token', () => {
    expect(whatNowMiniMapUrl(null, 't')).toBeNull();
    expect(whatNowMiniMapUrl({ lat: 32, lng: 34.8 }, '')).toBeNull();
    expect(whatNowMiniMapUrl({ lat: 32, lng: 34.8 }, 't')).toContain('/static/34.80000,32.00000,14.5,0/');
  });
});

describe('first-route tutorial + player tip (extends first-run-tour, no fork)', () => {
  it('route tour: 3 anchored steps — swipe on the card, the strength stop, ring on start', () => {
    const steps = firstRunTourSteps('route', null);
    expect(steps.map((s) => s.target)).toEqual([FIRST_RUN_COACH.routeCard, FIRST_RUN_COACH.routeStop, FIRST_RUN_COACH.routeStart]);
    expect(steps[0].finger).toBe('swipe');
    // owner note 21.10 #6: every step points at the real element — no centred bubble over the map
    expect(steps.every((s) => !s.allowCentered)).toBe(true);
    expect(steps[2].ring).toBe(true);
  });
  it('one idea per step: a short title + one line', () => {
    for (const tour of ['route', 'route-player', 'plan'] as const) {
      for (const st of firstRunTourSteps(tour, 'female')) {
        expect(st.title && st.title.length).toBeGreaterThan(2);
        expect(st.title!.length).toBeLessThanOrEqual(16);
        expect(st.text.length).toBeLessThanOrEqual(80);
        expect(st.text).not.toContain('\n');
      }
    }
  });
  it('one bubble style: every tour uses the v2 entry bubble (owner 21.10)', () => {
    for (const t of ['route', 'route-player', 'plan', 'home', 'map', 'community', 'player'] as const) {
      expect(firstRunTourChrome(t).variant).toBe('entry');
    }
  });
  it('every "what now" answer has its guidance', () => {
    expect(mapTourAfterWhatNow('browse')).toBe(true);
    expect(mapTourAfterWhatNow('dismiss')).toBe(true);
    for (const a of ['route', 'plan', 'kelly'] as const) expect(mapTourAfterWhatNow(a)).toBe(false);
    expect(firstRunTourSteps('plan', 'male').map((s) => s.target)).toEqual([FIRST_RUN_COACH.homeWorkout]);
    expect(starterChipsFor('entry')).toEqual(WHATNOW_KELLY_CHIPS);
  });
  it('"תוכנית" → /home: a one-shot hint that suppresses the second "what first?" drawer', () => {
    const m = new Map<string, string>();
    const kv = { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => { m.set(k, v); }, removeItem: (k: string) => { m.delete(k); } };
    expect(consumeWhatNowPlanArrival(kv)).toBe(false);
    markWhatNowPlanArrival(kv);
    expect(consumeWhatNowPlanArrival(kv)).toBe(true);
    expect(consumeWhatNowPlanArrival(kv)).toBe(false);
    expect(consumeWhatNowPlanArrival(null)).toBe(false);
    const home = src('../../../../../app/home/page.tsx');
    expect(home).toContain("kind === 'new' && !whatNowPlanArrival");
    expect(home).toContain('tour="plan"');
  });
  it('player tip: one step on the controls', () => {
    expect(firstRunTourSteps('route-player', null).map((s) => s.target)).toEqual([FIRST_RUN_COACH.routePlayerControls]);
  });
  it('the carousels and controls carry the same data-coach ids', () => {
    expect(src('../../../../parks/core/components/RouteCarousel.tsx')).toContain("'route-card'");
    expect(src('../../../../parks/core/components/hybrid/HybridSlotCarousel.tsx')).toContain("'route-start'");
    expect(src('../../../../parks/core/components/AppMap.tsx')).toContain("'route-strength-stop'");
    expect(src('../../../../workout-engine/players/running/components/Continuous/v2/ContinuousRunCardV2.tsx')).toContain('data-coach="route-player-controls"');
  });
});
