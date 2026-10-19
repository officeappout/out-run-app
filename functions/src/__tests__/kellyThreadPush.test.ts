import { describe, expect, it, vi } from 'vitest';

/**
 * Unified Kelly — onKellyThreadMessage's pure push decision: only team ('human') and app
 * ('system') messages, never AI / user, never migrated copies or stale backfills.
 */
vi.mock('firebase-admin', () => ({ apps: [{}], initializeApp: vi.fn(), firestore: () => ({}), messaging: () => ({}) }));
vi.mock('firebase-functions', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('firebase-functions/v2/firestore', () => ({ onDocumentCreated: (_o: unknown, fn: unknown) => fn }));
vi.mock('../services/push.service', () => ({ sendPush: vi.fn() }));

import { KELLY_PUSH_DEEP_LINK, kellyProactivePushPlan, kellyPushBody, kellyPushDecision } from '../onKellyThreadMessage';

const at = (ms: number) => ({ toMillis: () => ms });
const NOW = 10_000_000;

describe('kellyPushDecision', () => {
  it('pushes team and system messages', () => {
    expect(kellyPushDecision({ source: 'human', text: 'היי', createdAt: at(NOW) }, NOW).push).toBe(true);
    expect(kellyPushDecision({ source: 'system', text: 'ברוך הבא', createdAt: at(NOW) }, NOW).push).toBe(true);
  });
  it('never AI replies, user messages or legacy (no source) messages', () => {
    for (const source of ['ai', 'user', undefined]) {
      expect(kellyPushDecision({ source, text: 'x', createdAt: at(NOW) }, NOW)).toEqual({ push: false, reason: 'source' });
    }
  });
  it('never migrated copies or stale backfills', () => {
    expect(kellyPushDecision({ source: 'human', text: 'x', migratedFrom: { chatId: 'c' }, createdAt: at(NOW) }, NOW).reason).toBe('migrated');
    expect(kellyPushDecision({ source: 'human', text: 'x', noPush: true }, NOW).reason).toBe('migrated');
    expect(kellyPushDecision({ source: 'human', text: 'x', createdAt: at(NOW - 11 * 60_000) }, NOW).reason).toBe('stale');
  });
  it('empty text is not pushed; body is trimmed and capped', () => {
    expect(kellyPushDecision({ source: 'human', text: '  ' }, NOW).push).toBe(false);
    expect(kellyPushBody(' a \n b ')).toBe('a b');
    expect(kellyPushBody('x'.repeat(150))).toHaveLength(103);
    expect(KELLY_PUSH_DEEP_LINK).toBe('/ai-coach');
  });
});

describe('Kelly phase 3 — proactive messages', () => {
  it('a normal team / app message is not proactive (unchanged path)', () => {
    expect(kellyProactivePushPlan({ source: 'human', text: 'x' })).toBeNull();
    expect(kellyProactivePushPlan({ source: 'system', text: 'ברוך הבא' })).toBeNull();
    expect(kellyProactivePushPlan(undefined)).toBeNull();
  });
  it('a proactive message counts in the daily cap and is not a personal interaction', () => {
    expect(kellyProactivePushPlan({ source: 'system', text: 'x', proactive: { trigger: 'morning' } })).toEqual({
      test: false,
      trigger: 'morning',
      countTowardDailyCap: true,
      isPersonalInteraction: false,
    });
  });
  it('a panel test send skips the daily cap', () => {
    expect(kellyProactivePushPlan({ source: 'system', text: 'x', proactive: { trigger: 'weekly', test: true } })).toMatchObject({ countTowardDailyCap: false, isPersonalInteraction: true });
  });
  it('a silent proactive message (noPush) is never pushed', () => {
    expect(kellyPushDecision({ source: 'system', text: 'x', noPush: true, proactive: { trigger: 'morning' }, createdAt: at(NOW) }, NOW).push).toBe(false);
  });
});
