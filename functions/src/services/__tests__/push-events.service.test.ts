import { describe, it, expect } from 'vitest';
import {
  computeCheckAfterMillis,
  computeOutcomeWindowBounds,
  isWithinOpenWindow,
  DEFAULT_OUTCOME_WINDOW_HOURS,
} from '../push-events.service';

/**
 * Proves the attribution-window fix (04.10.2026): the window must be
 * anchored on OPEN, never SEND. These are pure functions with no Firestore
 * I/O — the real `checkWalkingGoal`/`checkWorkoutStartedWithinWindow` in
 * pushOutcomeSweeper.ts build their query bounds from
 * computeOutcomeWindowBounds() directly, so these tests exercise the exact
 * logic the real queries use, not a re-implementation of it.
 */

const HOUR_MS = 3600 * 1000;

describe('computeCheckAfterMillis', () => {
  it('adds windowHours (in ms) to the anchor', () => {
    const anchor = 1_000_000;
    expect(computeCheckAfterMillis(anchor, 6)).toBe(anchor + 6 * HOUR_MS);
  });

  it('supports a configurable window length, not just the 6h default', () => {
    const anchor = 0;
    expect(computeCheckAfterMillis(anchor, 1)).toBe(1 * HOUR_MS);
    expect(computeCheckAfterMillis(anchor, 24)).toBe(24 * HOUR_MS);
    expect(computeCheckAfterMillis(anchor, DEFAULT_OUTCOME_WINDOW_HOURS)).toBe(DEFAULT_OUTCOME_WINDOW_HOURS * HOUR_MS);
  });
});

describe('computeOutcomeWindowBounds', () => {
  it('starts exactly at the open instant, not before', () => {
    const openedAt = 5_000_000;
    const { startMillis, endMillis } = computeOutcomeWindowBounds(openedAt, 6);
    expect(startMillis).toBe(openedAt);
    expect(endMillis).toBe(openedAt + 6 * HOUR_MS);
  });
});

describe('isWithinOpenWindow — the core misattribution fix', () => {
  const openedAt = 10 * HOUR_MS; // arbitrary anchor, "hour 10"
  const windowHours = 6;

  it('counts an action that happens after open and inside the window', () => {
    const action = openedAt + 1 * HOUR_MS; // 1h after open
    expect(isWithinOpenWindow(action, openedAt, windowHours)).toBe(true);
  });

  it('counts an action exactly at the open instant (inclusive lower bound)', () => {
    expect(isWithinOpenWindow(openedAt, openedAt, windowHours)).toBe(true);
  });

  it('counts an action exactly at the window edge (inclusive upper bound)', () => {
    const action = openedAt + windowHours * HOUR_MS;
    expect(isWithinOpenWindow(action, openedAt, windowHours)).toBe(true);
  });

  it('rejects an action after the window has closed', () => {
    const action = openedAt + windowHours * HOUR_MS + 1; // 1ms late
    expect(isWithinOpenWindow(action, openedAt, windowHours)).toBe(false);
  });

  it('THE MISATTRIBUTION CASE — rejects an action that happened before OPEN, even though it happened after SEND', () => {
    // Scenario: push sent at hour 5, user doesn't open it until hour 10
    // (5h later — e.g. they were asleep). The user happened to do a
    // workout at hour 7, for reasons having nothing to do with this push
    // (it hadn't been opened yet). The old send-anchored window (hour 5 to
    // hour 11) would have wrongly credited this push for that workout. The
    // open-anchored window (hour 10 to hour 16) correctly excludes it.
    const sentAt = 5 * HOUR_MS;
    const unrelatedWorkoutAt = 7 * HOUR_MS; // after send, but before open
    expect(unrelatedWorkoutAt).toBeGreaterThan(sentAt); // sanity-check the scenario
    expect(isWithinOpenWindow(unrelatedWorkoutAt, openedAt, windowHours)).toBe(false);
  });

  it('rejects an action that happens before the push was even sent (sanity)', () => {
    const action = openedAt - 100 * HOUR_MS;
    expect(isWithinOpenWindow(action, openedAt, windowHours)).toBe(false);
  });
});
