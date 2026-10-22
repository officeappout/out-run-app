/**
 * i18n wave 2 batch aa (namespace `library`, keys `preview.*`): the strength workout preview drawer —
 * its footer / sticky header / location switcher, the generated exercise list with its section headers,
 * exercise + pyramid-step cards, the timed-block (AMRAP / EMOM / tabata, enable_home_v2) header + meta,
 * and the pure helpers that build their lines (timed-preview.utils, exercise-display.utils).
 * The snapshots below were recorded BEFORE the extraction from unmodified origin/main.
 *
 * Static markup (react-dom/server, node env). `<!-- -->` is stripped before comparing (react-dom/server's
 * separator between adjacent text nodes — `{n} סבבים` is two nodes before, one `t()` string after; not
 * rendered text). The drawer shell itself (WorkoutPreviewDrawer: hero close, intensity toggle, the nearby
 * parks carousel), the exercise-detail sheet's aria-label and the share text (useFavoritesActions) render
 * inside a portal sheet / a click handler — those keys are pinned by the key test
 * (src/lib/i18n/__tests__/library-preview-he.test.ts).
 */
import { describe, expect, it, vi, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';
import { motionValue } from 'framer-motion';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('@/features/workout-engine/components/ShareAsLiveToggle', () => ({
  default: () => <div data-stub="share-as-live" />,
}));
vi.mock('@/features/workout-engine/components/CoachNoteBlock', () => ({
  default: () => null,
  useCoachNote: () => '',
}));
vi.mock('@/features/favorites/hooks/useCachedMedia', () => ({
  useCachedMediaMap: () => new Map<string, string>(),
  useCachedMediaUrl: (u: string | null) => u,
}));
vi.mock('@/features/workout-engine/players/strength/timed/components/TimedFormatInfoSheet', () => ({
  default: () => null,
}));
const userState = vi.hoisted(() => ({ profile: null as unknown }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel: (s: { profile: unknown }) => unknown) => sel(userState),
}));

import { HomeV2Context } from '@/features/home/context/HomeV2Context';
import DrawerFooter from '../components/DrawerFooter';
import DrawerHeader from '../components/DrawerHeader';
import WorkoutLocationSwitcher from '../components/WorkoutLocationSwitcher';
import SectionHeader from '../components/exercise-list/SectionHeader';
import ExerciseCard from '../components/exercise-list/ExerciseCard';
import PyramidStepCard from '../components/exercise-list/PyramidStepCard';
import TimedSectionHeader from '../components/exercise-list/TimedSectionHeader';
import TimedPreviewStrips, { TimedPreviewMeta } from '../components/exercise-list/TimedPreviewOverview';
import GeneratedWorkoutExerciseList from '../components/exercise-list/GeneratedWorkoutExerciseList';
import {
  blockHeaderModel,
  blockItemLine,
  previewMeta,
  previewTimedModel,
} from '../utils/timed-preview.utils';
import { buildExerciseVolumeLabel } from '../utils/exercise-display.utils';
import type { TimedBlockSpec } from '@/features/workout-engine/engines/timed/timed.types';
import { makeT } from '@/lib/i18n/t';
import { library } from '@/messages/ns/library';

// The helpers take the caller's translator since the extraction (commit 2); the snapshots are unchanged.
const tLib = makeT('he', library);

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/preview-drawer-i18n/${name}.html`;
const txt = (name: string) => `./__snapshots__/preview-drawer-i18n/${name}.json`;
const noop = () => {};
const withV2 = (v2: boolean, el: ReactElement) => <HomeV2Context.Provider value={v2}>{el}</HomeV2Context.Provider>;

const NOW = new Date(2026, 9, 19, 9, 41);
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

// ── fixtures ────────────────────────────────────────────────────────────────

const ex = (id: string, role: string, extra: Record<string, unknown> = {}) =>
  ({
    exercise: { id, name: `תרגיל ${id}`, ...((extra.exercise as object) ?? {}) },
    sets: 3,
    reps: 12,
    isTimeBased: false,
    exerciseRole: role,
    ...Object.fromEntries(Object.entries(extra).filter(([k]) => k !== 'exercise')),
  }) as never;

const gw = (over: Record<string, unknown> = {}) =>
  ({
    id: 'gw1',
    title: 'אימון בדיקה',
    description: 'תיאור',
    structure: 'standard',
    difficulty: 2,
    estimatedDuration: 14,
    exercises: [
      ex('w1', 'warmup', { sets: 1 }),
      ex('w2', 'warmup', { sets: 1, isTimeBased: true, reps: 30 }),
      ex('a', 'main', { pairedWith: 'b', method: { gearIds: ['pullup_bar'] }, exercise: { primaryMuscle: 'back' } }),
      ex('b', 'main', { pairedWith: 'a', reps: 10, exercise: { symmetry: 'unilateral' } }),
      ex('c', 'main', { repsRange: { min: 8, max: 12 } }),
      ex('d', 'main', { isGoalExercise: true, dimensionUnavailable: true, formattedRepRange: '6-8 חזרות' }),
      ex('c1', 'cooldown', { sets: 1 }),
    ],
    ...over,
  }) as never;

const tabataGw = () =>
  gw({
    tabataBlock: { config: { workSec: 20, restSec: 10, rounds: 8 }, exerciseIds: ['t1', 't2'] },
    exercises: [
      ex('a', 'main'),
      ex('t1', 'main', { protocolBlock: 'tabata', isTimeBased: true, reps: 20 }),
      ex('t2', 'main', { protocolBlock: 'tabata', isTimeBased: true, reps: 20, exercise: { symmetry: 'unilateral' } }),
    ],
  });

const actions = (over: Record<string, unknown> = {}) => ({
  isFav: false,
  isFavToggling: false,
  isFavDownloading: false,
  isFavDownloaded: false,
  downloadProgress: 0,
  isSharing: false,
  onToggleFavorite: noop,
  onShare: noop,
  onDownload: noop,
  ...over,
});

const listProps = (generatedWorkout: never, over: Record<string, unknown> = {}) => ({
  generatedWorkout,
  exercisePool: [],
  isWarmupExpanded: true,
  isWarmupActive: true,
  onToggleWarmupExpanded: noop,
  onToggleWarmupActive: noop,
  actions: actions(),
  ...over,
});

// ── footer / header / location ─────────────────────────────────────────────

describe('DrawerFooter', () => {
  it.each([false, true])('online, partners, edit, audio on (v2=%s)', async (v2) => {
    await expect(
      html(
        withV2(
          v2,
          <DrawerFooter
            similarCount={1234}
            onOpenLivePartners={noop}
            workoutTitleForPresence="אימון"
            userLocation={null}
            isOnline
            isFavDownloaded={false}
            onStart={noop}
            onEditEntry={noop}
            isAudioEnabled
            onToggleAudio={noop}
          />,
        ),
      ),
    ).toMatchFileSnapshot(snap(`footer-online-v${v2 ? 2 : 1}`));
  });

  it('offline, no partners, no edit, audio off', async () => {
    await expect(
      html(
        <DrawerFooter
          similarCount={0}
          onOpenLivePartners={noop}
          workoutTitleForPresence="אימון"
          userLocation={null}
          isOnline={false}
          isFavDownloaded={false}
          onStart={noop}
          isAudioEnabled={false}
          onToggleAudio={noop}
        />,
      ),
    ).toMatchFileSnapshot(snap('footer-offline'));
  });
});

describe('DrawerHeader', () => {
  it.each([false, true])('with edit (v2=%s)', async (v2) => {
    await expect(
      html(<DrawerHeader headerOpacity={motionValue(1)} displayTitle="אימון" onClose={noop} onEditEntry={noop} v2={v2} />),
    ).toMatchFileSnapshot(snap(`header-v${v2 ? 2 : 1}`));
  });
});

describe('WorkoutLocationSwitcher', () => {
  it.each([false, true])('swapping=%s', async (isSwapping) => {
    await expect(
      html(<WorkoutLocationSwitcher currentLocation="park" isSwapping={isSwapping} onSwap={noop} />),
    ).toMatchFileSnapshot(snap(`location-${isSwapping ? 'swapping' : 'idle'}`));
  });
});

// ── section headers ────────────────────────────────────────────────────────

const section = (id: string, title: string, rounds: number, n: number, uni = 0) => ({
  id,
  title,
  rounds,
  exercises: Array.from({ length: n }, (_, i) =>
    ex(`s${i}`, 'main', i < uni ? { exercise: { symmetry: 'unilateral' } } : {}),
  ),
});

const headerBase = {
  isWarmup: false,
  isSuperset: false,
  isPyramidSection: false,
  isWarmupActive: true,
  isWarmupExpanded: true,
  onToggleWarmupExpanded: noop,
  onToggleWarmupActive: noop,
};

describe('SectionHeader', () => {
  const tabata = (rounds: number) => ({ workSec: 20, restSec: 10, rounds }) as never;
  it.each([
    ['tabata-1ex-8cycles', section('tabata', 'טבטה', 8, 1), tabata(8)],
    ['tabata-8ex-1cycle', section('tabata', 'טבטה', 8, 8), tabata(8)],
    ['tabata-3ex-intervals', section('tabata', 'טבטה', 8, 3), tabata(8)],
    ['tabata-2ex-uni-2cycles', section('tabata', 'טבטה', 8, 3, 1), tabata(8)],
  ] as const)('%s', async (name, s, cfg) => {
    await expect(html(<SectionHeader {...headerBase} section={s as never} tabataConfig={cfg} />)).toMatchFileSnapshot(
      snap(`section-${name}`),
    );
  });

  it.each([
    [true, true],
    [true, false],
    [false, false],
  ])('warmup active=%s expanded=%s', async (active, expanded) => {
    await expect(
      html(
        <SectionHeader
          {...headerBase}
          section={section('warmup', 'חימום', 1, 3) as never}
          isWarmup
          isWarmupActive={active}
          isWarmupExpanded={expanded}
        />,
      ),
    ).toMatchFileSnapshot(snap(`section-warmup-${active ? 'on' : 'off'}-${expanded ? 'open' : 'closed'}`));
  });

  it('warmup with the outer toggle (hybrid)', async () => {
    await expect(
      html(<SectionHeader {...headerBase} section={section('warmup', 'חימום', 1, 2) as never} isWarmup hideExpandToggle />),
    ).toMatchFileSnapshot(snap('section-warmup-hidetoggle'));
  });

  it.each([
    ['superset', { isSuperset: true }],
    ['pyramid', { isPyramidSection: true }],
    ['straight', {}],
  ] as const)('standard %s', async (name, flags) => {
    await expect(
      html(<SectionHeader {...headerBase} {...flags} section={section(`${name}-0`, 'סט רגיל', 3, 2) as never} />),
    ).toMatchFileSnapshot(snap(`section-${name}`));
  });
});

// ── cards ──────────────────────────────────────────────────────────────────

describe('ExerciseCard', () => {
  const cases: Array<[string, Record<string, unknown>, string?]> = [
    ['reps', {}],
    ['reps-uni', { exercise: { symmetry: 'unilateral' } }],
    ['range-uni', { repsRange: { min: 8, max: 12 }, exercise: { symmetry: 'unilateral' } }],
    ['range-time', { repsRange: { min: 20, max: 40 }, isTimeBased: true }],
    ['time-uni', { isTimeBased: true, reps: 30, exercise: { symmetry: 'unilateral' } }],
    ['formatted-goal-station', { formattedRepRange: '6-8 חזרות', isGoalExercise: true, dimensionUnavailable: true }],
    ['override', {}, "20 שנ' לכל צד"],
  ];
  it.each(cases)('%s', async (name, extra, volumeOverride) => {
    for (const v2 of [false, true]) {
      await expect(
        html(
          withV2(
            v2,
            <ExerciseCard exercise={ex('x', 'main', extra)} cachedImageUrl="/i.png" isSuperset={false} volumeOverride={volumeOverride} />,
          ),
        ),
      ).toMatchFileSnapshot(snap(`card-${name}-v${v2 ? 2 : 1}`));
    }
  });
});

describe('PyramidStepCard', () => {
  const step = (over: Record<string, unknown>) => ({ exerciseId: 'p', name: 'שלב', ...over }) as never;
  it.each([
    ['reps-goal', step({ targetReps: 6 }), true, ' (לכל צד)'],
    ['hold', step({ targetHold: 20 }), false, ''],
    ['no-target', step({}), false, ' (לכל צד)'],
  ] as const)('%s', async (name, s, isGoal, uniLabel) => {
    await expect(
      html(
        <PyramidStepCard
          parentEx={ex('p', 'main')}
          step={s}
          stepIdx={0}
          cachedImageUrl="/i.png"
          isSuperset={false}
          isGoal={isGoal}
          uniLabel={uniLabel}
          parentName="הורה"
        />,
      ),
    ).toMatchFileSnapshot(snap(`step-${name}`));
  });
});

// ── timed block (enable_home_v2) ───────────────────────────────────────────

const item = (key: string, over: Record<string, unknown> = {}) => ({ kind: 'exercise', key, name: key, ...over });
const SPECS: Record<string, TimedBlockSpec> = {
  amrap: { format: 'amrap', config: { capSec: 360 } as never, items: [item('a', { targetReps: 12 }), item('b', { targetHoldSec: 30, isUnilateral: true }), item('c')] as never },
  emom1: { format: 'emom', config: { intervalSec: 60, totalIntervals: 10 } as never, items: [item('a', { targetReps: 8 })] as never },
  emom2: { format: 'emom', config: { intervalSec: 90, totalIntervals: 12 } as never, items: [item('a', { targetReps: 8 }), item('b')] as never },
  emom3: { format: 'emom', config: { intervalSec: 60, totalIntervals: 12 } as never, items: [item('a', { targetReps: 8, isUnilateral: true }), item('b'), item('c')] as never },
  tabata: { format: 'tabata', config: { workSec: 20, restSec: 10, rounds: 8 } as never, items: [item('a'), item('b', { isUnilateral: true })] as never },
};

describe('timed block header', () => {
  it.each(Object.keys(SPECS))('%s', async (k) => {
    await expect(html(<TimedSectionHeader spec={SPECS[k]} />)).toMatchFileSnapshot(snap(`timed-header-${k}`));
  });

  it('meta + strips', async () => {
    const w = gw({ structure: 'amrap' });
    const m = previewTimedModel(w)!;
    await expect(html(<><TimedPreviewMeta workout={w} /><TimedPreviewStrips workout={w} model={m} /></>)).toMatchFileSnapshot(
      snap('timed-meta-strips'),
    );
  });
});

describe('pure helpers (text output)', () => {
  it('timed-preview.utils lines', async () => {
    const out: Record<string, unknown> = {};
    for (const [k, spec] of Object.entries(SPECS)) {
      out[k] = {
        header: blockHeaderModel(spec, tLib),
        items: spec.items.map((_, i) => blockItemLine(spec, i, tLib)),
        outOfRange: blockItemLine(spec, 99, tLib),
      };
    }
    out.meta1 = previewMeta(gw({ exercises: [ex('a', 'main')], estimatedDuration: 0 }), NOW, tLib);
    out.meta7 = previewMeta(gw(), new Date(2026, 9, 19, 23, 55), tLib);
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot(txt('timed-utils'));
  });

  it('exercise-display volume labels', async () => {
    const out = [
      buildExerciseVolumeLabel(ex('a', 'main'), '', tLib),
      buildExerciseVolumeLabel(ex('a', 'main'), ' (לכל צד)', tLib),
      buildExerciseVolumeLabel(ex('a', 'main', { isTimeBased: true, reps: 45 }), ' (לכל צד)', tLib),
      buildExerciseVolumeLabel(ex('a', 'main', { repsRange: { min: 8, max: 12 } }), ' (לכל צד)', tLib),
      buildExerciseVolumeLabel(ex('a', 'main', { repsRange: { min: 20, max: 40 }, isTimeBased: true }), '', tLib),
      buildExerciseVolumeLabel(ex('a', 'main', { repsRange: { min: 10, max: 10 } }), '', tLib),
      buildExerciseVolumeLabel(ex('a', 'main', { formattedRepRange: '6-8 חזרות' }), ' (לכל צד)', tLib),
    ];
    await expect(JSON.stringify(out, null, 2)).toMatchFileSnapshot(txt('volume-labels'));
  });
});

// ── the whole generated list ───────────────────────────────────────────────

describe('GeneratedWorkoutExerciseList', () => {
  it.each([false, true])('classic workout (v2=%s)', async (v2) => {
    await expect(html(withV2(v2, <GeneratedWorkoutExerciseList {...listProps(gw())} />))).toMatchFileSnapshot(
      snap(`list-classic-v${v2 ? 2 : 1}`),
    );
  });

  it('classic, favourite on, warmup skipped, pills hidden', async () => {
    await expect(
      html(
        withV2(
          true,
          <GeneratedWorkoutExerciseList
            {...listProps(gw(), { isWarmupActive: false, hideStatPills: true, actions: actions({ isFav: true, isFavDownloaded: true }) })}
          />,
        ),
      ),
    ).toMatchFileSnapshot(snap('list-classic-fav'));
  });

  it.each([false, true])('tabata finisher (v2=%s)', async (v2) => {
    await expect(html(withV2(v2, <GeneratedWorkoutExerciseList {...listProps(tabataGw())} />))).toMatchFileSnapshot(
      snap(`list-tabata-v${v2 ? 2 : 1}`),
    );
  });

  it.each(['amrap', 'emom'])('timed main %s (v2)', async (structure) => {
    await expect(
      html(withV2(true, <GeneratedWorkoutExerciseList {...listProps(gw({ structure }))} />)),
    ).toMatchFileSnapshot(snap(`list-${structure}`));
  });

  it('pyramid section', async () => {
    const w = gw({
      exercises: [
        ex('p', 'main', {
          pyramidSequence: [
            { exerciseId: 'p', name: 'שלב 1', targetReps: 5 },
            { exerciseId: 'p', name: 'שלב 2', targetHold: 15 },
          ],
          exercise: { symmetry: 'unilateral' },
        }),
      ],
    });
    await expect(html(withV2(true, <GeneratedWorkoutExerciseList {...listProps(w)} />))).toMatchFileSnapshot(
      snap('list-pyramid'),
    );
  });
});
