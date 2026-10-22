/**
 * i18n wave 2 (namespace `summary`, batch ad): the aerobic summary's child
 * blocks (run-type overview / segments, lap speed list, lap pace chart, streak
 * block, participants, share row, stat rings, together row) move their copy to
 * src/messages/he/summary.json. These snapshots were recorded from the
 * components BEFORE the extraction; the extracted components must render the
 * same Hebrew markup in every state that shows text.
 *
 * Static markup (react-dom/server), node environment — every block is a
 * presentational component driven by props. LapPaceChart's chart body (and its
 * tooltip copy) only mounts after a ResizeObserver measure, so the static
 * render covers its header / empty state; the key test pins the tooltip copy.
 * The share text is built in a click handler — the key test pins it.
 * `<!-- -->` is stripped before comparing (react-dom/server's separator between
 * adjacent text nodes; not rendered text).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import { useLocaleStore } from '@/store/useLocaleStore';
import type { RunTypeModel } from '../../run-type/run-type.mapping';
import type { RepTableModel } from '../../v2-summary.mapping';
import type { GroupParticipant } from '../../hooks/useGroupSummaryCtx';
import type { Lap } from '@/features/workout-engine/core/types/session.types';
import RunTypeOverview from '../run-type/RunTypeOverview';
import RunTypeSegments from '../run-type/RunTypeSegments';
import LapSpeedList from '../shared/LapSpeedList';
import LapPaceChart from '../shared/LapPaceChart';
import DopamineStreakBlock from '../shared/DopamineStreakBlock';
import ParticipantsBlock from '../aerobic/ParticipantsBlock';
import AerobicShareBlock from '../aerobic/AerobicShareBlock';
import AerobicStatRingsBlock from '../aerobic/AerobicStatRingsBlock';
import TogetherBlock from '../aerobic/TogetherBlock';

const NOW = new Date('2026-10-22T12:00:00');
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/summary-blocks-i18n/${name}.html`;
const noop = () => {};
const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
beforeEach(() => { Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS); });

const rings = [
  { key: 'dist', value: '5.00', unit: 'ק״מ', label: 'מרחק', pct: 60, color: '#00baf7' },
  { key: 'time', value: '28:10', label: 'זמן', pct: 40, color: '#0284c7' },
];
const paceRows = [
  { key: 'r1', n: 1, title: '5:40', sub: 'יעד 5:30–5:50', status: 'בטווח', tone: 'in', value: '5:40', paceSec: 340, paceLabel: '5:40' },
  { key: 'r2', n: 2, title: '5:20', sub: 'יעד 5:30–5:50', status: 'הכי מהיר', tone: 'best', value: '5:20', paceSec: 320, paceLabel: '5:20' },
] satisfies NonNullable<RunTypeModel['splits']>['rows'];
const band = { min: 330, max: 350 };
const model = (over: Partial<RunTypeModel>): RunTypeModel => ({
  kind: 'free',
  hero: { label: 'ריצה', repsTitle: null },
  rings,
  splits: null,
  splitsFromLaps: false,
  course: [],
  plan: null,
  extras: [],
  ...over,
});
const splitsBand = { rows: paceRows, band, fastestLabel: 'הכי מהיר: ק״מ 2', lastKmPace: '5:20' };
const splitsFree = { rows: paceRows, band: null, fastestLabel: 'הכי מהיר: ק״מ 2', lastKmPace: '5:20' };
const course = [
  { id: 'wu', label: 'חימום', detail: '10 דק׳' },
  { id: 'reps', label: '6 × 400 מ׳', detail: '6 חזרות' },
];
const repTable = (shortLabel: string | null): RepTableModel => ({
  rows: paceRows, band, summaryLabel: '5 מתוך 6 חזרות בטווח', shortLabel, reps: 6,
});

describe('RunTypeOverview', () => {
  const cases: Array<[string, Parameters<typeof RunTypeOverview>[0]]> = [
    ['intervals-reps', { model: model({ kind: 'intervals', course }), activityType: 'running', repTable: repTable(null), lapCount: 0, onOpenSegments: noop }],
    ['intervals-short', { model: model({ kind: 'intervals', course }), activityType: 'running', repTable: repTable('5/6 בטווח'), lapCount: 0, onOpenSegments: noop }],
    ['easy-band', { model: model({ kind: 'easy', splits: splitsBand }), activityType: 'running', repTable: null, lapCount: 3, onOpenSegments: noop }],
    ['long-extras', { model: model({ kind: 'long', splits: splitsBand, extras: [{ key: 'ascent', label: 'עלייה', value: '+40 מ׳' }] }), activityType: 'running', repTable: null, lapCount: 0, onOpenSegments: noop }],
    ['free-splits', { model: model({ kind: 'free', splits: splitsFree }), activityType: 'running', repTable: null, lapCount: 0, onOpenSegments: noop }],
    ['free-laps-running', { model: model({}), activityType: 'running', repTable: null, lapCount: 4, onOpenSegments: noop }],
    ['free-laps-walking-1', { model: model({}), activityType: 'walking', repTable: null, lapCount: 1, onOpenSegments: noop }],
    ['free-laps-1234', { model: model({}), activityType: 'walking', repTable: null, lapCount: 1234, onOpenSegments: noop }],
  ];
  for (const [name, props] of cases) {
    it(name, async () => {
      await expect(html(<RunTypeOverview {...props} />)).toMatchFileSnapshot(snap(`overview-${name}`));
    });
  }
});

describe('RunTypeSegments', () => {
  it('intervals', async () => {
    await expect(html(<RunTypeSegments model={model({ kind: 'intervals', course })} repTable={repTable('5/6 בטווח')} />))
      .toMatchFileSnapshot(snap('segments-intervals'));
  });
  it('splits band', async () => {
    await expect(html(<RunTypeSegments model={model({ kind: 'easy', splits: splitsBand })} repTable={null} />))
      .toMatchFileSnapshot(snap('segments-splits-band'));
  });
  it('splits free', async () => {
    await expect(html(<RunTypeSegments model={model({ kind: 'free', splits: splitsFree })} repTable={null} />))
      .toMatchFileSnapshot(snap('segments-splits-free'));
  });
});

describe('laps', () => {
  const laps = [
    { id: 'l1', lapNumber: 1, distanceMeters: 1000, durationSeconds: 150, isActive: false },
    { id: 'l2', lapNumber: 2, distanceMeters: 300, durationSeconds: 60, isActive: false },
    { id: 'l3', lapNumber: 1234, distanceMeters: 2000, durationSeconds: 300, isActive: true },
  ];
  it('LapSpeedList', async () => {
    await expect(html(<LapSpeedList laps={laps} />)).toMatchFileSnapshot(snap('lap-speed-list'));
  });
  it('LapPaceChart with data', async () => {
    const lapData = [
      { lapNumber: 1, splitPace: 5.5 },
      { lapNumber: 2, splitPace: 5.2 },
    ] as unknown as Lap[];
    await expect(html(<LapPaceChart laps={lapData} />)).toMatchFileSnapshot(snap('lap-pace-chart'));
  });
  it('LapPaceChart empty', async () => {
    await expect(html(<LapPaceChart laps={[]} />)).toMatchFileSnapshot(snap('lap-pace-chart-empty'));
  });
});

describe('aerobic blocks', () => {
  it('DopamineStreakBlock', async () => {
    await expect(html(<DopamineStreakBlock streakDays={1234} />)).toMatchFileSnapshot(snap('streak'));
  });

  const people: GroupParticipant[] = [
    { uid: 'me', name: 'דנה', distanceKm: 5.123, pace: 5.5 },
    { uid: 'u2', name: '', distanceKm: 0, pace: 0 },
    { uid: 'u3', name: 'יוסי', distanceKm: 4.2, pace: 6 },
    { uid: 'u4', name: 'רון', distanceKm: 3, pace: 0 },
    { uid: 'u5', name: 'מיה', distanceKm: 2, pace: 7.25 },
  ];
  it('ParticipantsBlock full', async () => {
    await expect(html(<ParticipantsBlock participants={people} currentUid="me" />)).toMatchFileSnapshot(snap('participants-full'));
  });
  it('ParticipantsBlock compact', async () => {
    await expect(html(<ParticipantsBlock participants={people} currentUid="u3" compact onShowAll={noop} />))
      .toMatchFileSnapshot(snap('participants-compact'));
  });

  it('AerobicShareBlock saved / not saved', async () => {
    await expect(html(<AerobicShareBlock distanceKm={5} groupCtx={null} />)).toMatchFileSnapshot(snap('share-saved'));
    await expect(html(<AerobicShareBlock distanceKm={0.1} groupCtx={null} wasSaved={false} />)).toMatchFileSnapshot(snap('share-unsaved'));
  });

  for (const activityType of ['walking', 'running'] as const) {
    it(`AerobicStatRingsBlock ${activityType}`, async () => {
      await expect(html(<AerobicStatRingsBlock activityType={activityType} pace={5.5} duration={1834} calories={312.4} />))
        .toMatchFileSnapshot(snap(`rings-${activityType}`));
    });
  }
  it('AerobicStatRingsBlock empty', async () => {
    await expect(html(<AerobicStatRingsBlock activityType="running" pace={0} duration={0} calories={0} />))
      .toMatchFileSnapshot(snap('rings-empty'));
  });

  for (const n of [1, 4, 1234]) {
    it(`TogetherBlock ${n}`, async () => {
      await expect(html(<TogetherBlock collectiveDistanceKm={n === 4 ? 0 : 12.34} participantCount={n} />))
        .toMatchFileSnapshot(snap(`together-${n}`));
    });
  }
});
