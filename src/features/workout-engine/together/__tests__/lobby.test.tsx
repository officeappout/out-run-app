import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import { buildLobbyRoster } from '../core/lobby-roster';
import { buildSessionIcs, googleCalendarUrl, isJoinedForLater, lobbyOpensAtMs, reminderAtMs, sessionDateTimeOf, sessionStartMs } from '../core/schedule';
import { decideByLevel, decideByPace } from '../core/level-similarity';
import TogetherLobbyPanel from '../components/TogetherLobbyPanel';
import type { PresenceEntry } from '../core/types';

const e = (o: Partial<PresenceEntry>): PresenceEntry => ({ uid: 'x', name: 'x', kind: 'strength', state: 'active', clientMs: 0, seq: 1, serverMs: 1, ...o });

describe('lobby roster', () => {
  it('merges registered + present; me first, here before not-yet', () => {
    const r = buildLobbyRoster(
      { a: { name: 'אבי' }, b: { name: 'בני' }, me: { name: 'אני' } },
      [e({ uid: 'b', name: 'בני', ready: true, level: 4 }), e({ uid: 'c', name: 'גלי', ready: true })],
      'me',
    );
    expect(r.map((p) => p.uid)).toEqual(['me', 'b', 'c', 'a']);
    expect(r[1]).toMatchObject({ here: true, level: 4 });
    expect(r[3].here).toBe(false);
  });
});

describe('schedule helpers', () => {
  const start = new Date(2026, 9, 22, 18, 30).getTime();
  it('parses the attendance id', () => {
    expect(sessionStartMs('2026-10-22_18-30')).toBe(start);
    expect(sessionStartMs('garbage')).toBeNull();
    expect(sessionDateTimeOf('2026-10-22_18-30')).toEqual({ date: '2026-10-22', time: '18:30' });
  });
  it('lobby opens 10 min before, reminder 15', () => {
    expect(lobbyOpensAtMs(start)).toBe(start - 600_000);
    expect(reminderAtMs(start)).toBe(start - 900_000);
    expect(isJoinedForLater(start, start - 11 * 60_000)).toBe(true);
    expect(isJoinedForLater(start, start - 9 * 60_000)).toBe(false);
    expect(isJoinedForLater(null, 0)).toBe(false);
  });
  it('builds a valid one-event ICS with a 15-minute alarm', () => {
    const ics = buildSessionIcs({ uid: 'u1', title: 'אימון, יחד; test', startMs: Date.UTC(2026, 9, 22, 15, 30), nowMs: Date.UTC(2026, 9, 1), reminderLabel: 'r' });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20261022T153000Z');
    expect(ics).toContain('DTEND:20261022T163000Z');
    expect(ics).toContain('SUMMARY:אימון\\, יחד\; test');
    expect(ics).toContain('TRIGGER:-PT15M');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(googleCalendarUrl({ title: 't', startMs: Date.UTC(2026, 9, 22, 15, 30) })).toContain('dates=20261022T153000Z%2F20261022T163000Z');
  });
});

describe('lobby panel', () => {
  const base = {
    groupName: 'ריצת ערב',
    people: [{ uid: 'me', name: 'אני', isMe: true, here: true }, { uid: 'a', name: 'דני', isMe: false, here: false }],
    decision: decideByLevel([3, 3]),
    countdown: { phase: 'waiting' } as const,
    isHost: false,
    onStart: () => {},
  };
  const html = (p: Parameters<typeof TogetherLobbyPanel>[0]) => renderToStaticMarkup(<TogetherLobbyPanel {...p} />).replaceAll('<!-- -->', '');
  it('shows the one-line explanation, the roster and the waiting note for a guest', () => {
    const h = html(base);
    expect(h).toContain('כולם ברמה 3 בערך — אותו אימון, שעון משותף');
    expect(h).toContain('דני');
    expect(h).toContain('ממתינים שהמארח יתחיל');
    expect(h).not.toContain('מתחילים יחד');
  });
  it('host gets the start button; different levels / paces change the sentence', () => {
    expect(html({ ...base, isHost: true })).toContain('מתחילים יחד');
    expect(html({ ...base, decision: decideByLevel([1, 6]) })).toContain('רמות שונות (1–6)');
    expect(html({ ...base, decision: decideByPace([300, 500]) })).toContain('קצבים שונים');
  });
  it('counts 3-2-1 and then GO', () => {
    expect(html({ ...base, countdown: { phase: 'counting', digit: 2, msToNext: 500 } })).toContain('>2<');
    expect(html({ ...base, countdown: { phase: 'go' } })).toContain('יוצאים!');
  });
});
