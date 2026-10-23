import { describe, it, expect } from 'vitest';
import { buildSessionPreview, SESSION_TOKEN_RE } from '../session-preview';

const ts = (ms: number) => ({ toMillis: () => ms });
const NOW = 1_800_000_000_000;

describe('buildSessionPreview (P1-1)', () => {
  const base = {
    token: 'si_ABC', groupId: 'g1', attendanceId: '2026-10-22_19-00', hostUid: 'host',
    groupName: 'ריצה עם דנה', sessionDate: '2026-10-22', sessionTime: '19:00',
    expiresAt: ts(NOW + 60_000), useCount: 0, source: 'run-invite', activityType: 'running',
  };

  it('valid invite → display fields only (no ids, no host, no counters)', () => {
    const r = buildSessionPreview(base, NOW);
    expect(r).toEqual({
      valid: true,
      invitation: { groupName: 'ריצה עם דנה', sessionDate: '2026-10-22', sessionTime: '19:00', source: 'run-invite', activityType: 'running' },
    });
    const json = JSON.stringify(r);
    for (const leak of ['host', 'g1', 'attendanceId', 'useCount', 'si_ABC']) expect(json).not.toContain(leak);
  });
  it('missing → not_found; expired → expired; max uses → max_uses_reached', () => {
    expect(buildSessionPreview(undefined, NOW)).toEqual({ valid: false, reason: 'not_found' });
    expect(buildSessionPreview({ ...base, expiresAt: ts(NOW - 1) }, NOW)).toEqual({ valid: false, reason: 'expired' });
    expect(buildSessionPreview({ ...base, maxUses: 2, useCount: 2 }, NOW)).toEqual({ valid: false, reason: 'max_uses_reached' });
  });
  it('token format', () => {
    expect(SESSION_TOKEN_RE.test('si_ABCDEFGHJKLMNPQRSTUV')).toBe(true);
    expect(SESSION_TOKEN_RE.test('../etc')).toBe(false);
    expect(SESSION_TOKEN_RE.test('si_abc/def')).toBe(false);
  });
});
