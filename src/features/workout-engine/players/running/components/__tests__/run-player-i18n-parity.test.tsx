/**
 * i18n wave 2 (player namespace, `run.*` keys): the live running players'
 * copy moves to src/messages/he/player.json. The snapshots below were
 * recorded from the components BEFORE the extraction (origin/main @ fea3d25b);
 * the extracted components must render byte-identical Hebrew markup.
 *
 * Covered statically: the v2 planned card (every card mode) + session list,
 * the v2 continuous card + its three pages (run and ride), the v2 free-run
 * laps layer + mini player, and the classic / commute pieces that are still
 * live (laps list, stats carousel slides, VS slide, commute ETA, settings-free
 * controls, invite button, lap snapshot, story bar), the elevation strip, the
 * briefing parts, the missed-workout banner and the plan-alignment popups.
 * Containers that need the real engines (FreeRunActive, FreeRunOverlay[V2],
 * PlannedRunActive, *LiveV2) and portalled drawers are pinned key by key in
 * src/lib/i18n/__tests__/player-he.test.ts.
 *
 * react-dom/server writes `<!-- -->` between adjacent text nodes; merging
 * `{a} text` into one t() call drops that comment without changing what the
 * user sees, so every snapshot is recorded with `<!-- -->` stripped.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

// ── Stores: plain objects behind a selector hook (the real stores pull Firebase in). ──
type AnyState = Record<string, unknown>;
const state = vi.hoisted(() => ({
  running: {} as Record<string, unknown>,
  session: {} as Record<string, unknown>,
  map: {} as Record<string, unknown>,
}));
function fakeStore(get: () => AnyState) {
  const hook = (sel?: (s: AnyState) => unknown) => (sel ? sel(get()) : get());
  (hook as unknown as { getState: () => AnyState }).getState = get;
  return hook;
}
vi.mock('@/features/workout-engine/players/running/store/useRunningPlayer', () => ({
  useRunningPlayer: fakeStore(() => state.running),
}));
vi.mock('@/features/workout-engine/core/store/useSessionStore', () => ({
  useSessionStore: fakeStore(() => state.session),
}));
vi.mock('@/features/parks/core/store/useMapStore', () => ({
  useMapStore: fakeStore(() => state.map),
}));
vi.mock('@/lib/firebase', () => ({ auth: { currentUser: null } }));
vi.mock('@/lib/workoutInvite', () => ({ createRunInvite: async () => ({}) }));
vi.mock('@/features/workout-engine/core/store/useSharedSession', () => ({
  useSharedSession: fakeStore(() => ({ startGroupSession: () => {} })),
}));

import PlannedLiveCardV2 from '../PlannedRun/v2/PlannedLiveCardV2';
import PlannedSessionListV2 from '../PlannedRun/v2/PlannedSessionListV2';
import ContinuousRunCardV2 from '../Continuous/v2/ContinuousRunCardV2';
import { DistancePage, MainPage, PacePage, type ContinuousCardData } from '../Continuous/v2/ContinuousPages';
import FreeRunLapsLayerV2 from '../FreeRun/v2/FreeRunLapsLayerV2';
import FreeRunMiniV2 from '../FreeRun/v2/FreeRunMiniV2';
import RunLapsList from '../FreeRun/RunLapsList';
import LapMetrics from '../FreeRun/StatsCarousel/LapMetrics';
import MainMetrics from '../FreeRun/StatsCarousel/MainMetrics';
import VSSlide from '../FreeRun/StatsCarousel/VSSlide';
import StatsCarousel from '../FreeRun/StatsCarousel';
import CommuteStatsCarousel from '../Commute/CommuteStatsCarousel';
import InviteRunButton from '../FreeRun/InviteRunButton';
import WorkoutControlCluster from '../FreeRun/WorkoutControlCluster';
import LapSnapshotOverlay from '../FreeRun/LapSnapshotOverlay';
import RunStoryBar from '../shared/RunStoryBar';
import RouteElevationAhead from '../RouteRun/v2/RouteElevationAhead';
import { RunCoachTip, RunSurfaceTiles, RunZoneLadder } from '../preview-v2/RunBriefingParts';
import MissedWorkoutBanner from '../MissedWorkoutBanner';
import { PlanRealignPopup, RebuildPopup } from '../PlanAlignmentPopup';
import { repNumbers, type PlannedBlockRecord } from '../../lib/planned-rep-results';
import type { PlannedRunEngine } from '../../hooks/usePlannedRunEngine';
import type { RunBlock } from '../../types/run-block.type';
import type { Lap } from '@/features/workout-engine/core/types/session.types';

const strip = (h: string) => h.replace(/<!-- -->/g, '');
const html = (el: ReactElement) => strip(renderToStaticMarkup(el));
const snap = (name: string) => `./__snapshots__/run-player-i18n/${name}.html`;
const noop = () => {};

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19T08:40:00')); });
afterAll(() => { vi.useRealTimers(); });

// ── Planned (intervals) fixtures ──
let n = 0;
const blk = (over: Partial<RunBlock>): RunBlock => ({ id: `b${++n}`, type: 'run', label: 'ריצה', colorHex: '#000', ...over });
function intervalBlocks(): RunBlock[] {
  n = 0;
  const blocks: RunBlock[] = [blk({ type: 'warmup', label: 'חימום', durationSeconds: 600, zoneType: 'easy', _isDynamicWrapper: true })];
  for (let i = 0; i < 4; i++) {
    blocks.push(blk({ type: 'interval', label: `400 מ׳ (${i + 1}/4)`, distanceMeters: 400, zoneType: 'interval_short' }));
    if (i < 3) blocks.push(blk({ type: 'recovery', label: 'ריצת התאוששות', durationSeconds: 90, _isSynthesizedRest: true }));
  }
  blocks.push(blk({ type: 'run', label: 'מאמץ בעלייה', durationSeconds: 60, blockMode: 'effort', effortConfig: { effortLevel: 'hard' } }));
  blocks.push(blk({ type: 'run', label: 'סטריידס', distanceMeters: 100 }));
  blocks.push(blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 480, zoneType: 'easy', _isDynamicWrapper: true }));
  return blocks;
}
const BLOCKS = intervalBlocks();
const REPS = repNumbers(BLOCKS);

function engine(i: number, over: Partial<PlannedRunEngine> = {}): PlannedRunEngine {
  return {
    currentBlock: BLOCKS[i] ?? null,
    currentBlockIndex: i,
    totalBlocks: BLOCKS.length,
    targetMinPace: 270,
    targetMaxPace: 285,
    targetZoneLabel: 'אינטרוול',
    paceStatus: 'on_target',
    paceStatusColor: '#10B981',
    blockProgress: 0.4,
    blockTimeRemaining: 54,
    blockDistanceRemaining: 212,
    showNumbers: true,
    isWorkoutComplete: false,
    zones: null,
    basePace: 330,
    profileType: 1,
    currentPaceSeconds: 279,
    currentPaceFormatted: '4:39',
    targetPaceFormatted: '4:30',
    blockMode: 'pace',
    effortLabel: '',
    ...over,
  } as PlannedRunEngine;
}
const totals = { durationSec: 1234, distanceKm: 3.456, calories: 210 };
const lastRep = { blockIndex: 1, rep: 1, durationSeconds: 92, distanceMeters: 400, avgPaceSec: 230, target: { min: 270, max: 285 } } as unknown as PlannedBlockRecord;

const card = (i: number, over: Partial<PlannedRunEngine> = {}, extra: { lastRep?: PlannedBlockRecord | null; canSkip?: boolean } = {}) =>
  html(
    <PlannedLiveCardV2 engine={engine(i, over)} blocks={BLOCKS} reps={REPS} lastRep={extra.lastRep ?? null} blockElapsedSeconds={41}
      totals={totals} canSkip={extra.canSkip ?? true} onSkip={noop} onPause={noop} onEnd={noop} onLap={noop} />,
  );

describe('PlannedLiveCardV2 — every card mode', () => {
  it('rep in pace mode, in range / fast / slow, numbers and zone name', async () => {
    const all = [
      card(1),
      card(1, { currentPaceSeconds: 250 }),
      card(1, { currentPaceSeconds: 300, showNumbers: false }),
      card(0, { currentPaceSeconds: 0 }),
    ].join('\n');
    await expect(all).toMatchFileSnapshot(snap('planned-card-pace'));
  });
  it('recovery: after rep, next rep, skip; last recovery; untimed', async () => {
    const all = [
      card(2, {}, { lastRep }),
      card(2, { showNumbers: false }, { lastRep: null, canSkip: false }),
      card(BLOCKS.length - 1, { targetMinPace: 0, targetMaxPace: 0 }),
    ].join('\n');
    await expect(all).toMatchFileSnapshot(snap('planned-card-recovery'));
  });
  it('effort + short leg', async () => {
    const all = [
      card(8, { blockMode: 'effort', effortLabel: 'מאמץ גבוה', targetMinPace: 0, targetMaxPace: 0 }),
      card(8, { blockMode: 'effort', effortLabel: '', targetMinPace: 0, targetMaxPace: 0 }),
      card(9),
    ].join('\n');
    await expect(all).toMatchFileSnapshot(snap('planned-card-effort-short'));
  });
});

describe('PlannedSessionListV2', () => {
  const resolve = (b: RunBlock) => (b.type === 'interval' ? { min: 270, max: 285 } : { min: 0, max: 0 });
  const records = new Map<number, PlannedBlockRecord>([
    [0, { blockIndex: 0, rep: 0, durationSeconds: 600, distanceMeters: 1800, avgPaceSec: 333 } as unknown as PlannedBlockRecord],
    [1, { ...lastRep }],
  ]);
  it('mid-session (recovery → the next rep carries the countdown) + reps without data', async () => {
    const all = [
      html(<PlannedSessionListV2 title="אינטרוולים" blocks={BLOCKS} currentBlockIndex={2} records={records} reps={REPS} resolveTarget={resolve}
        showNumbers currentRemaining="0:54" totals={totals} onJumpToBlock={noop} onClose={noop} />),
      html(<PlannedSessionListV2 title="אינטרוולים" blocks={BLOCKS} currentBlockIndex={0} records={new Map()} reps={REPS} resolveTarget={resolve}
        showNumbers={false} currentRemaining="9:00" totals={{ durationSec: 0, distanceKm: 0 }} onJumpToBlock={noop} onClose={noop} />),
    ].join('\n');
    await expect(all).toMatchFileSnapshot(snap('planned-session-list'));
  });
  it('a steady plan (no reps), one block per section', async () => {
    n = 100;
    const steady = [
      blk({ type: 'warmup', label: 'חימום', durationSeconds: 300, _isDynamicWrapper: true }),
      blk({ type: 'run', label: 'טמפו', durationSeconds: 1200, zoneType: 'tempo' }),
      blk({ type: 'run', label: 'טמפו', durationSeconds: 600, zoneType: 'tempo' }),
    ];
    await expect(html(
      <PlannedSessionListV2 title="טמפו" blocks={steady} currentBlockIndex={1} records={new Map()} reps={repNumbers(steady)}
        resolveTarget={() => ({ min: 290, max: 300 })} showNumbers currentRemaining="12:00" totals={totals} onJumpToBlock={noop} onClose={noop} />,
    )).toMatchFileSnapshot(snap('planned-session-list-steady'));
  });
});

// ── Continuous ──
const zone = { minSec: 330, maxSec: 360, label: 'ריצה קלה', showNumbers: true };
const tracking = { status: 'in' as const, rollingPaceSec: 345, inZonePct: 87 };
const data = (over: Partial<ContinuousCardData> = {}): ContinuousCardData => ({
  heroKind: 'distance', heroSeconds: 1234, heroKm: 3.456, zone, tracking, currentPaceSec: 345, showLivePace: true,
  totals, plannedKm: 5.2, shortLegRemaining: null, ...over,
});

describe('Continuous v2', () => {
  it('card: with next + skip, and without', async () => {
    const all = [
      html(<ContinuousRunCardV2 data={data()} next={{ label: 'ריצה קלה', meta: '35:00', color: '#65a30d' }} canSkip onSkip={noop}
        isPaused={false} onPause={noop} onResume={noop} onLap={noop} onStop={noop} />),
      html(<ContinuousRunCardV2 data={data({ metric: 'speed' })} next={{ label: 'שחרור', meta: '', color: '#65a30d' }}
        isPaused onPause={noop} onResume={noop} onLap={noop} onStop={noop} />),
    ].join('\n');
    await expect(all).toMatchFileSnapshot(snap('continuous-card'));
  });
  it('pages: run / ride / time hero / short leg / hidden numbers / no zone', async () => {
    const variants = [
      data(),
      data({ heroKind: 'time', zone: { ...zone, showNumbers: false }, tracking: { status: 'fast', rollingPaceSec: 300, inZonePct: null } }),
      data({ showLivePace: false, shortLegRemaining: '212 מ׳', tracking: { status: 'slow', rollingPaceSec: 400, inZonePct: 40 } }),
      data({ metric: 'speed', zone: null, plannedKm: null }),
    ];
    const all = variants.flatMap((d) => [html(<MainPage d={d} />), html(<PacePage d={d} />), html(<DistancePage d={d} />)]).join('\n');
    await expect(all).toMatchFileSnapshot(snap('continuous-pages'));
  });
});

// ── Free run ──
const laps: Lap[] = [
  { id: 'l1', lapNumber: 1, distanceMeters: 1000, durationSeconds: 330, splitPace: 5.5, isActive: false },
  { id: 'l2', lapNumber: 2, distanceMeters: 380, durationSeconds: 120, splitPace: 5.2, isActive: true },
];
function runState(over: Record<string, unknown> = {}) {
  state.running = {
    totalCalories: 210, currentPace: 5.5, laps, activityType: 'running', sessionGoal: null, commuteContext: null,
    lastPosition: null, settings: {}, isSnapshotVisible: false, lastCompletedLap: null, hideSnapshot: noop,
    triggerLap: noop, finishWorkout: async () => {}, ...over,
  };
  state.session = { totalDistance: 3.456, totalDuration: 1234, status: 'active', pauseSession: noop, resumeSession: noop };
  state.map = { selectedParticipantUid: null, groupParticipants: [] };
}

describe('Free run v2 (laps layer + mini)', () => {
  it('laps layer: run with laps, empty, ride', async () => {
    runState();
    const a = html(<FreeRunLapsLayerV2 onClose={noop} />);
    runState({ laps: [] });
    const b = html(<FreeRunLapsLayerV2 onClose={noop} />);
    runState({ activityType: 'cycling' });
    const c = html(<FreeRunLapsLayerV2 onClose={noop} />);
    runState({ activityType: 'cycling', laps: [] });
    const d = html(<FreeRunLapsLayerV2 onClose={noop} />);
    await expect([a, b, c, d].join('\n')).toMatchFileSnapshot(snap('free-laps-layer'));
  });
  it('mini: no goal, distance goal, time goal reached, ride', async () => {
    runState();
    const a = html(<FreeRunMiniV2 onExpand={noop} height={66} />);
    runState({ sessionGoal: { type: 'distance', value: 5 } });
    const b = html(<FreeRunMiniV2 onExpand={noop} height={66} />);
    runState({ sessionGoal: { type: 'time', value: 600 } });
    const c = html(<FreeRunMiniV2 onExpand={noop} height={66} />);
    runState({ activityType: 'cycling', sessionGoal: { type: 'time', value: 3600 } });
    const d = html(<FreeRunMiniV2 onExpand={noop} height={66} />);
    await expect([a, b, c, d].join('\n')).toMatchFileSnapshot(snap('free-mini'));
  });
});

describe('Free run classic / commute pieces', () => {
  it('laps list (live store, static prop, empty)', async () => {
    runState();
    const a = html(<RunLapsList />);
    const b = html(<RunLapsList laps={laps} />);
    const c = html(<RunLapsList laps={[]} />);
    await expect([a, b, c].join('\n')).toMatchFileSnapshot(snap('laps-list'));
  });
  it('stats carousel + slides', async () => {
    runState();
    const a = html(<StatsCarousel />);
    runState({ sessionGoal: { type: 'distance', value: 5 } });
    const b = html(<MainMetrics />);
    runState({ laps: [] });
    const c = html(<LapMetrics />);
    await expect([a, b, c].join('\n')).toMatchFileSnapshot(snap('stats-carousel'));
  });
  it('VS slide: no rival, leading, behind', async () => {
    runState();
    const a = html(<VSSlide />);
    const rival = (distanceKm: number) => ({ uid: 'u2', name: 'דנה כהן', distanceKm, pace: '5:10', color: '#f59e0b', personaImageUrl: undefined });
    state.map = { selectedParticipantUid: 'u2', groupParticipants: [rival(3.2)] };
    const b = html(<VSSlide />);
    state.map = { selectedParticipantUid: 'u2', groupParticipants: [rival(3.9)] };
    state.running = { ...state.running, currentPace: 0 };
    const c = html(<VSSlide />);
    await expect([a, b, c].join('\n')).toMatchFileSnapshot(snap('vs-slide'));
  });
  it('commute ETA: no fix yet, en route', async () => {
    runState({ commuteContext: { label: 'עבודה', destination: { lat: 32.09, lng: 34.79 } } });
    const a = html(<CommuteStatsCarousel />);
    runState({ commuteContext: { label: 'בית הספר היסודי על שם יצחק רבין', destination: { lat: 32.09, lng: 34.79 } }, lastPosition: { lat: 32.08, lng: 34.78 } });
    const b = html(<CommuteStatsCarousel />);
    await expect([a, b].join('\n')).toMatchFileSnapshot(snap('commute'));
  });
  it('controls, invite, lap snapshot, story bar', async () => {
    runState({ isSnapshotVisible: true, lastCompletedLap: laps[0] });
    const all = [
      html(<WorkoutControlCluster />),
      (state.session = { ...state.session, status: 'paused' }, html(<WorkoutControlCluster />)),
      html(<InviteRunButton />),
      html(<InviteRunButton activityType="walking" inline />),
      html(<LapSnapshotOverlay />),
      (state.map = { selectedParticipantUid: null, activeStoryIndex: 0, setActiveStoryIndex: noop, groupParticipants: [] }, html(<RunStoryBar />)),
      (state.map = { selectedParticipantUid: 'u2', activeStoryIndex: 2, setActiveStoryIndex: noop,
        groupParticipants: [{ uid: 'u2', name: 'דנה', distanceKm: 3.2, color: '#f59e0b' }] }, html(<RunStoryBar />)),
      (state.map = { selectedParticipantUid: 'u2', activeStoryIndex: 2, setActiveStoryIndex: noop,
        groupParticipants: [{ uid: 'u2', name: 'דנה', distanceKm: 3.9, color: '#f59e0b' }] }, html(<RunStoryBar isPaused />)),
    ].join('\n');
    await expect(all).toMatchFileSnapshot(snap('controls'));
  });
});

describe('Shared parts', () => {
  it('elevation strip ahead', async () => {
    const samples = { stepM: 100, elevationsM: Array.from({ length: 41 }, (_, i) => (i > 10 && i < 20 ? 10 + (i - 10) * 4 : 10)) };
    const all = [
      html(<RouteElevationAhead samples={samples} alongM={500} totalM={4000} />),
      html(<RouteElevationAhead samples={samples} alongM={1050} totalM={4000} />),
      html(<RouteElevationAhead samples={samples} alongM={3500} totalM={4000} />),
    ].join('\n');
    await expect(all).toMatchFileSnapshot(snap('elevation-ahead'));
  });
  it('briefing parts', async () => {
    const all = [
      html(<RunZoneLadder items={[{ rung: 1, label: 'קל', pace: '6:00', color: '#65a30d', active: true }, { rung: 2, label: 'טמפו', pace: '5:00', color: '#f59e0b', active: false }] as never} />),
      html(<RunCoachTip text="קצב שיחה" />),
      html(<RunSurfaceTiles tiles={[{ id: 'track', icon: 'track', label: 'מסלול', tip: 'מדויק' }] as never} />),
    ].join('\n');
    await expect(all).toMatchFileSnapshot(snap('briefing-parts'));
  });
  it('missed-workout banner + plan-alignment popups', async () => {
    const all = [
      html(<MissedWorkoutBanner onDoIt={noop} onContinue={noop} />),
      html(<PlanRealignPopup open onClose={noop} onContinue={noop} onBackOneWeek={noop} onReset={noop} />),
      html(<RebuildPopup open onClose={noop} onRebuild={noop} onContinue={noop} />),
    ].join('\n');
    await expect(all).toMatchFileSnapshot(snap('alignment'));
  });
});
