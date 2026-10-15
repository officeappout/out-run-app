import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import {
  shouldGateExercise, timerLeadInSeconds, gateClipMuted, createDemoSeenStore, TABATA_LEAD_IN_SECONDS,
  type GateInput,
} from '../demo-gate';
import { useHybridRun, hybridDemoSeen } from '@/features/workout-engine/hybrid/useHybridRun';
import type { HybridPlan } from '@/features/workout-engine/hybrid/compose-hybrid-session.service';

/** PR-B2 — guided "watch the demo first" gate. */

const base = (over: Partial<GateInput> = {}): GateInput => ({
  enabled: true,
  exerciseId: 'ex-1',
  exerciseType: 'reps',
  workoutState: 'ACTIVE',
  seen: createDemoSeenStore(),
  isTabataBlock: false,
  isFirstTabataInterval: false,
  ...over,
});

describe('when the gate appears', () => {
  it('guided mode only — fast mode (no seen-store / disabled) never gates', () => {
    expect(shouldGateExercise(base())).toBe(true);
    expect(shouldGateExercise(base({ enabled: false }))).toBe(false);
    expect(shouldGateExercise(base({ seen: undefined }))).toBe(false);
  });
  it('only for exercises not yet seen this session (by exercise id)', () => {
    const seen = createDemoSeenStore();
    expect(shouldGateExercise(base({ seen }))).toBe(true);
    seen.add('ex-1');
    expect(shouldGateExercise(base({ seen }))).toBe(false);
    expect(shouldGateExercise(base({ seen, exerciseId: 'ex-2' }))).toBe(true);
  });
  it('at PREPARING (replaces the countdown) or ACTIVE — never during rest/input', () => {
    expect(shouldGateExercise(base({ workoutState: 'PREPARING' }))).toBe(true);
    expect(shouldGateExercise(base({ workoutState: 'RESTING' }))).toBe(false);
    expect(shouldGateExercise(base({ workoutState: 'INPUT' }))).toBe(false);
  });
  it('follow-along clips are the demo themselves → no gate', () => {
    expect(shouldGateExercise(base({ exerciseType: 'follow-along' }))).toBe(false);
  });
  it('tabata: only the block\'s first interval is gated', () => {
    expect(shouldGateExercise(base({ isTabataBlock: true, isFirstTabataInterval: true }))).toBe(true);
    expect(shouldGateExercise(base({ isTabataBlock: true, isFirstTabataInterval: false }))).toBe(false);
  });
});

describe('tabata lead-in', () => {
  it('first interval after the gate tap starts with lead-in 0; fast mode keeps 5s; later intervals stay 0', () => {
    expect(timerLeadInSeconds(true, true, true)).toBe(0);
    expect(timerLeadInSeconds(true, true, false)).toBe(TABATA_LEAD_IN_SECONDS);
    expect(TABATA_LEAD_IN_SECONDS).toBe(5);
    expect(timerLeadInSeconds(true, false, false)).toBe(0);
    expect(timerLeadInSeconds(true, false, true)).toBe(0);
    expect(timerLeadInSeconds(false, false, false)).toBeUndefined();
  });
});

describe('session mute', () => {
  it('the clip is unmuted on the tap unless the player is muted for the session', () => {
    expect(gateClipMuted(false)).toBe(false);
    expect(gateClipMuted(true)).toBe(true);
  });
});

describe('seen-store is session-scoped', () => {
  it('cleared when a new hybrid session starts', () => {
    hybridDemoSeen.add('ex-9');
    expect(hybridDemoSeen.has('ex-9')).toBe(true);
    const plan = { segments: [], totals: { aerobicMin: 0, strengthMin: 0, distanceKm: 0, estCalories: 0, stations: 0 }, meta: {} } as unknown as HybridPlan;
    useHybridRun.getState().startHybrid(plan, 'walking');
    expect(hybridDemoSeen.has('ex-9')).toBe(false);
    useHybridRun.getState().reset();
  });
});

// Source-level wiring (this repo's vitest can't render .tsx).
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const runner = read('../../StrengthRunner.tsx');

describe('no timer advances while the gate is up', () => {
  it('the gate holds the player in its existing pause (before paint)', () => {
    // B3: the same hold now covers the find-equipment screen too (needsHold = find || gate).
    expect(runner).toContain('useLayoutEffect(() => {\n    if (!needsHold) return;');
    expect(runner).toContain('if (!sm.isPaused) sm.togglePause();');
  });
  it('every clock honours that pause', () => {
    expect(read('../../hooks/useWorkoutTimers.ts')).toContain("if (isPaused || workoutState === 'PAUSED') return;");
    expect(read('../../components/FillingButton.tsx')).toContain('if (isPaused || disabled || isComplete');
    expect(read('../../components/ActiveExerciseView.tsx')).toContain('externalPaused={isPaused}');
    expect(runner).toContain('isPaused={sm.isPaused}');
  });
  it('only the demo clip keeps playing behind the gate; the tap releases the hold', () => {
    expect(runner).toContain('videoPaused={gateActive ? false : sm.isPaused}');
    const tap = runner.slice(runner.indexOf('const handleGateStart = useCallback'), runner.indexOf('}, [isTabataBlock, workout.segments'));
    expect(tap).toContain('el.muted = gateClipMuted(isPlayerAudioMuted());');
    expect(tap.indexOf('el.play()')).toBeLessThan(tap.indexOf('sm.togglePause()')); // sound first, inside the tap
  });
});

describe('fast mode unchanged (incl. PREPARING)', () => {
  it('PREPARING is only bypassed when the gate is needed', () => {
    expect(runner).toContain('if (needsHold) return <div className="absolute inset-0 bg-black" />;');
    expect(runner).toContain('enabled: !!demoGate,');
  });
  it('the station passes the seen-store only in guided mode', () => {
    expect(read('../../../../hybrid/HybridStationLayer.tsx')).toContain('demoGate={guided ? hybridDemoSeen : undefined}');
  });
});
