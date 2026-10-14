/**
 * Agents network view — pure logic (no React, no React Flow), unit-tested
 * under the node-only vitest setup.
 */
import type { AgentFinding, AgentOverview } from './agent-findings.types';
import { isAgentStale } from './agents-panel.logic';

export type AgentNodeStatus = 'active' | 'pending';

/** active = ran within the stale window; pending = never ran / stale. */
export function agentNodeStatus(agent: AgentOverview | undefined, nowMs: number): AgentNodeStatus {
  return agent && !isAgentStale(agent, nowMs) ? 'active' : 'pending';
}

export interface NetworkSummary {
  agentCount: number;
  openFindings: number;
  /** null = not known (no unread findings were fetched to count from). */
  critical: number | null;
}

/**
 * Commander node numbers. agentCount/openFindings come from
 * GET /api/admin/agents; `critical` is counted from unread findings already
 * loaded per agent (that route has no severity breakdown).
 */
export function buildNetworkSummary(
  registeredAgentIds: readonly string[],
  overviews: AgentOverview[],
  unreadFindingsByAgent: Record<string, AgentFinding[] | undefined>,
): NetworkSummary {
  const relevant = overviews.filter((o) => registeredAgentIds.includes(o.agentId));
  const openFindings = relevant.reduce((sum, o) => sum + o.unreadCount, 0);
  let critical: number | null = openFindings === 0 ? 0 : null;
  if (openFindings > 0) {
    const loaded = relevant.filter((o) => o.unreadCount > 0).map((o) => unreadFindingsByAgent[o.agentId]);
    if (loaded.every((l) => Array.isArray(l))) {
      critical = loaded.reduce(
        (sum, l) => sum + (l as AgentFinding[]).filter((f) => f.readAt === null && f.severity === 'critical').length,
        0,
      );
    }
  }
  return { agentCount: registeredAgentIds.length, openFindings, critical };
}

export interface RingPosition {
  /** Center point of the node's circle, relative to the commander's center (0,0). */
  x: number;
  y: number;
}

/**
 * Places `count` satellites evenly on a circle around the commander,
 * starting at the top and going clockwise. Radius grows with the count so
 * labels don't collide.
 */
export function ringPositions(count: number, baseRadius = 230): RingPosition[] {
  if (count <= 0) return [];
  const radius = baseRadius + Math.max(0, count - 6) * 22;
  return Array.from({ length: count }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
    return { x: Math.round(radius * Math.cos(angle)), y: Math.round(radius * Math.sin(angle)) };
  });
}
