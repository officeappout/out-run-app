import { describe, it, expect } from 'vitest';
import {
  RUN_TEST_ID,
  PULL_TEST_ID,
  PUSH_TEST_ID,
  MIN_QUALIFYING_LEVEL,
  runMeetsStatus,
  strengthMeetsStatus,
} from '../readiness-training-status.service';
import type { ReadinessThresholdsConfig } from '../readiness-write.service';

/**
 * 06.10.2026 — pure-logic tests for the module extracted (verbatim,
 * zero behavior change) from readiness-trends.service.ts. The real,
 * already-passing integration coverage for these two functions'
 * ACTUAL behavior lives in readiness-trends.emulator.test.ts (all 22
 * cases still pass post-extraction, confirmed separately) — this file
 * is the new, direct, no-jsdom-needed coverage for the module itself,
 * now that it's an importable thing rather than trapped private state.
 */
const CONFIG: ReadinessThresholdsConfig = {
  id: 'global',
  version: 1,
  updatedBy: 'test',
  updatedAt: new Date(),
  tests: [
    { id: RUN_TEST_ID, label: 'ריצת 3,000 מ', metric: 'time', unit: 'seconds', lowerIsBetter: true, threshold: { male: 1080, female: 1200 }, validityDays: 365 },
    { id: PULL_TEST_ID, label: 'עליות מתח', metric: 'reps', unit: 'reps', lowerIsBetter: false, threshold: { male: 5, female: 1 }, validityDays: 365 },
    { id: PUSH_TEST_ID, label: 'מקבילים', metric: 'reps', unit: 'reps', lowerIsBetter: false, threshold: { male: 10, female: 3 }, validityDays: 365 },
  ],
};

describe('runMeetsStatus', () => {
  it('null normalizedTimeSeconds (no training evidence) → not_yet_tested, never fail', () => {
    expect(runMeetsStatus(null, CONFIG, 'male')).toBe('not_yet_tested');
  });

  it('faster than (or equal to) the male threshold → pass (lowerIsBetter)', () => {
    expect(runMeetsStatus(1080, CONFIG, 'male')).toBe('pass');
    expect(runMeetsStatus(1000, CONFIG, 'male')).toBe('pass');
  });

  it('slower than the threshold → fail', () => {
    expect(runMeetsStatus(1200, CONFIG, 'male')).toBe('fail');
  });

  it('gender-specific threshold — 1150s clears female\'s looser bar (1200) but misses male\'s stricter one (1080)', () => {
    expect(runMeetsStatus(1150, CONFIG, 'female')).toBe('pass');
    expect(runMeetsStatus(1150, CONFIG, 'male')).toBe('fail');
  });

  it('no run test configured at all → not_yet_tested, not a throw', () => {
    const noRunConfig: ReadinessThresholdsConfig = { ...CONFIG, tests: CONFIG.tests.filter((t) => t.id !== RUN_TEST_ID) };
    expect(runMeetsStatus(1000, noRunConfig, 'male')).toBe('not_yet_tested');
  });
});

describe('strengthMeetsStatus', () => {
  it('null level (no training evidence) → not_yet_tested, never fail', () => {
    expect(strengthMeetsStatus('pull', null, null, CONFIG, 'male')).toBe('not_yet_tested');
  });

  it('a demonstrated level below MIN_QUALIFYING_LEVEL → fail, regardless of reps', () => {
    expect(MIN_QUALIFYING_LEVEL.pull).toBe(11);
    expect(strengthMeetsStatus('pull', 10, 999, CONFIG, 'male')).toBe('fail');
  });

  it('level qualifies but reps is null ("the one place this screen could lie") → not_yet_tested, not pass', () => {
    expect(strengthMeetsStatus('pull', 11, null, CONFIG, 'male')).toBe('not_yet_tested');
  });

  it('level qualifies and reps clears the threshold → pass', () => {
    expect(strengthMeetsStatus('pull', 11, 5, CONFIG, 'male')).toBe('pass');
  });

  it('level qualifies but reps falls short of the threshold → fail', () => {
    expect(strengthMeetsStatus('pull', 11, 2, CONFIG, 'male')).toBe('fail');
  });

  it('push uses the dips test id and its own MIN_QUALIFYING_LEVEL (10)', () => {
    expect(MIN_QUALIFYING_LEVEL.push).toBe(10);
    expect(strengthMeetsStatus('push', 9, 999, CONFIG, 'male')).toBe('fail');
    expect(strengthMeetsStatus('push', 10, 10, CONFIG, 'male')).toBe('pass');
  });

  it('gender-specific threshold — same reps count, different outcome by gender', () => {
    expect(strengthMeetsStatus('pull', 11, 2, CONFIG, 'male')).toBe('fail');
    expect(strengthMeetsStatus('pull', 11, 2, CONFIG, 'female')).toBe('pass');
  });

  it('no matching test configured at all → not_yet_tested, not a throw', () => {
    const noPullConfig: ReadinessThresholdsConfig = { ...CONFIG, tests: CONFIG.tests.filter((t) => t.id !== PULL_TEST_ID) };
    expect(strengthMeetsStatus('pull', 11, 5, noPullConfig, 'male')).toBe('not_yet_tested');
  });
});
