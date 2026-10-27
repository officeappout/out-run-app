/**
 * i18n wave 2 batch ax (namespace `player`, hybrid.*): the hybrid run's copy (station layer screens, the v2
 * transition card / run-leg CTA / session list, the guided-station + tutorial copy, the v2 view + list labels)
 * moves to src/messages/he/player.json. Snapshots were recorded BEFORE the extraction (unmodified main);
 * the extracted code must reproduce them. Static markup (react-dom/server), node env.
 * Zustand stores render their INITIAL state under react-dom/server, so the gender is written into getInitialState().
 * `<!-- -->` is stripped before comparing (react-dom/server's separator between adjacent text nodes; not rendered text).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('../../players/running/components/FreeRun/v2/useFreeRunLive', () => ({
  useFreeRunLive: () => ({
    totals: { durationSec: 1360, distanceKm: 2.2 },
    currentPaceSec: 330,
    isPaused: false,
    pause: () => {},
    resume: () => {},
    lap: () => {},
  }),
}));
vi.mock('../../players/running/hooks/useZoneTracking', () => ({ useZoneTracking: () => ({ status: 'unknown', rollingPaceSec: null, inZonePct: null }) }));
const apiRef: { current: unknown } = { current: null };
vi.mock('../v2/HybridPlayerV2Context', () => ({ useHybridPlayerV2: () => apiRef.current }));

import { useLocaleStore } from '@/store/useLocaleStore';
import type { HybridPlannedSegment } from '../compose-hybrid-session.service';
import { initSequencer, reduceSequencerAll } from '../../engines/hybrid/hybrid-sequencer';
import { legResults, sequencerView } from '../../engines/hybrid/sequencer.selectors';
import type { SequencerEvent } from '../../engines/hybrid/sequencer.types';
import type { SequencerEventInput } from '../../engines/hooks/useHybridSequencer';
import { headerView, legLabel, legZone, miniView, nextBlockView, transitionView } from '../v2/hybrid-v2-view';
import { hybridListSections, listTotals } from '../v2/hybrid-v2-list';
import { exerciseNameOf } from '../v2/exercise-display';
import HybridStationCta from '../HybridStationCta';
import StationCompleteScreen from '../StationCompleteScreen';
import StationWelcomeScreen from '../StationWelcomeScreen';
import HybridTransitionCardV2 from '../v2/HybridTransitionCardV2';
import HybridRunLegV2 from '../v2/HybridRunLegV2';
import HybridSessionListV2 from '../v2/HybridSessionListV2';
import { guidanceLine, welcomeCta, welcomeGreeting } from '../guided-station';
import { stationTutorialEntrySteps, stationTutorialSteps } from '../station-tutorial';
import { walkingLine } from '../hybrid-walk-state';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/hybrid-ax-i18n/${name}.html`;
const jsnap = (name: string) => `./__snapshots__/hybrid-ax-i18n/${name}.json`;
const json = (v: unknown) => `${JSON.stringify(v, null, 1)}\n`;
const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };
const GENDERS = ['male', 'female', 'other'] as const;

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T12:00:00')); vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
beforeEach(() => { Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS, { gender: 'other' }); });

// ── fixtures: the same plan the v2 player's unit test uses ───────────────────
const content = {
  exercises: [
    { exercise: { id: 'pull', name: 'מתח' }, sets: 3, reps: 6, repsRange: { min: 6, max: 8 } },
    { exercise: { id: 'dip', name: 'מקבילים' }, sets: 2, reps: 8 },
    { exercise: { id: 'pl', name: 'פלאנק' }, sets: 2, reps: 30, isTimeBased: true },
  ],
  totalPlannedSets: 7,
  estimatedDurationSec: 600,
} as unknown as HybridPlannedSegment['content'];
const PLAN: HybridPlannedSegment[] = [
  { index: 0, kind: 'aerobic', aerobicType: 'running', zone: 'easy', targetPaceSecPerKm: { min: 330, max: 350 }, distanceKm: 2, durationSec: 700, fromKm: 0, toKm: 2, estCalories: 0 },
  { index: 1, kind: 'strength', parkId: 'p1', content, estCalories: 0 },
  { index: 2, kind: 'aerobic', aerobicType: 'running', zone: 'recovery', distanceKm: 0.3, durationSec: 120, fromKm: 2, toKm: 2.3, estCalories: 0 },
];
const WALK_PLAN: HybridPlannedSegment[] = [
  { index: 0, kind: 'aerobic', aerobicType: 'walking', zone: 'walk', targetPaceSecPerKm: { min: 600, max: 700 }, distanceKm: 1.2, durationSec: 800, fromKm: 0, toKm: 1.2, estCalories: 0 },
  { index: 1, kind: 'strength', content, estCalories: 0 },
  { index: 2, kind: 'aerobic', aerobicType: 'cycling', zone: 'easy', distanceKm: 3, durationSec: 600, fromKm: 1.2, toKm: 4.2, estCalories: 0 },
];
const NAMES = { p1: 'פארק הירקון' };
const imageOf = () => undefined;
const T0 = 1_000_000;
function run(plan: HybridPlannedSegment[], events: Array<SequencerEventInput & { t: number }>) {
  return reduceSequencerAll(initSequencer(plan), events.map(({ t, ...e }) => ({ ...e, atMs: T0 + t * 1000 }) as SequencerEvent));
}

const SCENARIOS = () => {
  const idle = run(PLAN, []);
  const onLeg = run(PLAN, [{ type: 'START', t: 0 }, { type: 'RUN_TICK', t: 60, cumulativeKm: 0.25, elapsedSec: 60 }]);
  const approaching = run(PLAN, [{ type: 'START', t: 0 }, { type: 'RUN_TICK', t: 600, cumulativeKm: 1.95, elapsedSec: 600 }]);
  const transition = run(PLAN, [{ type: 'START', t: 0 }, { type: 'RUN_TICK', t: 600, cumulativeKm: 2, elapsedSec: 600 }, { type: 'ARRIVE_MANUAL', t: 600 }]);
  const station = run(PLAN, [...[{ type: 'START', t: 0 }, { type: 'RUN_TICK', t: 600, cumulativeKm: 2, elapsedSec: 600 }, { type: 'ARRIVE_MANUAL', t: 600 }] as Array<SequencerEventInput & { t: number }>, { type: 'START_STATION', t: 605 }]);
  const cooldown = run(PLAN, [
    { type: 'START', t: 0 }, { type: 'RUN_TICK', t: 700, cumulativeKm: 2.1, elapsedSec: 700 }, { type: 'ARRIVE_MANUAL', t: 700 }, { type: 'START_STATION', t: 705 },
    { type: 'STATION_DONE', t: 1300, exerciseLog: [{ exerciseId: 'pull', exerciseName: 'מתח', confirmedReps: [7, 7, 6], targetReps: 6 }] },
    { type: 'RUN_TICK', t: 760, cumulativeKm: 2.2, elapsedSec: 760 },
  ]);
  const skipped = run(PLAN, [{ type: 'START', t: 0 }, { type: 'RUN_TICK', t: 300, cumulativeKm: 1, elapsedSec: 300 }, { type: 'ARRIVE_MANUAL', t: 301 }, { type: 'SKIP_STATION', t: 301 }]);
  const walkLeg = run(WALK_PLAN, [{ type: 'START', t: 0 }, { type: 'RUN_TICK', t: 60, cumulativeKm: 0.2, elapsedSec: 60 }]);
  return { idle, onLeg, approaching, transition, station, cooldown, skipped, walkLeg };
};

describe('hybrid v2 view + list labels', () => {
  it('view labels per phase', async () => {
    const sc = SCENARIOS();
    const out: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(sc)) {
      const plan = k === 'walkLeg' ? WALK_PLAN : PLAN;
      const v = sequencerView(s, T0 + 605_000);
      out[k] = {
        header: headerView(v, plan, NAMES),
        headerNamed: headerView(v, plan, NAMES, 'מסלול + עצירות'),
        headerNoNames: headerView(v, plan, {}),
        next: nextBlockView(v, NAMES),
        nextNoName: nextBlockView(v, {}),
        mini: miniView(v, plan, NAMES, 1360, 2.2),
        transition: transitionView(v, plan, NAMES, exerciseNameOf, 20),
      };
    }
    out.legLabels = [0, 1, 2].map((i) => [PLAN, WALK_PLAN].map((p) => [legLabel(p, i, NAMES), legLabel(p, i, {})]));
    out.zones = [PLAN[0], PLAN[2], WALK_PLAN[0], WALK_PLAN[2], { ...WALK_PLAN[0], zone: undefined }, { ...PLAN[0], zone: 'tempo' }, { ...PLAN[0], zone: undefined }].map((s) => legZone(s as HybridPlannedSegment));
    await expect(json(out)).toMatchFileSnapshot(jsnap('v2-view'));
  });
  it('list sections', async () => {
    const sc = SCENARIOS();
    const out: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(sc)) {
      const plan = k === 'walkLeg' ? WALK_PLAN : PLAN;
      const secs = hybridListSections(plan, legResults(s), NAMES, exerciseNameOf, imageOf);
      out[k] = { secs, totals: listTotals(secs, 1360, 2.2), totalsEmpty: listTotals([], 0, 0) };
    }
    await expect(json(out)).toMatchFileSnapshot(jsnap('v2-list'));
  });
});

describe('guided station / tutorial / walking line copy', () => {
  // Unknown gender (null / undefined) is not recorded in this snapshot for the 3-way copy; it is pinned in
  // src/lib/i18n/__tests__/batch-ax-he.test.ts ('unknown gender stays masculine'): the old g() helper gave the
  // masculine form and the call sites keep `gender ?? 'male'`. The neutral wording is a separate owner decision.
  it('per gender', async () => {
    const out: Record<string, unknown> = {};
    for (const g of [...GENDERS, null, undefined] as const) {
      const known = g === 'male' || g === 'female' || g === 'other';
      out[String(g)] = {
        guidanceReps: guidanceLine('reps', g, 8),
        guidanceRepsBare: guidanceLine('reps', g),
        guidanceRepsBlank: guidanceLine('reps', g, '  '),
        guidanceTime: guidanceLine('time', g),
        cta: welcomeCta(g),
        ...(known ? {
          steps: stationTutorialSteps(g),
          entry: stationTutorialEntrySteps(g),
          walkFirstNear: walkingLine(g, 1, 350),
          walkFirstNull: walkingLine(g, null, null),
          walkNextNear: walkingLine(g, 2, 1200),
          walkNextNull: walkingLine(g, 3, null),
        } : {}),
      };
    }
    out.greeting = welcomeGreeting();
    await expect(json(out)).toMatchFileSnapshot(jsnap('guided-copy'));
  });
});

describe('hybrid station components', () => {
  it('station CTA', async () => {
    await expect(html(<HybridStationCta isFinalLeg={false} onClick={() => {}} />)).toMatchFileSnapshot(snap('cta-station'));
    await expect(html(<HybridStationCta isFinalLeg onClick={() => {}} />)).toMatchFileSnapshot(snap('cta-final'));
  });

  const summary = { exercises: 4, minutes: 12 } as never;
  const ctx = { stationNumber: 1, stationTotal: 3, isFinalStation: false, nextWalkSec: 420, nextLegKind: 'walking', nextStationName: 'גינת כושר הדר', parkName: 'פארק הירקון', estimatedMin: 14 } as never;
  it('station complete', async () => {
    await expect(html(<StationCompleteScreen summary={summary} context={ctx} onContinue={() => {}} />)).toMatchFileSnapshot(snap('complete-next'));
    await expect(html(<StationCompleteScreen summary={{ exercises: 1, minutes: 0 } as never} context={{ ...(ctx as object), nextStationName: null } as never} onContinue={() => {}} fastPrompt={{ onAccept: () => {} }} />)).toMatchFileSnapshot(snap('complete-prompt'));
    await expect(html(<StationCompleteScreen summary={{ exercises: 0, minutes: 0 } as never} context={null} onContinue={() => {}} />)).toMatchFileSnapshot(snap('complete-bare'));
  });

  it('station welcome', async () => {
    const plan = {
      id: 'w', name: 'x', difficulty: 'medium', totalDuration: 600,
      segments: [{
        id: 's', type: 'station', title: 'כוח', icon: '', exercises: [
          { id: 'e1', name: 'מתח', reps: '8 חזרות' },
          { id: 'e2', name: 'פלאנק', duration: '30 שניות', exerciseType: 'time' },
        ], isCompleted: false,
      }],
    } as never;
    for (const gender of GENDERS) {
      await expect(html(<StationWelcomeScreen plan={plan} context={ctx} gender={gender} onStart={() => {}} guided uid="u1" />)).toMatchFileSnapshot(snap(`welcome-${gender}`));
    }
    await expect(html(<StationWelcomeScreen plan={plan} context={{ ...(ctx as object), parkName: null, estimatedMin: null } as never} gender={null} onStart={() => {}} guided={false} uid={null} />)).toMatchFileSnapshot(snap('welcome-bare'));
  });
});

describe('hybrid v2 cards', () => {
  const mkApi = (s: ReturnType<typeof SCENARIOS>[keyof ReturnType<typeof SCENARIOS>], nowMs: number, plan = PLAN, over: Record<string, unknown> = {}) => ({
    enabled: true, plan, names: NAMES, label: null, state: { options: { extendSec: 20 } }, view: sequencerView(s, nowMs),
    strip: null, legs: legResults(s), transitionSec: 20,
    arriveNow: () => {}, skipUpcoming: () => {}, skipStation: () => {}, startStationNow: () => {}, extendTransition: () => {},
    toggleTransitionPause: () => {}, finish: () => {}, ...over,
  });
  it('transition card', async () => {
    const sc = SCENARIOS();
    apiRef.current = mkApi(sc.transition, T0 + 605_000);
    await expect(html(<HybridTransitionCardV2 api={apiRef.current as never} />)).toMatchFileSnapshot(snap('transition'));
    const walkTr = run(WALK_PLAN, [{ type: 'START', t: 0 }, { type: 'RUN_TICK', t: 800, cumulativeKm: 1.2, elapsedSec: 800 }, { type: 'ARRIVE_MANUAL', t: 800 }]);
    apiRef.current = mkApi(walkTr, T0 + 805_000, WALK_PLAN, { state: { options: {} } });
    await expect(html(<HybridTransitionCardV2 api={apiRef.current as never} />)).toMatchFileSnapshot(snap('transition-walk'));
  });
  it('run leg CTA', async () => {
    const sc = SCENARIOS();
    for (const [name, s, now] of [['far', sc.onLeg, T0 + 60_000], ['approaching', sc.approaching, T0 + 600_000], ['cooldown', sc.cooldown, T0 + 760_000]] as const) {
      apiRef.current = mkApi(s, now);
      await expect(html(<HybridRunLegV2 api={apiRef.current as never} />)).toMatchFileSnapshot(snap(`runleg-${name}`));
    }
  });
  it('session list', async () => {
    const sc = SCENARIOS();
    apiRef.current = mkApi(sc.cooldown, T0 + 760_000);
    await expect(html(<HybridSessionListV2 onClose={() => {}} />)).toMatchFileSnapshot(snap('list'));
    apiRef.current = mkApi(sc.onLeg, T0 + 60_000, PLAN, { label: 'מסלול + עצירות' });
    await expect(html(<HybridSessionListV2 onClose={() => {}} />)).toMatchFileSnapshot(snap('list-label'));
  });
});
