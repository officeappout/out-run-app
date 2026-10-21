/* eslint-disable @typescript-eslint/no-explicit-any -- test fakes */
/**
 * The "דמו" filter of בקרת אימונים ומסלולים (PR 5): demo users' generation_log docs, checked
 * on the fly, read-only; the default view never shows them.
 */
import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { makeFakeAdminDb } from '@/lib/__tests__/helpers/fake-admin-db';
import { demoLogToRow, demoRows } from '../review/demo-rows';
import { walkStrengthPushOnly } from './fixtures';

const st = vi.hoisted(() => ({ db: null as any }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/api-auth', () => ({ requireSuperAdminApi: async () => null }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => st.db }));

import { GET } from '@/app/api/admin/generation-review/route';

const ts = (ms: number) => ({ toMillis: () => ms });
const NOW = Date.now();
const log = (uid: string, ageMs: number, extra: Record<string, unknown> = {}) => ({
  uid, type: walkStrengthPushOnly.type, input: walkStrengthPushOnly.input, output: { ...walkStrengthPushOnly.output, whyHe: 'היום יום דחיפה' }, day: '2026-10-21', createdAt: ts(NOW - ageMs), ...extra,
});

describe('demoLogToRow / demoRows', () => {
  it('a demo log becomes a read-only row with the rules run on the fly', () => {
    const row = demoLogToRow('l1', log('demo_qa_alpha', 1000));
    expect(row).toMatchObject({ logId: 'l1', isDemo: true, status: 'open' });
    expect(row!.findings.length).toBeGreaterThan(0);
    expect(row!.ruleIds).toContain('STRENGTH_SINGLE_PATTERN');
    expect(row!.output.whyHe).toBe('היום יום דחיפה');
  });
  it('a real user log or a malformed one is never a demo row', () => {
    expect(demoLogToRow('l2', log('realU', 1000))).toBeNull();
    expect(demoLogToRow('l3', { ...log('demo_x', 1000), type: 'nope' })).toBeNull();
  });
  it('window + newest first', () => {
    const rows = demoRows([
      { id: 'old', data: log('demo_a', 20 * 86_400_000) },
      { id: 'b', data: log('demo_a', 2000) },
      { id: 'a', data: log('demo_b', 1000) },
    ], NOW - 14 * 86_400_000);
    expect(rows.map((r) => r.logId)).toEqual(['a', 'b']);
  });
});

describe('GET /api/admin/generation-review', () => {
  const seed = {
    'generation_log/d1': log('demo_qa_alpha', 1000),
    'generation_log/r1': log('realU', 1000),
    'generation_reviews/r1': { ...log('realU', 1000), findings: [], ruleIds: [], maxSeverity: 0 },
  };
  it('?world=demo lists the demo sessions only', async () => {
    st.db = makeFakeAdminDb(seed).db;
    const body = await (await GET(new NextRequest('http://localhost/api/admin/generation-review?days=14&world=demo'))).json();
    expect(body.world).toBe('demo');
    expect(body.rows.map((r: any) => r.logId)).toEqual(['d1']);
    expect(body.demoSummary).toMatchObject({ sessions: 1, flagged: 1 });
  });
  it('the default view is unchanged (reviews only — demo hidden)', async () => {
    st.db = makeFakeAdminDb(seed).db;
    const body = await (await GET(new NextRequest('http://localhost/api/admin/generation-review?days=14'))).json();
    expect(body.rows.map((r: any) => r.logId)).toEqual(['r1']);
    expect(body.rows.some((r: any) => r.isDemo)).toBe(false);
  });
});
