import { describe, it, expect } from 'vitest';
import {
  evidenceMillis,
  isLostTimestamp,
  planGenericRepairs,
  planUserRepairs,
  tsCopyMillis,
  type UserEvidence,
} from '../broken-timestamps-backfill';

const S = { _methodName: 'serverTimestamp' };
const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 19, 8);
const CREATED = Date.UTC(2026, 5, 1);
const ts = (ms: number) => ({ toMillis: () => ms });

const ev = (data: Record<string, any>, extra: Partial<UserEvidence> = {}): UserEvidence => ({
  data,
  nowMs: NOW,
  createTimeMs: CREATED,
  updateTimeMs: NOW - DAY,
  ...extra,
});
const setOf = (p: ReturnType<typeof planUserRepairs>, path: string) => p.sets.find((s) => s.path.join('.') === path);

describe('value classification', () => {
  it('sentinel / {} are lost; {seconds,nanoseconds} is a lossless copy; a Timestamp is neither', () => {
    expect(isLostTimestamp(S)).toBe(true);
    expect(isLostTimestamp({})).toBe(true);
    expect(isLostTimestamp(ts(1))).toBe(false);
    expect(tsCopyMillis({ seconds: 10, nanoseconds: 5e6 })).toBe(10_005);
    expect(tsCopyMillis({ seconds: 10 })).toBeNull();
    expect(evidenceMillis('2026-10-01')).toBe(Date.UTC(2026, 9, 1, 12));
    expect(evidenceMillis(S)).toBeNull();
  });
});

describe('planUserRepairs', () => {
  it('never touches valid Timestamps (idempotent: a repaired doc plans nothing)', () => {
    const p = planUserRepairs(ev({ lastActive: ts(NOW), onboardingCompletedAt: ts(NOW), createdAt: ts(CREATED), updatedAt: ts(NOW), marketingAttribution: { capturedAt: ts(NOW) } }));
    expect(p.sets).toEqual([]);
    expect(p.deletes).toEqual([]);
    expect(p.flags).toEqual({});
  });

  it('lastActive ← the latest real-activity signal', () => {
    const p = planUserRepairs(
      ev(
        { lastActive: S, createdAt: ts(CREATED), progression: { lastActiveDate: '2026-10-01' }, running: { lastWorkoutDate: '2026-09-01T10:00:00Z' }, fcmTokenMeta: { t1: { lastSeenAt: ts(NOW - 5 * DAY) } } },
        { latestWorkoutMs: NOW - 3 * DAY, authLastActiveMs: NOW - 10 * DAY },
      ),
    );
    expect(setOf(p, 'lastActive')).toEqual({ path: ['lastActive'], ms: NOW - 3 * DAY, source: 'workouts.date' });
  });

  it('lastActive with no activity evidence ← createdAt; future / implausible evidence is ignored', () => {
    const p = planUserRepairs(ev({ lastActive: S, createdAt: ts(CREATED), progression: { lastActiveDate: '2099-01-01' } }, { latestWorkoutMs: 5 }));
    expect(setOf(p, 'lastActive')).toMatchObject({ ms: CREATED, source: 'createdAt' });
  });

  it('a broken createdAt/updatedAt ← snapshot createTime/updateTime, and createdAt feeds the fallbacks', () => {
    const p = planUserRepairs(ev({ createdAt: S, updatedAt: S, lastActive: S }));
    expect(setOf(p, 'createdAt')).toMatchObject({ ms: CREATED, source: 'doc.createTime' });
    expect(setOf(p, 'updatedAt')).toMatchObject({ ms: NOW - DAY, source: 'doc.updateTime' });
    expect(setOf(p, 'lastActive')).toMatchObject({ ms: CREATED });
  });

  it('onboardingCompletedAt ← the first onboarding_completed event, else createdAt + estimated flag', () => {
    const withEvent = planUserRepairs(ev({ onboardingCompletedAt: S, createdAt: ts(CREATED) }, { onboardingCompletedEventMs: CREATED + 600_000 }));
    expect(setOf(withEvent, 'onboardingCompletedAt')).toMatchObject({ ms: CREATED + 600_000, source: 'analytics_events.onboarding_completed' });
    expect(withEvent.flags).toEqual({});

    const noEvent = planUserRepairs(ev({ onboardingCompletedAt: S, createdAt: ts(CREATED) }));
    expect(setOf(noEvent, 'onboardingCompletedAt')).toMatchObject({ ms: CREATED, source: 'createdAt' });
    expect(noEvent.flags).toEqual({ onboardingCompletedAtEstimated: true });

    // an event long before the account existed is not trusted
    const early = planUserRepairs(ev({ onboardingCompletedAt: S, createdAt: ts(CREATED) }, { onboardingCompletedEventMs: CREATED - 30 * DAY }));
    expect(early.flags.onboardingCompletedAtEstimated).toBe(true);
  });

  it('marketingAttribution.capturedAt ← firstSeenAt (ms), else createdAt', () => {
    const a = planUserRepairs(ev({ createdAt: ts(CREATED), marketingAttribution: { capturedAt: S, firstSeenAt: CREATED - DAY } }));
    expect(setOf(a, 'marketingAttribution.capturedAt')).toMatchObject({ ms: CREATED - DAY, source: 'marketingAttribution.firstSeenAt' });
    const b = planUserRepairs(ev({ createdAt: ts(CREATED), marketingAttribution: { capturedAt: S } }));
    expect(setOf(b, 'marketingAttribution.capturedAt')).toMatchObject({ ms: CREATED, source: 'createdAt' });
  });

  it('termsAcceptedAt ({} or sentinel) ← completion time, always marked estimated', () => {
    const p = planUserRepairs(ev({ createdAt: ts(CREATED), termsAcceptedAt: {} }));
    expect(setOf(p, 'termsAcceptedAt')).toMatchObject({ ms: CREATED });
    expect(p.flags.termsAcceptedAtEstimated).toBe(true);
  });

  it('an unknown broken field is deleted; values inside arrays are only reported', () => {
    const p = planUserRepairs(ev({ createdAt: ts(CREATED), someNew: { at: S }, personas: [{ updatedAt: S }] }));
    expect(p.deletes).toEqual([['someNew', 'at']]);
    expect(p.inArrays).toEqual(['personas.[0].updatedAt']);
  });

  it('{seconds,nanoseconds} copies: converted only when asked, never under core.*', () => {
    const data = { createdAt: ts(CREATED), core: { birthDate: { seconds: 1, nanoseconds: 0 } }, health: { connectStateUpdatedAt: { seconds: 1_760_000_000, nanoseconds: 0 } } };
    expect(planUserRepairs(ev(data)).sets).toEqual([]);
    const p = planUserRepairs(ev(data), { includeTsCopies: true });
    expect(p.sets).toEqual([{ path: ['health', 'connectStateUpdatedAt'], ms: 1_760_000_000_000, source: 'lossless {seconds,nanoseconds}' }]);
  });
});

describe('planGenericRepairs', () => {
  it('parks.publishedAt ← createdAt; community_events.date copy → lossless; unknown → delete', () => {
    const p = planGenericRepairs(
      { publishedAt: S, createdAt: ts(CREATED), date: { seconds: 100, nanoseconds: 0 }, other: S },
      { createTimeMs: 1, updateTimeMs: 2, nowMs: NOW },
      { publishedAt: 'createdAtOrCreateTime' },
    );
    expect(p.sets).toContainEqual({ path: ['publishedAt'], ms: CREATED, source: 'createdAt' });
    expect(p.sets).toContainEqual({ path: ['date'], ms: 100_000, source: 'lossless {seconds,nanoseconds}' });
    expect(p.deletes).toEqual([['other']]);
  });
});
