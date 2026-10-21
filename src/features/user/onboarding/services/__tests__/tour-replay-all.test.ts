/**
 * All tours replayable (owner 21.10): the replay registry, the tours list, Kelly's tour chips,
 * the preview illustrations (every step has its target) and one bubble style everywhere.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  REPLAYABLE_TOURS, TOUR_PREVIEW_PATH, TOUR_REPLAY_KEY, TOUR_REPLAY_MODE, TOUR_SCREEN,
  consumePreviewReplay, consumeTourReplay, isReplayableTour, peekTourReplay, requestTourReplay,
  type ReplayableTour,
} from '../tour-replay';
import { TOUR_CATALOG } from '../tour-catalog';
import { replayStepsFrom, replayTourSteps } from '../tour-replay-steps';
import { presentSteps, type FirstRunTourId } from '../first-run-tour';
import { COACH_ACTIONS, ROUND4_ACTION_IDS } from '@/lib/ai/coach/action-chips';
import { round4TurnActions, TOUR_CHIP_BY_TOUR } from '@/lib/ai/coach/round4/turn-extras';
import { stationTutorialEntrySteps, stationTutorialSteps } from '@/features/workout-engine/hybrid/station-tutorial';
import { PREVIEW_ILLUSTRATION } from '@/features/help/components/tour-preview/TourPreviewScreen';

const src = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const ALL_FIRST_RUN: FirstRunTourId[] = ['home', 'map', 'community', 'player', 'route', 'route-player', 'plan'];

function memKV() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

describe('replay registry', () => {
  it('every first-run tour + the station tour is replayable', () => {
    for (const t of ALL_FIRST_RUN) expect(REPLAYABLE_TOURS).toContain(t);
    expect(REPLAYABLE_TOURS).toContain('station');
    expect(new Set(REPLAYABLE_TOURS).size).toBe(REPLAYABLE_TOURS.length);
  });
  it('screen tours open their screen; in-flow tours open the preview (never a workout)', () => {
    expect(TOUR_SCREEN.home).toBe('/home');
    expect(TOUR_SCREEN.plan).toBe('/home');
    expect(TOUR_SCREEN.map).toBe('/map');
    expect(TOUR_SCREEN.community).toBe('/community?tab=leagues');
    for (const t of ['player', 'route', 'route-player', 'station'] as const) {
      expect(TOUR_REPLAY_MODE[t]).toBe('preview');
      expect(TOUR_SCREEN[t]).toBe(TOUR_PREVIEW_PATH);
    }
    for (const t of REPLAYABLE_TOURS) {
      expect(TOUR_SCREEN[t]).not.toMatch(/workouts|active|openRun|openRoute|openHybridSlots/);
    }
  });
  it('a preview request is consumed once by the preview page, never by a screen host', () => {
    const kv = memKV();
    expect(requestTourReplay('player', 1, kv, 1000)).toBe('/help/tour');
    expect(consumeTourReplay('home', kv, 1100)).toBeNull();
    expect(consumePreviewReplay(kv, 1200)).toEqual({ tour: 'player', step: 1 });
    expect(consumePreviewReplay(kv, 1300)).toBeNull();
  });
  it('a screen request is not taken by the preview page', () => {
    const kv = memKV();
    requestTourReplay('community', 0, kv, 0);
    expect(consumePreviewReplay(kv, 10)).toBeNull();
    expect(consumeTourReplay('community', kv, 20)).toEqual({ step: 0 });
  });
  it('stale, unknown or broken requests are cleared', () => {
    const kv = memKV();
    requestTourReplay('station', 0, kv, 0);
    expect(peekTourReplay(kv, 10 * 60_000)).toBeNull();
    expect(kv.m.has(TOUR_REPLAY_KEY)).toBe(false);
    kv.setItem(TOUR_REPLAY_KEY, JSON.stringify({ tour: 'nope', step: 0, at: 0 }));
    expect(peekTourReplay(kv, 10)).toBeNull();
    kv.setItem(TOUR_REPLAY_KEY, '{oops');
    expect(peekTourReplay(kv, 10)).toBeNull();
    expect(isReplayableTour('station')).toBe(true);
    expect(isReplayableTour('settings')).toBe(false);
  });
  it('every replayable tour has steps, from the requested step (clamped)', () => {
    for (const t of REPLAYABLE_TOURS) {
      const all = replayTourSteps(t, 'male');
      expect(all.length, t).toBeGreaterThan(0);
      expect(replayStepsFrom(all, 99)).toEqual(all.slice(-1));
      expect(replayStepsFrom(all, -3)).toEqual(all);
    }
    expect(replayStepsFrom([], 0)).toEqual([]);
  });
});

describe('one bubble style: title + one line on every step', () => {
  it('every replayable step has a title and a single line', () => {
    for (const t of REPLAYABLE_TOURS) {
      for (const gender of ['male', 'female', 'other', null] as const) {
        for (const s of replayTourSteps(t, gender)) {
          expect(s.title, `${t}/${s.target}`).toBeTruthy();
          expect(s.text).not.toContain('\n');
        }
      }
    }
  });
  it('station: title + line form, gendered, no slash forms; the legacy steps are unchanged', () => {
    const m = stationTutorialEntrySteps('male');
    expect(m.map((s) => s.target)).toEqual(stationTutorialSteps('male').map((s) => s.target));
    const texts = new Set((['male', 'female', 'other'] as const).map((g) => stationTutorialEntrySteps(g)[1].text));
    expect(texts.size).toBe(3);
    for (const s of stationTutorialEntrySteps('other')) expect(s.text).not.toMatch(/[א-ת]\/[א-ת]/);
  });
  it('every tour host renders the entry bubble', () => {
    expect(src('../../components/FirstRunTour.tsx')).toContain('{...firstRunTourChrome(tour)}');
    expect(src('../../components/TourReplayHost.tsx')).toContain('{...firstRunTourChrome(tour)}');
    expect(src('../../../../help/components/tour-preview/TourPreviewScreen.tsx')).toContain('{...firstRunTourChrome(tour)}');
    const station = src('../../../../workout-engine/hybrid/StationWelcomeScreen.tsx');
    expect(station).toContain('variant="entry"');
    // Flag-gated: the shared bubble only when the first-run tours are on.
    expect(src('../../../../workout-engine/hybrid/HybridStationLayer.tsx')).toContain('oneBubbleStyle={firstRunToursEnabled(flags)}');
  });
});

describe('tours list (help hub + search Help tab)', () => {
  it('lists every replayable tour exactly once, with a name and one line', () => {
    expect(TOUR_CATALOG.map((t) => t.id).sort()).toEqual([...REPLAYABLE_TOURS].sort());
    for (const t of TOUR_CATALOG) {
      expect(t.name).toMatch(/[א-ת]/);
      expect(t.line).toMatch(/[א-ת]/);
    }
  });
  it('both help surfaces render it; the search tab only under ai_coach_round4', () => {
    expect(src('../../../../help/components/HelpHub.tsx')).toContain('<TourList title="סיורים באפליקציה" />');
    const tab = src('../../../../search/components/tabs/HelpTab.tsx');
    expect(tab).toContain('{toursOn && <TourList');
    expect(src('../../../../search/components/UnifiedSearchScreen.tsx')).toContain('toursOn={aiCoachRound4}');
  });
  it('the preview page is gated by ai_coach_round4 like /help', () => {
    const page = src('../../../../../app/help/tour/page.tsx');
    expect(page).toContain('flags.aiCoachRound4 === true');
    expect(page).toContain('consumePreviewReplay()');
  });
});

describe("Kelly's tour chips name any tour", () => {
  it('each replayable tour has a chip that replays it', () => {
    for (const t of REPLAYABLE_TOURS) {
      const id = TOUR_CHIP_BY_TOUR[t];
      expect(ROUND4_ACTION_IDS).toContain(id);
      expect(COACH_ACTIONS[id].tour?.id).toBe(t);
      expect(COACH_ACTIONS[id].label).toMatch(/[א-ת]/);
    }
  });
  it('the running chapter now offers the route tour chip', () => {
    const state = { tutorial: 'running' } as unknown as Parameters<typeof round4TurnActions>[0]['state'];
    expect(round4TurnActions({ state, toolNames: ['start_tutorial'], userText: 'x', actions: [] })).toEqual(['tour_route', 'open_help']);
  });
});

describe('preview illustrations: every step points at a drawn element', () => {
  it.each(Object.entries(PREVIEW_ILLUSTRATION))('%s', (tour, Illustration) => {
    const html = renderToStaticMarkup(React.createElement(Illustration!));
    const steps = replayTourSteps(tour as ReplayableTour, 'male');
    const has = (target: string) => html.includes(`data-coach="${target}"`);
    expect(presentSteps(steps, has)).toHaveLength(steps.length);
    for (const s of steps) expect(html.match(new RegExp(`data-coach="${s.target}"`, 'g')), s.target).toHaveLength(1);
  });
  it('covers exactly the preview tours', () => {
    const preview = REPLAYABLE_TOURS.filter((t) => TOUR_REPLAY_MODE[t] === 'preview').sort();
    expect(Object.keys(PREVIEW_ILLUSTRATION).sort()).toEqual(preview);
  });
});

describe('screen hosts', () => {
  it('a replay host is mounted on every screen tour\'s screen', () => {
    const home = src('../../../../../app/home/page.tsx');
    expect(home).toContain('<TourReplayHost tour="home"');
    expect(home).toContain('<TourReplayHost tour="plan"');
    expect(src('../../../../../app/map/layers/DiscoverLayer.tsx')).toContain('<TourReplayHost tour="map"');
    expect(src('../../../../../app/community/page.tsx')).toContain('<TourReplayHost tour="community"');
  });
});
