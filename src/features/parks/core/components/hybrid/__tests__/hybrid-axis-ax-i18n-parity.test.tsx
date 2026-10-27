/**
 * i18n wave 2 batch ax (namespace `map`, hybrid.axis.*): HybridJourneyAxis leg titles / badges / metas and the route's
 * questionnaire line move to src/messages/he/map.json. Snapshots recorded BEFORE the extraction (unmodified main);
 * static markup, `<!-- -->` stripped before comparing.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const userState = { profile: { core: { gender: 'male' as string | undefined } } };
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/features/user', () => {
  const useUserStore = (sel: (s: typeof userState) => unknown) => sel(userState);
  (useUserStore as unknown as { getState: () => typeof userState }).getState = () => userState;
  return { useUserStore };
});
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: {}, loading: false }) }));
vi.mock('@/lib/onboardingPrefs', () => ({ getOnboardingPref: () => null, setOnboardingPref: () => {} }));

import HybridJourneyAxis, { buildHybridLegs } from '../HybridJourneyAxis';
import { routeQuestionnaireLine } from '../route-questionnaire-line';
import { routeStopsFixture, fullParkFixture } from '../../overview/__tests__/fixtures';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/hybrid-axis-ax-i18n/${name}.html`;
const jsnap = (name: string) => `./__snapshots__/hybrid-axis-ax-i18n/${name}.json`;
const noop = () => {};

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T12:00:00')); });
afterAll(() => { vi.useRealTimers(); });

type Segs = Parameters<typeof buildHybridLegs>[0];
const route = routeStopsFixture().plan.segments as unknown as Segs;
const park = fullParkFixture().plan.segments as unknown as Segs;
const nudged = (domains: string[]) => ({ kind: 'strength', content: { assessmentNudge: { assessmentDomains: domains }, exercises: [] } });

describe('buildHybridLegs', () => {
  it('legs as markup', async () => {
    const render = (legs: ReturnType<typeof buildHybridLegs>) => legs.map((l) => ({
      ...l,
      title: 'title' in l && l.title ? html(<>{l.title as never}</>) : undefined,
      meta: 'meta' in l && l.meta ? l.meta.map((m) => ({ ...m, text: html(<>{m.text as never}</>) })) : undefined,
    }));
    const out = {
      named: render(buildHybridLegs(route, { stationName: 'גינת כושר רוקח', walkLegs: { thereMin: 4, backMin: 5 } })),
      unnamed: render(buildHybridLegs(route, {})),
      park: render(buildHybridLegs(park, { stationName: 'פארק הירקון' })),
      parkUnnamed: render(buildHybridLegs(park, {})),
      zones: render(buildHybridLegs(
        ['jogging', 'recovery', 'tempo', 'fartlek_fast', 'bogus', undefined].map((zone, i) => ({ index: i, kind: 'aerobic', aerobicType: 'running', zone, distanceKm: 1, durationSec: 300 })) as unknown as Segs,
        {},
      )),
    };
    await expect(`${JSON.stringify(out, (_k, v) => (typeof v === 'object' && v !== null && '$$typeof' in v ? '[node]' : v), 1)}\n`).toMatchFileSnapshot(jsnap('legs'));
  });
});

describe('route questionnaire line', () => {
  it('per gender, locked and nudged', async () => {
    const out: Record<string, unknown> = {};
    // Unknown gender (null / undefined) is not recorded: the old g() gave the masculine nudge, the catalog serves unknown the
    // neutral `other` branch (owner decision 21.10). The locked line is the same text for everyone.
    for (const g of ['male', 'female', 'other'] as const) {
      out[String(g)] = {
        locked: routeQuestionnaireLine([{ kind: 'strength', content: { needsAssessment: { assessmentDomains: ['push'] } } }], g)?.text,
        nudged: routeQuestionnaireLine([nudged(['push'])], g)?.text,
      };
    }
    await expect(`${JSON.stringify(out, null, 1)}\n`).toMatchFileSnapshot(jsnap('questionnaire'));
  });
});

describe('HybridJourneyAxis', () => {
  const axis = (segments: Segs, extra: Record<string, unknown> = {}) => (
    <HybridJourneyAxis segments={segments} onSegmentAssessmentLink={noop} {...(extra as object)} />
  );
  it('route + stops, named / unnamed, v1 / v2', async () => {
    userState.profile.core.gender = 'male';
    await expect(html(axis(route, { stationName: 'גינת כושר רוקח', walkLegs: { thereMin: 4, backMin: 5 } }))).toMatchFileSnapshot(snap('route-named'));
    await expect(html(axis(route, { v2: true }))).toMatchFileSnapshot(snap('route-v2'));
  });
  it('questionnaire line per gender', async () => {
    const segs = [...route.slice(0, 2), nudged(['core']) as never, ...route.slice(3)] as Segs;
    for (const g of ['male', 'female']) {
      userState.profile.core.gender = g;
      await expect(html(axis(segs))).toMatchFileSnapshot(snap(`nudge-${g ?? 'unset'}`));
    }
    userState.profile.core.gender = 'female';
    await expect(html(axis(route))).toMatchFileSnapshot(snap('locked-female'));
  });
  it('full park', async () => {
    userState.profile.core.gender = 'male';
    await expect(html(axis(park, { stationName: 'פארק הירקון', isWarmupActive: true, isWarmupExpanded: false }))).toMatchFileSnapshot(snap('park'));
  });
});
