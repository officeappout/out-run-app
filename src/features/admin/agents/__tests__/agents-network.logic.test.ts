import { describe, it, expect } from 'vitest';
import { agentNodeStatus, buildNetworkSummary, ringPositions } from '../agents-network.logic';
import type { AgentFinding, AgentOverview } from '../agent-findings.types';

const NOW = Date.parse('2026-10-14T12:00:00.000Z');

const overview = (agentId: string, unreadCount: number, lastRunAt: string | null): AgentOverview => ({
  agentId, lastRunAt, lastSuccessAt: lastRunAt, lastError: null, consecutiveFailures: 0, unreadCount,
});

const f = (id: string, severity: string, read = false): AgentFinding => ({
  id, severity, kind: 'new', topic: 't', title: id, counts: { lastHour: 0, last24h: 0, total: 0 },
  platform: 'web', suspectedPr: null, confidence: 'none', suggestion: '', sourceUrl: null,
  firstSeenAt: null, lastSeenAt: null, createdAt: null, readAt: read ? '2026-10-14T11:00:00.000Z' : null,
});

describe('agentNodeStatus', () => {
  it('recent run → active; never ran / stale / missing → pending', () => {
    expect(agentNodeStatus(overview('a', 0, '2026-10-14T11:30:00.000Z'), NOW)).toBe('active');
    expect(agentNodeStatus(overview('a', 0, null), NOW)).toBe('pending');
    expect(agentNodeStatus(overview('a', 0, '2026-10-14T08:00:00.000Z'), NOW)).toBe('pending');
    expect(agentNodeStatus(undefined, NOW)).toBe('pending');
  });
});

describe('buildNetworkSummary', () => {
  it('sums unread across registered agents only; critical counted from loaded unread findings', () => {
    const s = buildNetworkSummary(
      ['a', 'b'],
      [overview('a', 3, null), overview('b', 1, null), overview('ghost', 9, null)],
      { a: [f('1', 'critical'), f('2', 'high'), f('3', 'critical')], b: [f('4', 'critical')] },
    );
    expect(s).toEqual({ agentCount: 2, openFindings: 4, critical: 3 });
  });

  it('read findings are not counted as critical', () => {
    const s = buildNetworkSummary(['a'], [overview('a', 1, null)], { a: [f('1', 'critical', true), f('2', 'critical')] });
    expect(s.critical).toBe(1);
  });

  it('nothing open → critical 0 without needing findings; open but not loaded → null (unknown, not 0)', () => {
    expect(buildNetworkSummary(['a'], [overview('a', 0, null)], {}).critical).toBe(0);
    expect(buildNetworkSummary(['a'], [overview('a', 2, null)], {}).critical).toBeNull();
  });
});

describe('ringPositions', () => {
  it('first node at the top, evenly spaced, distinct', () => {
    const p = ringPositions(4);
    expect(p[0]).toEqual({ x: 0, y: -230 });
    expect(p[1]).toEqual({ x: 230, y: 0 });
    expect(new Set(p.map((q) => `${q.x},${q.y}`)).size).toBe(4);
  });

  it('radius grows past 6 satellites; 0 → empty', () => {
    const r = (q: { x: number; y: number }) => Math.round(Math.hypot(q.x, q.y));
    expect(r(ringPositions(6)[0])).toBe(230);
    expect(r(ringPositions(8)[0])).toBe(274);
    expect(ringPositions(0)).toEqual([]);
  });
});
