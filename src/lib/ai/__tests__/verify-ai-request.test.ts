import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, fieldValueMock } from './mock-admin-db';

// Synthetic uids/tokens only. verifyIdToken is mocked: 'good-<uid>' → that uid.
const state = vi.hoisted(() => ({
  db: null as any,
  verifyIdToken: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: fieldValueMock }));
vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => state.db,
  getAdminAuth: () => ({ verifyIdToken: state.verifyIdToken }),
}));

import { verifyAiRequest, aiDenialResponse } from '../verify-ai-request.server';
import { aiDayKey } from '../anthropic.server';

const UID = 'synthAdultAAAAAAAAAAAAAAAAAA';
const MINOR = 'synthMinorBBBBBBBBBBBBBBBBBB';

function req(token?: string) {
  return new Request('https://example.test/api/ai/x', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

function seed(overrides: Record<string, Record<string, unknown>> = {}) {
  return {
    [`users/${UID}`]: { core: { ageGroup: 'adult' } },
    [`users/${MINOR}`]: { core: { ageGroup: 'minor' } },
    'system_config/feature_flags': { ai_coach_enabled: true, ai_coach_free_for_all: true },
    'app_config/ai': { dailyBudgetUsd: 5, killSwitch: false, rateLimitPerHour: 2, rateLimitPerDay: 40 },
    ...overrides,
  };
}

beforeEach(() => {
  state.db = createMockDb(seed());
  state.verifyIdToken.mockReset();
  state.verifyIdToken.mockImplementation(async (token: string, checkRevoked: boolean) => {
    if (!checkRevoked) throw new Error('checkRevoked must be true');
    if (token.startsWith('good-')) return { uid: token.slice(5) };
    throw new Error('bad token');
  });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('verifyAiRequest', () => {
  it('401 without a bearer token', async () => {
    expect(await verifyAiRequest(req())).toMatchObject({ ok: false, status: 401, code: 'missing_token' });
  });

  it('401 on an invalid / revoked token (checkRevoked=true)', async () => {
    expect(await verifyAiRequest(req('forged'))).toMatchObject({ ok: false, status: 401, code: 'invalid_token' });
    expect(state.verifyIdToken).toHaveBeenCalledWith('forged', true);
  });

  it('grants an adult when AI is on (free-for-all), returning uid + profile + config', async () => {
    const res = await verifyAiRequest(req(`good-${UID}`));
    expect(res).toMatchObject({ ok: true, uid: UID, profile: { core: { ageGroup: 'adult' } } });
    if (res.ok) expect(res.config.rateLimitPerHour).toBe(2);
  });

  it('403 for a minor, and for a user with no profile', async () => {
    expect(await verifyAiRequest(req(`good-${MINOR}`))).toMatchObject({ status: 403, code: 'not_adult' });
    expect(await verifyAiRequest(req('good-nobody'))).toMatchObject({ status: 403, code: 'profile_not_found' });
  });

  it('403 when the master flag is off or the flag doc is missing (default off)', async () => {
    state.db = createMockDb(seed({ 'system_config/feature_flags': { ai_coach_enabled: false, ai_coach_free_for_all: true } }));
    expect(await verifyAiRequest(req(`good-${UID}`))).toMatchObject({ status: 403, code: 'ai_not_available' });
    const s = seed();
    delete (s as Record<string, unknown>)['system_config/feature_flags'];
    state.db = createMockDb(s);
    expect(await verifyAiRequest(req(`good-${UID}`))).toMatchObject({ status: 403, code: 'ai_not_available' });
  });

  it('a flags read failure keeps AI off (fail closed)', async () => {
    state.db = createMockDb(seed(), { failGets: new Set(['system_config/feature_flags']) });
    expect(await verifyAiRequest(req(`good-${UID}`))).toMatchObject({ status: 403, code: 'ai_not_available' });
  });

  it('free-for-all key missing → defaults OFF: enabling the master flag alone never opens AI to everyone', async () => {
    state.db = createMockDb(seed({ 'system_config/feature_flags': { ai_coach_enabled: true } }));
    expect(await verifyAiRequest(req(`good-${UID}`))).toMatchObject({ status: 403, code: 'ai_not_available' });

    state.db = createMockDb(
      seed({
        'system_config/feature_flags': { ai_coach_enabled: true },
        [`entitlements/${UID}`]: { aiCoach: { active: true, source: 'free_launch' } },
      }),
    );
    expect(await verifyAiRequest(req(`good-${UID}`))).toMatchObject({ ok: true });
  });

  it('without free-for-all, requires an active entitlement', async () => {
    const flags = { 'system_config/feature_flags': { ai_coach_enabled: true, ai_coach_free_for_all: false } };
    state.db = createMockDb(seed(flags));
    expect(await verifyAiRequest(req(`good-${UID}`))).toMatchObject({ status: 403, code: 'ai_not_available' });

    state.db = createMockDb(seed({ ...flags, [`entitlements/${UID}`]: { aiCoach: { active: true, source: 'paid', until: Date.now() + 60_000 } } }));
    expect(await verifyAiRequest(req(`good-${UID}`))).toMatchObject({ ok: true });

    state.db = createMockDb(seed({ ...flags, [`entitlements/${UID}`]: { aiCoach: { active: true, source: 'paid', until: Date.now() - 1 } } }));
    expect(await verifyAiRequest(req(`good-${UID}`))).toMatchObject({ status: 403, code: 'ai_not_available' });
  });

  it('503 on kill switch, over budget, or an unreadable entitlement/config', async () => {
    state.db = createMockDb(seed({ 'app_config/ai': { killSwitch: true } }));
    expect(await verifyAiRequest(req(`good-${UID}`))).toMatchObject({ status: 503, code: 'kill_switch' });

    state.db = createMockDb(seed({ [`ai_usage_global/${aiDayKey()}`]: { costUsd: 99 } }));
    expect(await verifyAiRequest(req(`good-${UID}`))).toMatchObject({ status: 503, code: 'over_budget' });

    state.db = createMockDb(seed(), { failGets: new Set(['app_config/ai']) });
    expect(await verifyAiRequest(req(`good-${UID}`))).toMatchObject({ status: 503, code: 'unavailable' });

    state.db = createMockDb(seed(), { failGets: new Set([`entitlements/${UID}`]) });
    expect(await verifyAiRequest(req(`good-${UID}`))).toMatchObject({ status: 503, code: 'unavailable' });
  });

  it('429 past the per-user limit; a limiter failure also blocks (fail closed)', async () => {
    expect((await verifyAiRequest(req(`good-${UID}`))).ok).toBe(true);
    expect((await verifyAiRequest(req(`good-${UID}`))).ok).toBe(true);
    const third = await verifyAiRequest(req(`good-${UID}`));
    expect(third).toMatchObject({ status: 429, code: 'rate_limited', retryAfterSec: 3600 });

    state.db = createMockDb(seed(), { failTransactions: true });
    expect(await verifyAiRequest(req(`good-${UID}`))).toMatchObject({ status: 429, code: 'rate_limited' });
  });

  it('a killed day does not consume the user quota', async () => {
    state.db = createMockDb(seed({ 'app_config/ai': { killSwitch: true, rateLimitPerHour: 1 } }));
    await verifyAiRequest(req(`good-${UID}`));
    expect([...state.db.docs.keys()].some((k: string) => k.startsWith('rate_limits/'))).toBe(false);
  });

  it('Retry-After is the real time left in the window, and the denial carries uid + profile + flags (never in the response)', async () => {
    const t0 = Date.now() - 20 * 60_000; // the hour window opened 20 minutes ago
    state.db = createMockDb(seed({ [`rate_limits/ai:uid:${UID}:hour`]: { count: 2, windowStart: new Date(t0) } }));
    const d = await verifyAiRequest(req(`good-${UID}`));
    expect(d).toMatchObject({ status: 429, code: 'rate_limited', uid: UID, profile: { core: { ageGroup: 'adult' } } });
    if (!d.ok) {
      expect(d.retryAfterSec).toBeGreaterThan(39 * 60);
      expect(d.retryAfterSec).toBeLessThanOrEqual(40 * 60);
      expect(d.flags).toBeDefined();
      expect(await aiDenialResponse(d).json()).toEqual({ error: 'rate_limited' });
    }
  });

  it('the OUT team (root admin email or super admin) is exempt from the per-user limit only', async () => {
    const ADMIN = 'synthAdminCCCCCCCCCCCCCCCCCC';
    const SUPER = 'synthSuperDDDDDDDDDDDDDDDDDD';
    state.verifyIdToken.mockImplementation(async (token: string) => {
      if (token === 'root') return { uid: ADMIN, email: 'office@appout.co.il' };
      if (token === 'super') return { uid: SUPER, email: 'someone@example.test' };
      if (token.startsWith('good-')) return { uid: token.slice(5) };
      throw new Error('bad token');
    });
    const users = {
      [`users/${ADMIN}`]: { core: { ageGroup: 'adult' } },
      [`users/${SUPER}`]: { core: { ageGroup: 'adult', isSuperAdmin: true } },
    };
    state.db = createMockDb(seed(users));
    for (let i = 0; i < 5; i++) {
      expect((await verifyAiRequest(req('root'))).ok).toBe(true);
      expect((await verifyAiRequest(req('super'))).ok).toBe(true);
    }
    // A regular user with the same config is limited after 2.
    await verifyAiRequest(req(`good-${UID}`));
    await verifyAiRequest(req(`good-${UID}`));
    expect(await verifyAiRequest(req(`good-${UID}`))).toMatchObject({ code: 'rate_limited' });

    // Still subject to the kill switch and the budget.
    state.db = createMockDb(seed({ ...users, 'app_config/ai': { killSwitch: true } }));
    expect(await verifyAiRequest(req('root'))).toMatchObject({ status: 503, code: 'kill_switch' });
    state.db = createMockDb(seed({ ...users, [`ai_usage_global/${aiDayKey()}`]: { costUsd: 99 } }));
    expect(await verifyAiRequest(req('super'))).toMatchObject({ status: 503, code: 'over_budget' });
  });

  it('rateLimit: false skips the per-user limit (a paid-for continuation) but not the budget', async () => {
    for (let i = 0; i < 5; i++) expect((await verifyAiRequest(req(`good-${UID}`), { rateLimit: false })).ok).toBe(true);
    expect([...state.db.docs.keys()].some((k: string) => k.startsWith('rate_limits/'))).toBe(false);
    state.db = createMockDb(seed({ 'app_config/ai': { killSwitch: true } }));
    expect(await verifyAiRequest(req(`good-${UID}`), { rateLimit: false })).toMatchObject({ code: 'kill_switch' });
  });

  it('aiDenialResponse sets status, body and Retry-After', async () => {
    const res = aiDenialResponse({ ok: false, status: 429, code: 'rate_limited', retryAfterSec: 3600 });
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('3600');
    expect(await res.json()).toEqual({ error: 'rate_limited' });
  });
});
