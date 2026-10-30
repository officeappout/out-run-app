import { describe, expect, it } from 'vitest';
import type { SequencerPhase } from '../../../../engines/hybrid/sequencer.types';
import { COMBO_TIMING, comboSteps, detectComboTransition, stageAt, startChipMinutes, totalMs } from '../combo-choreography';

const P = (phase: SequencerPhase, cursor = 0) => ({ phase, cursor });

describe('detectComboTransition', () => {
  it('start: idle (or nothing) → the first leg', () => {
    expect(detectComboTransition(null, P('run'))).toBe('start');
    expect(detectComboTransition(P('idle'), P('run'))).toBe('start');
  });
  it('toStation: the arrival card hands over to the station', () => {
    expect(detectComboTransition(P('transition', 1), P('station', 1))).toBe('toStation');
  });
  it('toWalk: the station closes onto the next leg (run or cool-down)', () => {
    expect(detectComboTransition(P('station', 1), P('run', 2))).toBe('toWalk');
    expect(detectComboTransition(P('station', 1), P('cooldown', 2))).toBe('toWalk');
  });
  it('finish: any stage → done, once', () => {
    expect(detectComboTransition(P('run', 2), P('done', 3))).toBe('finish');
    expect(detectComboTransition(P('station', 1), P('done', 2))).toBe('finish');
    expect(detectComboTransition(P('done', 3), P('done', 3))).toBe(null);
  });
  it('no choreography for a tick, the arrival itself, or nothing', () => {
    expect(detectComboTransition(P('run'), P('run'))).toBe(null);
    expect(detectComboTransition(P('run', 0), P('transition', 1))).toBe(null);
    expect(detectComboTransition(P('run'), null)).toBe(null);
  });
});

describe('comboSteps', () => {
  it('without the layer only the start chip is timed', () => {
    expect(comboSteps('start', { withLayer: false, reducedMotion: false })).toEqual([{ stage: 'open', ms: COMBO_TIMING.startChip }]);
    for (const k of ['toStation', 'toWalk', 'finish'] as const) expect(comboSteps(k, { withLayer: false, reducedMotion: false })).toEqual([]);
  });
  it('board timings: station 0.6 + 0.7 + 0.5 = 1.8 s, start 2.8 s', () => {
    expect(totalMs(comboSteps('toStation', { withLayer: true, reducedMotion: false }))).toBe(1800);
    expect(totalMs(comboSteps('toWalk', { withLayer: true, reducedMotion: false }))).toBe(1800);
    expect(totalMs(comboSteps('start', { withLayer: true, reducedMotion: false }))).toBe(2800);
    expect(comboSteps('finish', { withLayer: true, reducedMotion: false }).map((s) => s.stage)).toEqual(['reveal', 'move']);
  });
  it('reduced motion: a short fade of the list, never a dot move', () => {
    for (const k of ['start', 'toStation', 'toWalk', 'finish'] as const) {
      expect(comboSteps(k, { withLayer: true, reducedMotion: true }).some((s) => s.stage === 'move')).toBe(false);
    }
  });
});

describe('stageAt', () => {
  const steps = comboSteps('toStation', { withLayer: true, reducedMotion: false });
  it('walks the steps and ends with null', () => {
    expect(stageAt(steps, 0)).toBe('reveal');
    expect(stageAt(steps, 599)).toBe('reveal');
    expect(stageAt(steps, 600)).toBe('move');
    expect(stageAt(steps, 1300)).toBe('open');
    expect(stageAt(steps, 1800)).toBe(null);
    expect(stageAt([], 0)).toBe(null);
  });
});

describe('startChipMinutes', () => {
  it('minutes of an aerobic first leg only', () => {
    expect(startChipMinutes({ kind: 'aerobic', durationSec: 360 })).toBe(6);
    expect(startChipMinutes({ kind: 'aerobic', durationSec: 10 })).toBe(null);
    expect(startChipMinutes({ kind: 'strength', durationSec: 600 })).toBe(null);
    expect(startChipMinutes(undefined)).toBe(null);
  });
});
