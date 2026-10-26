/**
 * i18n wave 2 (namespace `player`, batch ap): the strength player's rest / data-entry views.
 * Snapshots recorded BEFORE the extraction from unmodified origin/main (v1 and v2 styling, male / female / other).
 * Static markup (react-dom/server, node env); `<!-- -->` stripped before comparing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ComponentProps, ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('../hooks/useStrengthDrawerV1', () => ({ useStrengthDrawerV1: () => false }));
vi.mock('@lottiefiles/dotlottie-react', () => ({ DotLottieReact: () => null, setWasmUrl: () => {} }));

import RestScreen from '../components/RestScreen';
import LogDrawerContent from '../components/LogDrawerContent';
import InputStateView from '../components/InputStateView';
import FindEquipmentOverlay from '../components/FindEquipmentOverlay';
import ExitConfirmModal from '../components/ExitConfirmModal';
import ResumeWorkoutDialog from '../components/ResumeWorkoutDialog';
import PauseOverlay from '../components/PauseOverlay';
import FillingButton from '../components/FillingButton';
import PreparingStateView from '../components/PreparingStateView';
import DemoGateOverlay from '../components/DemoGateOverlay';
import RunnerHeader from '../components/RunnerHeader';
import SetPillsGrid from '../playlist/SetPillsGrid';
import RestProgressBar from '../playlist/blocks/RestProgressBar';
import WorkoutBlockCard from '../playlist/WorkoutBlockCard';
import WorkoutPlaylist from '../playlist/WorkoutPlaylist';
import SupersetBlockGroup from '../playlist/blocks/SupersetBlockGroup';
import TabataBlockGroup from '../playlist/blocks/TabataBlockGroup';
import StrengthExerciseCard from '../playlist/blocks/StrengthExerciseCard';
import ActiveExerciseView from '../components/ActiveExerciseView';
import IsometricTimerCard from '../components/IsometricTimerCard';
import TimedClockCard from '../timed/components/TimedClockCard';
import TimedDoneCard from '../timed/components/TimedDoneCard';
import TimedHeader from '../timed/components/TimedHeader';
import TimedReadyCard from '../timed/components/TimedReadyCard';
import TimedRepsPanel from '../timed/components/TimedRepsPanel';
import TimedSessionList from '../timed/components/TimedSessionList';
import TimedWorkCard from '../timed/components/TimedWorkCard';
import ExerciseDetailContent from '../components/ExerciseDetailContent';
import ExerciseVideoPlayer from '../components/ExerciseVideoPlayer';
import SessionListLayer from '../../shared/v2/SessionListLayer';
import PlayerControls from '../../shared/v2/PlayerControls';
import RestingStateView from '../components/RestingStateView';
import DataEntryModal from '../playlist/DataEntryModal';
import { StrengthPlayerV2Provider } from '../context/StrengthPlayerV2Context';
import { useLocaleStore } from '@/store/useLocaleStore';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/strength-player-i18n/${name}.html`;
const noop = () => {};
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const withV2 = (v2: boolean, el: ReactElement) => <StrengthPlayerV2Provider value={v2}>{el}</StrengthPlayerV2Provider>;

beforeEach(() => {
  Object.assign(useLocaleStore.getInitialState(), { gender: 'other' });
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const next: any = { name: 'מתח', imageUrl: null, bunnyVideoId: null, videoUrl: null, exerciseType: 'reps', reps: '10 חזרות', duration: '', notificationText: 'הכינו משקולת' };

describe('RestScreen / RestingStateView', () => {
  it.each([false, true])('rest screen, v2=%s', async (v2) => {
    const out = [
      html(withV2(v2, <RestScreen restTimeLeft={30} formatTime={fmt} nextExercise={next} fadeIn isPaused={false} videoKey="k" onSkip={noop} onExtend={noop} />)),
      html(withV2(v2, <RestScreen restTimeLeft={2} formatTime={fmt} nextExercise={{ ...next, exerciseType: 'time', duration: '30 שנ׳' }} fadeIn isPaused={false} videoKey="k" />)),
      html(withV2(v2, <RestScreen restTimeLeft={30} formatTime={fmt} nextExercise={next} fadeIn isPaused={false} videoKey="k" onSkip={noop} isLogDrawerOpen logDrawerNode={<i>x</i>} />)),
    ].join('\n\n');
    await expect(out).toMatchFileSnapshot(snap(`rest-screen-v${v2 ? 2 : 1}`));
  });
  it.each([false, true])('resting view coach hints, v2=%s', async (v2) => {
    const base = { fadeIn: true, restTimeLeft: 30, formatTime: fmt, nextExercise: next, logDrawerNode: null, isLogDrawerOpen: false, isPaused: false, currentSegmentIndex: 0, currentExerciseIndex: 0, currentRound: 1, totalRounds: 3, onSkipRest: noop, onDismissHint: noop };
    const out = [
      html(withV2(v2, <RestingStateView {...base} coachHint="fail" onSwap={noop} />)),
      html(withV2(v2, <RestingStateView {...base} coachHint="overachieve" />)),
    ].join('\n\n');
    await expect(out).toMatchFileSnapshot(snap(`resting-view-v${v2 ? 2 : 1}`));
  });
});

describe('DataEntryModal', () => {
  it('reps / unilateral / time', async () => {
    const base = { isOpen: true, onClose: noop, exerciseName: 'מתח', targetReps: 10, lastSavedReps: null, setIndex: 0, handleRepetitionSave: noop };
    const out = [
      html(<DataEntryModal {...base} exerciseType="reps" />),
      html(<DataEntryModal {...base} exerciseType="reps" isUnilateral />),
      html(<DataEntryModal {...base} exerciseType="time" />),
    ].join('\n\n');
    await expect(out).toMatchFileSnapshot(snap('data-entry'));
  });
});

const GENDERS = ['male', 'female', 'other'] as const;
const setGender = (gender: (typeof GENDERS)[number]) => Object.assign(useLocaleStore.getInitialState(), { gender });

describe('log drawer / input state', () => {
  const picker = (unitType: 'reps' | 'time') => ({ targetValue: 10, unitType, max: 30, initialValue: 10 });
  const logProps = { isDrawerStable: true, lockedAchievedRef: { current: null }, completedReps: null, repsRight: 8, repsLeft: 9, onRepsRightChange: noop, onRepsLeftChange: noop, onPickerChange: noop, repsRangeMin: 6, repsRangeMax: 12, onSaveBilateral: noop, onSaveUnilateral: noop, onSetCoachHint: noop };
  it('LogDrawerContent', async () => {
    const out = [
      html(<LogDrawerContent {...logProps} isUnilateral={false} pickerConfig={picker('reps')} onSwap={noop} />),
      html(<LogDrawerContent {...logProps} isUnilateral={false} pickerConfig={picker('time')} />),
      html(<LogDrawerContent {...logProps} isUnilateral pickerConfig={picker('reps')} />),
      html(<LogDrawerContent {...logProps} isUnilateral pickerConfig={picker('time')} />),
      html(<LogDrawerContent {...logProps} isDrawerStable={false} isUnilateral={false} pickerConfig={picker('reps')} />),
    ].join('\n\n');
    await expect(out).toMatchFileSnapshot(snap('log-drawer'));
  });
  it.each([false, true])('InputStateView, v2=%s', async (v2) => {
    const base = { activeKey: 'k', fadeIn: true, safeVideoUrl: null, exerciseId: 'e1', exerciseName: 'מתח', exerciseType: 'reps', inputRepsValue: 8, inputRepsLeft: 8, inputRepsRight: 9, onRepsChange: noop, onRepsLeftChange: noop, onRepsRightChange: noop, onSave: noop };
    const out = [
      html(withV2(v2, <InputStateView {...base} isUnilateralForInput={false} pickerConfig={picker('reps')} />)),
      html(withV2(v2, <InputStateView {...base} isUnilateralForInput={false} pickerConfig={picker('time')} />)),
      html(withV2(v2, <InputStateView {...base} isUnilateralForInput pickerConfig={picker('reps')} />)),
      html(withV2(v2, <InputStateView {...base} isUnilateralForInput pickerConfig={picker('time')} />)),
    ].join('\n\n');
    await expect(out).toMatchFileSnapshot(snap(`input-state-v${v2 ? 2 : 1}`));
  });
});

describe('dialogs and overlays', () => {
  it('FindEquipmentOverlay, every gender', async () => {
    const item = { exIdx: 0, exerciseId: 'e1', exerciseName: 'מתח', equipmentIds: ['pullup_bar'] };
    const single = { kind: 'single' as const, items: [item] };
    const tabata = { kind: 'tabata' as const, items: [item, { ...item, exIdx: 1, exerciseId: 'e2', exerciseName: 'מקבילים' }] };
    const out: string[] = [];
    for (const gender of [...GENDERS, null] as const) {
      out.push(html(<FindEquipmentOverlay screen={single} gender={gender} onFound={noop} onSwap={noop} />));
      out.push(html(<FindEquipmentOverlay screen={tabata} gender={gender} onFound={noop} onSwap={noop} />));
    }
    out.push(html(<FindEquipmentOverlay screen={single} gender="female" onFound={noop} />));
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('find-equipment'));
  });
  it('ExitConfirmModal / ResumeWorkoutDialog / PauseOverlay / DemoGateOverlay', async () => {
    const out: string[] = [html(<ExitConfirmModal isOpen onDismiss={noop} onExit={noop} />), html(<ExitConfirmModal isOpen={false} onDismiss={noop} onExit={noop} />)];
    for (const gender of GENDERS) {
      setGender(gender);
      out.push(html(<ResumeWorkoutDialog elapsedTime={1} onResume={noop} onStartOver={noop} />));
      out.push(html(<ResumeWorkoutDialog elapsedTime={1500} onResume={noop} onStartOver={noop} />));
      out.push(html(<PauseOverlay onResume={noop} onOpenExitModal={noop} />));
      out.push(html(withV2(true, <PauseOverlay onResume={noop} onOpenExitModal={noop} endLabel="סיימי את התחנה" />)));
    }
    out.push(html(<DemoGateOverlay exerciseName="מתח" cue="גב ישר" ctaLabel="צפיתי, התחל" onStart={noop} />));
    out.push(html(<DemoGateOverlay exerciseName="מתח" ctaLabel="צפיתי, התחילי" onStart={noop} />));
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('dialogs'));
  });
  it('FillingButton / PreparingStateView', async () => {
    const prep = { count: 3, safeVideoUrl: null, safeImageUrl: null, exerciseName: 'מתח', fadeIn: true };
    const out = [
      html(<FillingButton autoCompleteTime={10} onClick={noop} />),
      html(<FillingButton autoCompleteTime={10} onClick={noop} v2 />),
      html(<FillingButton autoCompleteTime={10} onClick={noop} label="המשך" />),
      html(<PreparingStateView {...prep} />),
      html(<PreparingStateView {...prep} aiCue="נשימה" label="מוכנים" variant="work" />),
    ].join('\n\n');
    await expect(out).toMatchFileSnapshot(snap('filling-preparing'));
  });
});

describe('playlist pieces and v2 chrome', () => {
  it('SetPillsGrid / RestProgressBar', async () => {
    const pill = (setIndex: number, status: 'completed' | 'active' | 'upcoming', over = {}) => ({ setIndex, status, targetReps: 10, loggedReps: null, isTimeBased: false, ...over });
    const out = [
      html(<SetPillsGrid onPillTap={noop} pills={[pill(0, 'completed', { loggedReps: 1 }), pill(1, 'active', { targetReps: 1 }), pill(2, 'upcoming'), pill(3, 'completed', { loggedReps: 12, loggedRepsRight: 6, loggedRepsLeft: 6 })]} />),
      html(<SetPillsGrid onPillTap={noop} pills={[pill(0, 'completed', { loggedReps: 1, isTimeBased: true, targetReps: 30 }), pill(1, 'active', { targetReps: 1, isTimeBased: true }), pill(2, 'active', { targetReps: 45, isTimeBased: true }), pill(3, 'completed', { loggedReps: 40, isTimeBased: true, loggedRepsRight: 20, loggedRepsLeft: 20 }), pill(4, 'upcoming', { isTimeBased: true })]} />),
      html(<RestProgressBar restTimeLeft={20} formatTime={fmt} totalRest={30} onSkip={noop} />),
      html(<RestProgressBar totalRest={30} />),
    ].join('\n\n');
    await expect(out).toMatchFileSnapshot(snap('playlist-pieces'));
  });
  it('SessionListLayer / PlayerControls', async () => {
    const out: string[] = [
      html(<SessionListLayer onClose={noop} subtitle="3 תרגילים" totals="18:04">x</SessionListLayer>),
      html(<SessionListLayer onClose={noop} title="רשימה">x</SessionListLayer>),
    ];
    for (const gender of GENDERS) {
      setGender(gender);
      out.push(html(<PlayerControls isPaused={false} onPause={noop} onResume={noop} onLap={noop} onStop={noop} />));
      out.push(html(<PlayerControls isPaused onPause={noop} onResume={noop} onLap={noop} onStop={noop} />));
    }
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('v2-chrome'));
  });
  it.each([false, true])('RunnerHeader, v2=%s', async (v2) => {
    const base = { progressBars: [], autoCompleteTime: 10, isPaused: false, isLogDrawerOpen: false, isResting: false, elapsedTime: 75, formatTime: fmt, totalRounds: 3, currentRound: 2, tabataInterval: null, isWarmupSegment: false, isCooldownSegment: false, currentExLoggedReps: [10, null, null], firstIncompleteSetIdx: 1, restPreviewExercise: { name: 'מתח', equipment: ['pullup_bar'] }, isNextPartnerExercise: false, supersetPartnerName: null, onPointerDown: noop, onMinimize: noop, onTogglePause: noop };
    const out: string[] = [];
    for (const gender of GENDERS) {
      setGender(gender);
      out.push(html(withV2(v2, <RunnerHeader {...base} />)));
    }
    out.push(html(withV2(v2, <RunnerHeader {...base} isPaused />)));
    out.push(html(withV2(v2, <RunnerHeader {...base} isLogDrawerOpen />)));
    out.push(html(withV2(v2, <RunnerHeader {...base} isResting isNextPartnerExercise supersetPartnerName="מקבילים" />)));
    out.push(html(withV2(v2, <RunnerHeader {...base} tabataInterval={{ current: 2, total: 8 }} />)));
    out.push(html(withV2(v2, <RunnerHeader {...base} isResting tabataInterval={{ current: 8, total: 8 }} />)));
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`runner-header-v${v2 ? 2 : 1}`));
  });
});

describe('playlist cards', () => {
  const entry = (id: string, over: Record<string, unknown> = {}) => ({
    exerciseId: id, exerciseName: `תרגיל ${id}`, imageUrl: null, sets: 3, repsText: '3 × 10', exerciseType: 'reps' as const, targetReps: 10,
    status: 'active' as const, currentSetIndex: 1, loggedReps: [10, null, null], restRestDuration: 30, restDuration: 30, onPillTap: noop, ...over,
  });
  const seq = [{ name: 'שלב א', targetReps: 12 }, { name: 'שלב ב', targetHold: 20 }];
  it('WorkoutBlockCard', async () => {
    const card = (over: Record<string, unknown>) => html(<WorkoutBlockCard exercises={[entry('a')]} segmentTitle="" cardStatus="active" activeExerciseIndex={0} isResting={false} isSuperSet={false} {...over} />);
    const two = [entry('a'), entry('b', { status: 'upcoming' })];
    const out = [
      card({ segmentTitle: 'חימום', exerciseRole: 'warmup', exercises: [entry('a', { onDirectComplete: noop, sets: 1, loggedReps: [null] }), entry('b', { status: 'completed', onDirectComplete: noop, sets: 1, loggedReps: [10] })] }),
      card({ segmentTitle: 'שחרור', exerciseRole: 'cooldown', cardStatus: 'upcoming', exercises: [entry('a', { onDirectComplete: noop, status: 'upcoming' })] }),
      card({ exercises: two, isSuperSet: true }),
      card({ exercises: two, segmentTitle: 'סבב כוח' }),
      card({ exercises: two }),
      card({}),
      card({ exercises: [entry('a', { sets: 1 })] }),
      card({ exercises: [entry('a', { pyramidSequence: seq, sets: 2 })] }),
      card({ exercises: [entry('a')], cardStatus: 'completed' }),
      card({ exercises: two, isResting: true, restTimeLeft: 8, formatTime: fmt, onSkipRest: noop }),
      card({ exercises: two, cardStatus: 'completed' }),
    ].join('\n\n');
    await expect(out).toMatchFileSnapshot(snap('block-card'));
  });
  it('Superset / Tabata groups and the exercise card', async () => {
    const two = [entry('a'), entry('b', { status: 'upcoming' })];
    const out = [
      html(<SupersetBlockGroup exercises={two} cardStatus="active" activeExerciseIndex={0} isResting={false} onSaveSet={noop} />),
      html(<SupersetBlockGroup exercises={two} cardStatus="active" activeExerciseIndex={0} isResting restTimeLeft={5} formatTime={fmt} onSkipRest={noop} onSaveSet={noop} />),
      html(<TabataBlockGroup exercises={two} title="טבטה" cardStatus="active" activeExerciseIndex={1} isResting restTimeLeft={5} formatTime={fmt} onSaveSet={noop} />),
      html(<TabataBlockGroup exercises={two} title="גמר" cardStatus="upcoming" activeExerciseIndex={-1} isResting={false} onSaveSet={noop} />),
      html(<StrengthExerciseCard entry={entry('a', { pyramidSequence: seq, sets: 2, loggedReps: [null, null], currentSetIndex: 0 }) as never} isTurnActive isResting={false} onSaveSet={noop} />),
      html(<StrengthExerciseCard entry={entry('a') as never} isTurnActive isResting={false} onSaveSet={noop} />),
    ].join('\n\n');
    await expect(out).toMatchFileSnapshot(snap('block-groups'));
  });
  it('WorkoutPlaylist', async () => {
    const ex = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `תרגיל ${id}`, reps: '10', sets: 3, exerciseType: 'reps', ...over });
    const workout = { id: 'w', name: 'אימון כוח', segments: [
      { id: 's0', title: 'חימום', exercises: [ex('w1', { sets: 1 })] },
      { id: 's1', title: 'עיקרי', exercises: [ex('m1', { pairedWith: 'm2' }), ex('m2', { pairedWith: 'm1' }), ex('m3'), ex('m4', { pyramidSequence: seq })] },
      { id: 's2', title: 'שחרור', exercises: [ex('c1', { sets: 1 }), ex('c2', { sets: 1 })] },
    ] };
    const base = { workout: workout as never, currentSegmentIndex: 1, currentExerciseIndex: 0, currentSetIndex: 0, workoutState: 'ACTIVE', isPaused: false, restTimeLeft: 20, formatTime: fmt, exerciseLog: [], handleRepetitionSave: noop };
    const out = [
      html(<WorkoutPlaylist {...base} />),
      html(<WorkoutPlaylist {...base} workoutState="RESTING" onSkipRest={noop} />),
      html(<WorkoutPlaylist {...base} currentSegmentIndex={0} />),
    ].join('\n\n');
    await expect(out).toMatchFileSnapshot(snap('playlist'));
  });
});

describe('active exercise and timer card', () => {
  type ActiveProps = ComponentProps<typeof ActiveExerciseView>;
  const view = (over: Record<string, unknown> = {}) => ({
    activeKey: 'k', fadeIn: true, isPaused: false, safeVideoUrl: null, cachedNextVideoUrl: null, exerciseId: 'e1', exerciseName: 'מתח', exerciseType: 'reps',
    isTimeExercise: false, exerciseDuration: 30, currentSide: null, repsOrDurationText: '10 חזרות', targetValue: 10, isUnilateral: false, isPyramidActive: false,
    currentRound: 2, totalRounds: 3, upcomingPyramidSteps: [], isSupersetActive: false, supersetPartnerName: null, autoCompleteTime: 30, executionSteps: [],
    muscleGroups: { primary: [], secondary: [] }, exerciseGoal: null, scrollRef: { current: null }, onComplete: noop, ...over,
  }) as unknown as ActiveProps;
  const steps = [{ name: 'שלב א', targetReps: 12 }, { name: 'שלב ב', targetHold: 20 }, { name: 'שלב ג', targetReps: 8 }];
  it.each([false, true])('ActiveExerciseView, v2=%s', async (v2) => {
    const out: string[] = [];
    for (const gender of GENDERS) {
      setGender(gender);
      out.push(html(withV2(v2, <ActiveExerciseView {...view()} onSwap={noop} />)));
    }
    out.push(html(withV2(v2, <ActiveExerciseView {...view({ isUnilateral: true })} />)));
    out.push(html(withV2(v2, <ActiveExerciseView {...view({ isPyramidActive: true, upcomingPyramidSteps: steps })} />)));
    out.push(html(withV2(v2, <ActiveExerciseView {...view({ isSupersetActive: true, supersetPartnerName: 'מקבילים' })} />)));
    out.push(html(withV2(v2, <ActiveExerciseView {...view({ isSupersetActive: true, totalRounds: 1, isFollowAlong: true, targetValue: 0 })} />)));
    out.push(html(withV2(v2, <ActiveExerciseView {...view({ isTimeExercise: true, currentSide: 'right', exerciseType: 'time', repsOrDurationText: '30 שניות' })} />)));
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`active-exercise-v${v2 ? 2 : 1}`));
  });
  it('IsometricTimerCard', async () => {
    const base = { duration: 30, exerciseName: 'פלאנק', repsOrDurationText: '30 שניות', onComplete: noop };
    const out = [
      html(<IsometricTimerCard {...base} />),
      html(<IsometricTimerCard {...base} side="right" />),
      html(<IsometricTimerCard {...base} side="left" />),
      html(<IsometricTimerCard {...base} isTabata />),
      html(<IsometricTimerCard {...base} isTabata machineTabataLabel={{ machine: 1, machineCount: 2, round: 1, roundsPerMember: 2 }} />),
      html(<IsometricTimerCard {...base} autoStart />),
      html(<IsometricTimerCard {...base} autoStart externalPaused prepSeconds={0} />),
      html(<IsometricTimerCard {...base} hideControls guidanceLine="ממשיכים" />),
    ].join('\n\n');
    await expect(out).toMatchFileSnapshot(snap('isometric-timer'));
  });
});

describe('timed cards', () => {
  const item = (key: string, over: Record<string, unknown> = {}) => ({ kind: 'exercise' as const, key, exerciseId: key, name: `תרגיל ${key}`, targetReps: 10, ...over });
  const run = { kind: 'aerobic_leg' as const, key: 'run-1', name: 'ריצה', distanceM: 300 };
  const amrap = { format: 'amrap' as const, config: { capSec: 600, roundItems: [] }, items: [item('a'), item('b')] };
  const emom = { format: 'emom' as const, config: { intervalSec: 60, totalIntervals: 6 }, items: [item('a'), item('b')] };
  const tabata = { format: 'tabata' as const, config: { workSec: 20, restSec: 10, rounds: 8 }, items: [item('a'), item('b', { isUnilateral: true })] };
  const bars = { segments: [], currentIndex: 0 };
  it('Header / Clock / Ready / Done', async () => {
    const hdr = { bars: bars as never, progress: 0.4, cartItems: [], caption: 'סבב 1', clock: '04:00', warn: false, isPaused: false, onList: noop, onInfo: noop, onTogglePause: noop };
    const out: string[] = [];
    for (const gender of GENDERS) {
      setGender(gender);
      out.push(html(<TimedHeader {...hdr} />));
      out.push(html(<TimedHeader {...hdr} isPaused hideList />));
    }
    out.push(
      html(<TimedClockCard mode="work" eyebrow="עבודה" warn={false} clock="0:20" item={item('a') as never} next={item('b') as never} nextCaption="התרגיל הבא" line="סיימת?" />),
      html(<TimedClockCard mode="rest" eyebrow="מנוחה" warn ofClock="0:10" clock="0:03" item={item('b') as never} nextCaption="התרגיל הבא" />),
      html(<TimedClockCard mode="rest" eyebrow="מנוחה" warn={false} clock="0:10" item={null} nextCaption="דקה 2" />),
      html(<TimedReadyCard spec={amrap as never} segmentTitle="סיום חזק" prefix="חלק 2" onInfo={noop} onStart={noop} />),
      html(<TimedReadyCard spec={emom as never} segmentTitle="EMOM" prefix={null} onInfo={noop} onStart={noop} />),
      html(<TimedReadyCard spec={tabata as never} segmentTitle="" prefix={null} onInfo={noop} onStart={noop} />),
      html(<TimedDoneCard title="AMRAP" result={null} />),
      html(<TimedDoneCard title="טבטה" result={{ format: 'amrap', fullRounds: 3, extraReps: 4 } as never} />),
    );
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('timed-cards'));
  });
  it('Work / Reps / Session list', async () => {
    const work = { eyebrow: 'סבב 1', warn: false, item: item('a') as never, next: item('b') as never, nextCaption: 'הבא בסבב', hint: 'יעד קבוע בכל סבב', onDone: noop };
    const row = (key: string, extra = {}) => ({ key, name: `תרגיל ${key}`, kind: 'exercise' as const, detail: '10 חזרות', ...extra });
    const model = { headline: '3 פריטים בסל', summary: '1 סבב מלא · 30 חזרות', done: [row('a', { pills: [{ label: '0:45', tone: 'done' }, { label: '8', tone: 'partial' }, { label: '—', tone: 'missed' }], trailing: 'דקה 2' })], queueTitle: 'סבב 2', queue: [row('b', { now: true, trailing: 'עכשיו' }), row('c')] };
    const workout = { name: 'אימון ערב', segments: [{ title: 'חימום', exercises: [{}, {}] }, { title: 'AMRAP', exercises: [{}] }, { title: '', exercises: [{}] }, { title: 'שחרור', exercises: [{}, {}] }, { title: 'ריק', exercises: [] }] };
    const out = [
      html(<TimedWorkCard {...work} />),
      html(<TimedWorkCard {...work} item={item('a', { targetReps: undefined, targetHoldSec: 30 }) as never} minute={{ clock: '0:42', fraction: 0.3 }} hint={null} />),
      html(<TimedWorkCard {...work} item={run as never} next={null} runDistanceM={120} />),
      html(<TimedWorkCard {...work} item={{ ...run, distanceM: undefined, durationSec: 90 } as never} next={null} />),
      html(<TimedRepsPanel prompt={{ kind: 'amrap_partial', round: 2, itemIndex: 0, item: item('a') } as never} onSave={noop} onSkip={noop} />),
      html(<TimedRepsPanel prompt={{ kind: 'emom_minute', minuteIndex: 1, item: item('a', { targetReps: undefined, targetHoldSec: 40 }) } as never} onSave={noop} onSkip={noop} />),
      html(<TimedSessionList workout={workout as never} segmentIndex={1} blockTitle="AMRAP" model={model as never} cartItems={[]} remaining="3:20" onClose={noop} />),
      html(<TimedSessionList workout={workout as never} segmentIndex={3} blockTitle="EMOM" model={{ ...model, queueTitle: 'הבא בתור', queue: [] } as never} cartItems={[]} remaining="0:10" onClose={noop} />),
      html(<TimedSessionList workout={workout as never} segmentIndex={1} blockTitle="AMRAP" model={{ ...model, queueTitle: 'הבא בתור' } as never} cartItems={[]} remaining="0:10" onClose={noop} />),
    ].join('\n\n');
    await expect(out).toMatchFileSnapshot(snap('timed-work-list'));
  });
});

describe('exercise detail and video', () => {
  it('ExerciseDetailContent', async () => {
    const full = { exerciseName: 'מתח', videoUrl: null, programs: [{ name: 'כוח', level: 3 }, { name: 'מתיחות', level: 1 }], equipment: ['pullup_bar'], primaryMuscle: 'back', secondaryMuscles: ['biceps'], cues: ['גב ישר'], goal: 'חיזוק הגב', description: 'תיאור התרגיל', instructions: 'תלו על המתח', notes: ['נשמו'], hideHeroVideo: true };
    const out = [
      html(<ExerciseDetailContent {...full} />),
      html(<ExerciseDetailContent {...full} programs={undefined} programName="כוח" programLevel={2} />),
      html(<ExerciseDetailContent {...full} programs={[{ name: 'כוח', level: 3 }]} compact />),
      html(<ExerciseDetailContent exerciseName="מתח" videoUrl={null} hideHeroVideo />),
      html(<ExerciseDetailContent exerciseName="מתח" videoUrl="https://x/y.mp4" youtubeUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />),
    ].join('\n\n');
    await expect(out).toMatchFileSnapshot(snap('exercise-detail'));
  });
  it('ExerciseVideoPlayer', async () => {
    const base = { exerciseId: 'e1', exerciseName: 'מתח', exerciseType: 'reps' as const, isPaused: false };
    const out = [
      html(<ExerciseVideoPlayer {...base} videoUrl="https://www.youtube.com/watch?v=short" />),
      html(<ExerciseVideoPlayer {...base} videoUrl="https://www.youtube.com/watch?v=dQw4w9WgXcQ" />),
      html(<ExerciseVideoPlayer {...base} videoUrl="https://x/y.mp4" exerciseType="follow-along" />),
      html(<ExerciseVideoPlayer {...base} videoUrl="https://x/y.mp4" fullTutorial={{ videoId: 'abc', provider: 'bunny' } as never} />),
      html(<ExerciseVideoPlayer {...base} videoUrl="https://x/y.mp4" fullTutorial={{ videoId: 'abc', provider: 'bunny' } as never} tutorialPlacement="corner" />),
      html(<ExerciseVideoPlayer {...base} videoUrl={null} />),
    ].join('\n\n');
    await expect(out).toMatchFileSnapshot(snap('video-player'));
  });
});
