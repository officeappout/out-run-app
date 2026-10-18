/**
 * computeAutomationStatuses / serializeAutomationStatus — pure parts plus a
 * fake Firestore, so the "read-only, whitelisted fields, one bad source
 * doesn't break the panel" contract is checked without the emulator.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { Firestore } from 'firebase-admin/firestore';
import { computeAutomationStatuses, serializeAutomationStatus } from '@/lib/agentsPanelServer';
import { AUTOMATION_REGISTRY } from '@/features/admin/agents/agent-registry';

const def = (id: string) => AUTOMATION_REGISTRY.find((a) => a.id === id)!;
const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe('serializeAutomationStatus', () => {
  it('no source → available:false', () => {
    expect(serializeAutomationStatus(def('shape-review'), null)).toMatchObject({ available: false, lastAt: null });
  });

  it('geo discovery: timestamp, status token and counts; nothing else', () => {
    const out = serializeAutomationStatus(def('geo-discovery'), {
      createdAt: ts('2026-10-14T10:00:00.000Z'),
      status: 'succeeded',
      keptCount: 12,
      droppedCount: 3,
      requestedByUid: 'should-not-leak',
    });
    expect(out).toEqual({
      automationId: 'geo-discovery',
      available: true,
      lastAt: '2026-10-14T10:00:00.000Z',
      status: 'succeeded',
      counts: [{ label: 'נשמרו', value: 12 }, { label: 'נפסלו', value: 3 }],
      error: null,
    });
    expect(JSON.stringify(out)).not.toContain('should-not-leak');
  });

  it('crm: nested stats paths; free-text status is dropped', () => {
    const out = serializeAutomationStatus(def('crm-agent'), {
      savedAt: ts('2026-10-14T05:07:30.000Z'),
      stats: { threadsScanned: 40, threadsMatched: 5, authoritiesUpdated: 2 },
    });
    expect(out.counts.map((c) => c.value)).toEqual([40, 5, 2]);
    const push = serializeAutomationStatus(def('push-queue'), {
      processedAt: ts('2026-10-14T05:07:30.000Z'),
      status: 'some free text with spaces',
    });
    expect(push.status).toBeNull();
  });
});

describe('computeAutomationStatuses (fake db)', () => {
  it('reads newest doc per source with select() of whitelisted fields; a failing source → error, others fine', async () => {
    const calls: { collection: string; orderBy: string; dir: string; limit: number; select: string[] }[] = [];
    const db = {
      collection(name: string) {
        const call = { collection: name, orderBy: '', dir: '', limit: 0, select: [] as string[] };
        const q = {
          orderBy(f: string, dir: string) { call.orderBy = f; call.dir = dir; return q; },
          limit(n: number) { call.limit = n; return q; },
          select(...f: string[]) { call.select = f; return q; },
          async get() {
            calls.push(call);
            if (name === 'crm_runs') throw new Error('boom');
            if (name === 'city_mapping_discovery_runs') {
              return { docs: [{ data: () => ({ createdAt: ts('2026-10-14T10:00:00.000Z'), status: 'failed' }) }] };
            }
            return { docs: [] };
          },
        };
        return q;
      },
      // Any write API on the fake would be a contract break — none exist.
    } as unknown as Firestore;

    const out = await computeAutomationStatuses(db);
    expect(out).toHaveLength(AUTOMATION_REGISTRY.length);
    const byId = Object.fromEntries(out.map((s) => [s.automationId, s]));
    expect(byId['geo-discovery']).toMatchObject({ status: 'failed', lastAt: '2026-10-14T10:00:00.000Z', error: null });
    expect(byId['crm-agent']).toMatchObject({ error: 'unavailable', lastAt: null });
    expect(byId['shape-review']).toMatchObject({ available: false });
    expect(byId['league-steps-rollup']).toMatchObject({ available: true, lastAt: null, error: null });

    const latestDocCount = AUTOMATION_REGISTRY.filter((a) => a.statusSource?.kind === 'latestDoc').length;
    expect(calls).toHaveLength(latestDocCount);
    for (const c of calls) {
      expect(c.dir).toBe('desc');
      expect(c.limit).toBe(1);
      expect(c.select[0]).toBe(c.orderBy);
    }
    expect(calls.find((c) => c.collection === 'city_mapping_discovery_runs')?.select).toEqual(
      ['createdAt', 'status', 'keptCount', 'droppedCount'],
    );
  });
});
