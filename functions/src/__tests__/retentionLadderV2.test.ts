import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin', async () => (await import('./helpers/fake-firestore')).fakeAdminModule());
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));

import {
  RETENTION_LADDER_V2,
  nextRetentionMilestone,
  recordRetentionMilestone,
  retentionMilestoneFor,
  retentionSentLogFrom,
} from '../lib/user-activity';
import { retentionYieldsToFirstWeek } from '../retentionScheduler';
import { resolveTonedCopy, copyHasTone } from '../services/push-tone.service';
import { selectPushCopy } from '../shared/push-library.core';

describe('retention ladder v2 (retentionLadderV2): d4, d7, then weekly to day 27, one on day 28, then quiet', () => {
  it('windows', () => {
    const at = (d: number) => retentionMilestoneFor(d, RETENTION_LADDER_V2);
    expect([3, 4, 6, 7, 13, 14, 20, 21, 27, 28, 30, 31, 35].map(at)).toEqual([
      null, 'd4', 'd4', 'd7', 'd7', 'd14', 'd14', 'd21', 'd21', 'd28', 'd28', null, null,
    ]);
    // Without the flag the old cadence is untouched.
    expect(retentionMilestoneFor(21)).toBe('d14');
    expect(retentionMilestoneFor(31)).toBe('d30');
  });
  it('once per milestone per absence; the log keeps d21/d28', () => {
    const anchor = 1_000;
    let log = retentionSentLogFrom(undefined);
    expect(nextRetentionMilestone(22, anchor, log, RETENTION_LADDER_V2)).toBe('d21');
    log = recordRetentionMilestone(anchor, log, 'd21');
    const stored = retentionSentLogFrom({ retention_absenceAnchor: log.anchor, retention_milestonesSent: log.sent });
    expect(nextRetentionMilestone(23, anchor, stored, RETENTION_LADDER_V2)).toBeNull();
    expect(nextRetentionMilestone(28, anchor, stored, RETENTION_LADDER_V2)).toBe('d28');
  });
  it('d21 / d28 have their own copy', () => {
    const r = selectPushCopy('retention_lapse', [], { uid: 'u', conditions: { milestone: 'd28', tone: 'personal' } });
    expect(r?.title).toBe('הדלת תמיד פתוחה');
    expect(r?.body).toBe('נבנה לך תוכנית חדשה בדקה, מה שמתאים לך עכשיו');
  });
});

describe('retention yields the first week to the sequence', () => {
  const now = Date.UTC(2026, 9, 21, 9);
  it('only with firstWeekSequenceEnabled, only days 0–7', () => {
    expect(retentionYieldsToFirstWeek({ firstWeekSequence: false }, { createdAt: now - 5 * 86_400_000 }, now)).toBe(false);
    expect(retentionYieldsToFirstWeek({ firstWeekSequence: true }, { createdAt: now - 5 * 86_400_000 }, now)).toBe(true);
    expect(retentionYieldsToFirstWeek({ firstWeekSequence: true }, { createdAt: now - 9 * 86_400_000 }, now)).toBe(false);
  });
});

describe('tone rotation', () => {
  it('takes the first tone that has copy, else the untoned copy as "none"', async () => {
    const resolve = (async (t: string, ctx: never) => selectPushCopy(t, [], ctx)) as never;
    const r = await resolveTonedCopy('retention_lapse', { uid: 'u', conditions: { milestone: 'd4', track: 'strength' } }, ['cute', 'personal'], resolve);
    expect(r?.tone).toBe('personal'); // no cute d4 copy for strength → personal
    expect(copyHasTone(r!.copy, 'personal')).toBe(true);
    const none = await resolveTonedCopy('retention_lapse', { uid: 'u', conditions: { milestone: 'd14' } }, ['cute'], resolve);
    expect(none?.tone).toBe('none');
  });
});
