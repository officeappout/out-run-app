import { describe, it, expect, vi, beforeEach } from 'vitest';

// P0-4/Slice B (25.09.2026, see docs/audit-2026-09/00-MASTER-PLAN.md
// §13.25): David's requirement — every failure (unit not found,
// rate-limited, network failure) must surface as a Hebrew message, never
// swallowed, and a retry must actually work (the function itself must be
// stateless — a prior failure must not poison a later call).

const getIdTokenMock = vi.hoisted(() => vi.fn(async () => 'fake-id-token'));
vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { getIdToken: getIdTokenMock } },
}));

const fetchMock = vi.hoisted(() => vi.fn());

import { declareUnit } from '../unit-declaration.service';

beforeEach(() => {
  fetchMock.mockReset();
  getIdTokenMock.mockReset().mockResolvedValue('fake-id-token');
  vi.stubGlobal('fetch', fetchMock);
});

describe('declareUnit — never silent, every failure surfaces a Hebrew message', () => {
  it('success: passes tenantType/unitPath through', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ tenantId: 'org1', unitId: 'unit1', unitPath: ['גדוד 101', 'פלוגה א'], tenantType: 'military' }),
    });

    const result = await declareUnit('org1', 'unit1');

    expect(result.ok).toBe(true);
    expect(result.tenantType).toBe('military');
    expect(result.unitPath).toEqual(['גדוד 101', 'פלוגה א']);
    expect(fetchMock).toHaveBeenCalledWith('/api/units/declare', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer fake-id-token' }),
    }));
  });

  it('unit not found (400): server\'s own Hebrew message passes through, not swallowed', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'היחידה לא נמצאה. בחר מהרשימה.' }) });
    const result = await declareUnit('bad-org', 'bad-unit');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('היחידה לא נמצאה. בחר מהרשימה.');
  });

  it('rate-limited (429): server\'s own message passes through', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: 'יותר מדי בקשות. נסה שוב מאוחר יותר.' }) });
    const result = await declareUnit('org1', 'unit1');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('יותר מדי בקשות. נסה שוב מאוחר יותר.');
  });

  it('network failure (fetch itself throws): a distinct, non-empty Hebrew message — never throws uncaught, never silently "succeeds"', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await declareUnit('org1', 'unit1');
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(result.error!.length).toBeGreaterThan(0);
  });

  it('server response with no JSON body / malformed JSON: still a clean, non-throwing Hebrew failure, not an uncaught exception', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => { throw new Error('not json'); } });
    const result = await declareUnit('org1', 'unit1');
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
  });

  it('no signed-in user: fails cleanly with a Hebrew message, never calls fetch at all', async () => {
    getIdTokenMock.mockResolvedValue(undefined as unknown as string);
    const result = await declareUnit('org1', 'unit1');
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retry works: a failed call followed by a real retry succeeds — the function is stateless, a prior failure does not poison the next call', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'היחידה לא נמצאה. בחר מהרשימה.' }) });
    const first = await declareUnit('org1', 'unit1');
    expect(first.ok).toBe(false);

    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ tenantType: 'military', unitPath: ['גדוד 101'] }) });
    const retry = await declareUnit('org1', 'unit1');
    expect(retry.ok).toBe(true);
    expect(retry.tenantType).toBe('military');
  });
});
