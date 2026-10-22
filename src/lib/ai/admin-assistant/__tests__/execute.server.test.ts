/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const reads = vi.hoisted(() => ({ n: 0 }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
vi.mock('@/lib/admin-analytics/ops-metrics.server', () => {
  const ok = (definitionId: string, value: unknown) => async () => {
    reads.n += 1;
    return { value, meta: { definitionId, period: { from: null, to: '2026-10-22', tz: 'Asia/Jerusalem' }, n: 3, minSample: null, belowThreshold: false, caveats: [] } };
  };
  return {
    getPendingApprovals: ok('pending_approvals', { total: 3, byType: { parks: 3 } }),
    getCrmPipeline: ok('crm_pipeline', { inPipeline: 9 }),
    getAiCosts: async () => {
      reads.n += 1;
      return { value: null, meta: { definitionId: 'ai_cost', period: { from: null, to: 'x', tz: 'Asia/Jerusalem' }, n: null, minSample: null, belowThreshold: false, caveats: [] }, error: 'unavailable' };
    },
    getAttentionQueue: ok('attention_queue', { pendingParks: 1 }),
  };
});

import { executeAdminTool, type AdminToolContext } from '../execute.server';

const ctx = (role: 'root' | 'super'): AdminToolContext => ({ uid: 'u1', role, db: {} as any, now: new Date('2026-10-22T10:00:00Z') });

beforeEach(() => {
  reads.n = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('executeAdminTool — every call re-checked on the server', () => {
  it('an unknown tool name is never executed (zero reads)', async () => {
    const r = await executeAdminTool(ctx('root'), 'run_query', { q: 'select *' });
    expect(r.isError).toBe(true);
    expect(reads.n).toBe(0);
  });
  it('invalid input is rejected before any read (strict schemas: extra keys)', async () => {
    const r = await executeAdminTool(ctx('root'), 'get_pending_approvals', { authorityId: 'other-city' });
    expect(r.isError).toBe(true);
    expect(reads.n).toBe(0);
  });
  it('data tools return the envelope wrapped in <tool_data> and evidence numbers', async () => {
    const r = await executeAdminTool(ctx('super'), 'get_pending_approvals', {});
    expect(r.content.startsWith('<tool_data>')).toBe(true);
    expect(r.content).toContain('"definitionId":"pending_approvals"');
    expect(r.evidence?.numbers).toEqual([3, 3]);
  });
  it('a value that could not be computed is an error, never 0', async () => {
    const r = await executeAdminTool(ctx('super'), 'get_ai_costs', {});
    expect(r.isError).toBe(true);
    expect(r.content).toContain('NOT zero');
    expect(r.evidence).toBeUndefined();
  });
  it('navigate: only map pages the caller may open; builds the href server-side', async () => {
    const ok = await executeAdminTool(ctx('super'), 'navigate', { pageId: 'admin/costs', id: null });
    expect(ok.link).toEqual({ href: '/admin/costs', title: 'עלויות', pageId: 'admin/costs' });
    const rootOnly = await executeAdminTool(ctx('super'), 'navigate', { pageId: 'admin/agents', id: null });
    expect(rootOnly.isError).toBe(true);
    expect((await executeAdminTool(ctx('root'), 'navigate', { pageId: 'admin/agents', id: null })).link?.href).toBe('/admin/agents');
    const made = await executeAdminTool(ctx('root'), 'navigate', { pageId: 'https://evil.example', id: null });
    expect(made.isError).toBe(true);
  });
  it('navigate to a detail page needs a safe id', async () => {
    expect((await executeAdminTool(ctx('root'), 'navigate', { pageId: 'admin/authorities/[id]', id: null })).isError).toBe(true);
    expect((await executeAdminTool(ctx('root'), 'navigate', { pageId: 'admin/authorities/[id]', id: '../../x' })).isError).toBe(true);
    expect((await executeAdminTool(ctx('root'), 'navigate', { pageId: 'admin/authorities/[id]', id: 'abc123' })).link?.href).toBe('/admin/authorities/abc123');
  });
  it('find_admin_page respects the role', async () => {
    const asSuper = await executeAdminTool(ctx('super'), 'find_admin_page', { query: 'פאנל סוכנים' });
    expect(asSuper.content).not.toContain('admin/agents');
    const asRoot = await executeAdminTool(ctx('root'), 'find_admin_page', { query: 'פאנל סוכנים' });
    expect(asRoot.content).toContain('admin/agents');
  });
});

describe('wave 4 tools — strict inputs', () => {
  it('north star rejects a bad segment value before any read', async () => {
    const r = await executeAdminTool(ctx('super'), 'get_north_star', { cityAuthorityId: null, source: null, campaign: null, sex: 'x', level: null, program: null, ageFrom: null, ageTo: null });
    expect(r.isError).toBe(true);
    expect(reads.n).toBe(0);
  });
  it('north star needs every key (strict schema) — a missing key is rejected', async () => {
    expect((await executeAdminTool(ctx('super'), 'get_north_star', {})).isError).toBe(true);
  });
  it('onboarding days are bounded 7-90', async () => {
    expect((await executeAdminTool(ctx('super'), 'get_onboarding_stall', { days: 365 })).isError).toBe(true);
    expect((await executeAdminTool(ctx('super'), 'get_onboarding_stall', { days: 3 })).isError).toBe(true);
  });
  it('push performance channel must be a catalog channel', async () => {
    expect((await executeAdminTool(ctx('super'), 'get_push_performance', { channel: 'drop', days: null })).isError).toBe(true);
  });
});
