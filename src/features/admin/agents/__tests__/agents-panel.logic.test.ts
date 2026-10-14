import { describe, it, expect } from 'vitest';
import {
  applyOptimisticRead,
  groupFindingsByTopic,
  isAgentStale,
  revertOptimisticRead,
  safeHttpUrl,
  type PanelState,
} from '../agents-panel.logic';
import type { AgentFinding, AgentOverview } from '../agent-findings.types';

function finding(id: string, topic: string, createdMin: number, read = false): AgentFinding {
  const iso = (m: number) => new Date(Date.UTC(2026, 9, 14, 10, m)).toISOString();
  return {
    id, topic, kind: 'new', title: id, severity: 'high',
    counts: { lastHour: 1, last24h: 1, total: 1 }, platform: 'web',
    suspectedPr: null, confidence: 'none', suggestion: '', sourceUrl: null,
    firstSeenAt: null, lastSeenAt: null, createdAt: iso(createdMin), readAt: read ? iso(59) : null,
  };
}

const agent = (unreadCount: number, lastRunAt: string | null = '2026-10-14T10:00:00.000Z'): AgentOverview => ({
  agentId: 'oncall', lastRunAt, lastSuccessAt: lastRunAt, lastError: null, consecutiveFailures: 0, unreadCount,
});

describe('groupFindingsByTopic', () => {
  it('groups by topic, newest first inside each group, group with the newest finding first', () => {
    const groups = groupFindingsByTopic([
      finding('a1', '/map', 10),
      finding('b1', 'api/user', 30),
      finding('a2', '/map', 20, true),
      finding('b2', 'api/user', 5),
    ]);
    expect(groups.map((g) => g.topic)).toEqual(['api/user', '/map']);
    expect(groups[0].findings.map((f) => f.id)).toEqual(['b1', 'b2']);
    expect(groups[1].findings.map((f) => f.id)).toEqual(['a2', 'a1']);
    expect(groups[1].unreadCount).toBe(1);
  });

  it('empty topic falls into "כללי"; empty input → no groups', () => {
    expect(groupFindingsByTopic([finding('x', '', 1)])[0].topic).toBe('כללי');
    expect(groupFindingsByTopic([])).toEqual([]);
  });
});

describe('optimistic mark-read', () => {
  const base = (): PanelState => ({ agents: [agent(2)], findings: [finding('f1', 't', 1), finding('f2', 't', 2)] });
  const NOW = '2026-10-14T11:00:00.000Z';

  it('stamps readAt and decrements the agent counter', () => {
    const next = applyOptimisticRead(base(), 'oncall', 'f1', NOW);
    expect(next.findings.find((f) => f.id === 'f1')?.readAt).toBe(NOW);
    expect(next.agents[0].unreadCount).toBe(1);
  });

  it('already-read / unknown finding → same state object (double click cannot double-decrement)', () => {
    const once = applyOptimisticRead(base(), 'oncall', 'f1', NOW);
    expect(applyOptimisticRead(once, 'oncall', 'f1', NOW)).toBe(once);
    const s = base();
    expect(applyOptimisticRead(s, 'oncall', 'nope', NOW)).toBe(s);
  });

  it('counter never goes below 0', () => {
    const s: PanelState = { agents: [agent(0)], findings: [finding('f1', 't', 1)] };
    expect(applyOptimisticRead(s, 'oncall', 'f1', NOW).agents[0].unreadCount).toBe(0);
  });

  it('revert restores readAt=null and the counter', () => {
    const optimistic = applyOptimisticRead(base(), 'oncall', 'f1', NOW);
    const reverted = revertOptimisticRead(optimistic, 'oncall', 'f1');
    expect(reverted.findings.find((f) => f.id === 'f1')?.readAt).toBeNull();
    expect(reverted.agents[0].unreadCount).toBe(2);
  });
});

describe('safeHttpUrl', () => {
  it('keeps http(s), drops javascript:/data:/garbage/empty', () => {
    expect(safeHttpUrl('https://sentry.io/issues/1/')).toBe('https://sentry.io/issues/1/');
    expect(safeHttpUrl('http://example.com/x')).toBe('http://example.com/x');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,hi')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
  });
});

describe('isAgentStale', () => {
  const now = Date.parse('2026-10-14T12:00:00.000Z');
  it('never ran → stale; 2h+ ago → stale; recent → fresh', () => {
    expect(isAgentStale(agent(0, null), now)).toBe(true);
    expect(isAgentStale(agent(0, '2026-10-14T09:59:00.000Z'), now)).toBe(true);
    expect(isAgentStale(agent(0, '2026-10-14T11:30:00.000Z'), now)).toBe(false);
  });
});
