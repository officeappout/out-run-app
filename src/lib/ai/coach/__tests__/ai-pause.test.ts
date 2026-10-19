import { describe, expect, it } from 'vitest';
import { violatesVoice } from '@/features/workout-engine/services/coach-note';
import {
  AI_PAUSE_CODES,
  aiPauseReply,
  isAiPauseCode,
  looksLikeSupportRequest,
  needsHumanReasonFor,
  NEEDS_HUMAN_REASON_LABEL,
  nextAiPause,
  pausedMessageNeedsHuman,
  refusedSendAction,
  reopenPhrase,
  shouldSendPauseReply,
} from '../ai-pause';
import { TEAM_FALLBACK_CODES } from '../unified-thread';
import { kellyThreadRow } from '../kelly-admin';

const NOON = new Date(Date.UTC(2026, 9, 19, 9, 0)); // 12:00 Israel (UTC+3)
const LATE = new Date(Date.UTC(2026, 9, 19, 20, 7)); // 23:07 Israel

describe('reopenPhrase', () => {
  it('Israel time, rounded up to 5 minutes; "מחר" when it reopens tomorrow', () => {
    expect(reopenPhrase(3600, NOON)).toBe('בסביבות 13:00');
    expect(reopenPhrase(61, NOON)).toBe('בסביבות 12:05');
    expect(reopenPhrase(10 * 3600, LATE)).toBe('מחר בסביבות 09:10');
  });
});

describe('aiPauseReply', () => {
  it('rate limited: why + when + how to reach the team, gendered to the user', () => {
    expect(aiPauseReply('rate_limited', 'male', { retryAfterSec: 20 * 3600, now: LATE })).toBe(
      'דיברנו המון היום. אני חוזר לענות מחר בסביבות 19:10. אם זה דחוף, תכתוב לי שזה דחוף והצוות שלנו יענה לך כאן.',
    );
    expect(aiPauseReply('rate_limited', 'female', { retryAfterSec: 1800, now: NOON })).toBe(
      'דיברנו המון בשעה האחרונה. אני חוזר לענות בסביבות 12:30. אם זה דחוף, תכתבי לי שזה דחוף והצוות שלנו יענה לך כאן.',
    );
    expect(aiPauseReply('rate_limited', 'other', { now: NOON })).toContain('אפשר לכתוב לי שזה דחוף');
  });

  it('no team promise without the team channel', () => {
    expect(aiPauseReply('rate_limited', 'male', { retryAfterSec: 600, now: NOON, teamChannel: false })).not.toContain('הצוות');
    expect(aiPauseReply('kill_switch', 'male', { teamChannel: false })).not.toContain('הצוות');
  });

  it('every variant keeps Kelly’s voice: male first person, no slash, emoji, dash or English', () => {
    for (const code of AI_PAUSE_CODES) {
      for (const g of ['male', 'female', 'other'] as const) {
        for (const teamChannel of [true, false]) {
          const t = aiPauseReply(code, g, { retryAfterSec: 5000, now: NOON, teamChannel });
          expect(t).not.toMatch(/[/\\]/);
          expect(violatesVoice(t)).toBe(false);
          expect(t).not.toMatch(/אני (?:חוזרת|זמינה)/);
        }
      }
    }
  });
});

describe('team queue rule', () => {
  it('rate-limited chatter stays out; support-looking text and every other pause go in', () => {
    expect(pausedMessageNeedsHuman('rate_limited', 'ומה עם מתיחות אחרי ריצה?')).toBe(false);
    expect(pausedMessageNeedsHuman('rate_limited', 'דחוף')).toBe(true);
    for (const t of ['האפליקציה לא עובדת', 'חייבו אותי פעמיים', 'אני רוצה לבטל מנוי', 'אפשר נציג?', 'urgent help']) {
      expect(looksLikeSupportRequest(t)).toBe(true);
    }
    for (const code of ['kill_switch', 'over_budget', 'unavailable'] as const) expect(pausedMessageNeedsHuman(code, 'היי')).toBe(true);
  });

  it('reasons map to admin labels', () => {
    for (const code of AI_PAUSE_CODES) expect(NEEDS_HUMAN_REASON_LABEL[needsHumanReasonFor(code)]).toBeTruthy();
    expect(kellyThreadRow('u', { needsHuman: true, needsHumanReason: 'ai_rate_limited' }, {}).needsHumanReason).toBe('ai_rate_limited');
    expect(kellyThreadRow('u', { needsHuman: true, needsHumanReason: 'bogus' }, {}).needsHumanReason).toBeNull();
    expect(kellyThreadRow('u', { needsHuman: true }, {}).needsHumanReason).toBeNull();
  });
});

describe('once per window', () => {
  it('replies when there was no pause, the reason changed, or the window passed', () => {
    const p = nextAiPause('rate_limited', 1000, 60);
    expect(p).toEqual({ code: 'rate_limited', untilMs: 61_000 });
    expect(shouldSendPauseReply(undefined, 'rate_limited', 2000)).toBe(true);
    expect(shouldSendPauseReply(p, 'rate_limited', 2000)).toBe(false);
    expect(shouldSendPauseReply(p, 'kill_switch', 2000)).toBe(true);
    expect(shouldSendPauseReply(p, 'rate_limited', 61_000)).toBe(true);
    expect(nextAiPause('kill_switch', 0).untilMs).toBe(3600_000); // unknown reopen → hourly at most
  });
});

describe('refusedSendAction (chat screen)', () => {
  const ctx = { unified: true, isMessage: true, teamFallbackCodes: TEAM_FALLBACK_CODES };
  it('stored by the route → just go idle (the live thread shows the reply)', () => {
    expect(refusedSendAction({ code: 'rate_limited', storedForTeam: true }, ctx)).toBe('stored');
  });
  it('no AI for this user → team-only; unified off or a tool result → error card', () => {
    expect(refusedSendAction({ code: 'not_adult' }, ctx)).toBe('team');
    expect(refusedSendAction({ code: 'rate_limited' }, ctx)).toBe('team'); // older server
    expect(refusedSendAction({ code: 'rate_limited', storedForTeam: true }, { ...ctx, unified: false })).toBe('error');
    expect(refusedSendAction({ code: 'rate_limited' }, { ...ctx, isMessage: false })).toBe('error');
    expect(refusedSendAction({ code: 'invalid_token' }, ctx)).toBe('error');
  });
  it('codes', () => {
    expect(isAiPauseCode('rate_limited')).toBe(true);
    expect(isAiPauseCode('not_adult')).toBe(false);
  });
});
