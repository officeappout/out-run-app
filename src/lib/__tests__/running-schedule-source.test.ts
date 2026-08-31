import { describe, it, expect } from 'vitest';
import {
  getRunningScheduleSource,
  resolveRunningScheduleSource,
  isRunningScheduleUserConfirmed,
} from '../running-schedule-source';

describe('getRunningScheduleSource', () => {
  it('returns "system-default" when set', () => {
    expect(getRunningScheduleSource({ running: { scheduleDaysSource: 'system-default' } })).toBe('system-default');
  });

  it('returns "user-chosen" when set', () => {
    expect(getRunningScheduleSource({ running: { scheduleDaysSource: 'user-chosen' } })).toBe('user-chosen');
  });

  it('returns null when the field is missing (legacy/pre-field user)', () => {
    expect(getRunningScheduleSource({ running: {} })).toBeNull();
  });

  it('returns null when running itself is missing', () => {
    expect(getRunningScheduleSource({})).toBeNull();
  });

  it('returns null for an unrecognized value rather than guessing', () => {
    expect(getRunningScheduleSource({ running: { scheduleDaysSource: 'something-else' } })).toBeNull();
  });

  it('returns null for null profile', () => {
    expect(getRunningScheduleSource(null)).toBeNull();
  });

  it('returns null for undefined profile', () => {
    expect(getRunningScheduleSource(undefined)).toBeNull();
  });
});

describe('resolveRunningScheduleSource', () => {
  it('returns "system-default" when the field is missing (David, 31.08.2026: null → system-default, never user-chosen)', () => {
    expect(resolveRunningScheduleSource({ running: {} })).toBe('system-default');
  });

  it('returns "system-default" when running itself is missing', () => {
    expect(resolveRunningScheduleSource({})).toBe('system-default');
  });

  it('returns "system-default" for null profile', () => {
    expect(resolveRunningScheduleSource(null)).toBe('system-default');
  });

  it('returns "system-default" for undefined profile', () => {
    expect(resolveRunningScheduleSource(undefined)).toBe('system-default');
  });

  it('passes through an explicit "system-default"', () => {
    expect(resolveRunningScheduleSource({ running: { scheduleDaysSource: 'system-default' } })).toBe('system-default');
  });

  it('passes through an explicit "user-chosen" — never overrides a known value', () => {
    expect(resolveRunningScheduleSource({ running: { scheduleDaysSource: 'user-chosen' } })).toBe('user-chosen');
  });

  it('treats an unrecognized value the same as missing — "system-default"', () => {
    expect(resolveRunningScheduleSource({ running: { scheduleDaysSource: 'garbage' } })).toBe('system-default');
  });
});

describe('isRunningScheduleUserConfirmed', () => {
  it('is true only for "user-chosen"', () => {
    expect(isRunningScheduleUserConfirmed({ running: { scheduleDaysSource: 'user-chosen' } })).toBe(true);
  });

  it('is false for "system-default"', () => {
    expect(isRunningScheduleUserConfirmed({ running: { scheduleDaysSource: 'system-default' } })).toBe(false);
  });

  it('is false when unknown (missing field)', () => {
    expect(isRunningScheduleUserConfirmed({ running: {} })).toBe(false);
  });

  it('is false for null profile', () => {
    expect(isRunningScheduleUserConfirmed(null)).toBe(false);
  });
});
