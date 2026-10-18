/**
 * Agents panel — pure view logic (no React, no fetch), so it is unit-tested
 * under the node-only vitest setup.
 */
import type { AgentFinding, AgentOverview } from './agent-findings.types';

export interface TopicGroup {
  topic: string;
  findings: AgentFinding[];
  unreadCount: number;
}

const newestFirst = (a: AgentFinding, b: AgentFinding) =>
  (b.createdAt ?? '').localeCompare(a.createdAt ?? '');

/**
 * Groups findings by topic. Inside a group: newest first. Groups: the one
 * with the newest finding first, so fresh problems surface at the top.
 */
export function groupFindingsByTopic(findings: AgentFinding[]): TopicGroup[] {
  const byTopic = new Map<string, AgentFinding[]>();
  for (const f of findings) {
    const topic = f.topic || 'כללי';
    const list = byTopic.get(topic);
    if (list) list.push(f);
    else byTopic.set(topic, [f]);
  }
  return Array.from(byTopic.entries())
    .map(([topic, list]) => {
      const sorted = [...list].sort(newestFirst);
      return { topic, findings: sorted, unreadCount: sorted.filter((f) => f.readAt === null).length };
    })
    .sort((a, b) => newestFirst(a.findings[0], b.findings[0]));
}

export interface PanelState {
  agents: AgentOverview[];
  findings: AgentFinding[];
}

/**
 * Optimistic mark-read: stamps readAt locally and decrements the agent's
 * unread counter. A finding that is already read (or missing) leaves the
 * state untouched — so a double click can never push the counter below the
 * real number. Returns the same object when nothing changed.
 */
export function applyOptimisticRead(
  state: PanelState,
  agentId: string,
  findingId: string,
  nowIso: string,
): PanelState {
  const target = state.findings.find((f) => f.id === findingId);
  if (!target || target.readAt !== null) return state;
  return {
    findings: state.findings.map((f) => (f.id === findingId ? { ...f, readAt: nowIso } : f)),
    agents: state.agents.map((a) =>
      a.agentId === agentId ? { ...a, unreadCount: Math.max(0, a.unreadCount - 1) } : a,
    ),
  };
}

/** Undo of applyOptimisticRead when the server call fails. */
export function revertOptimisticRead(state: PanelState, agentId: string, findingId: string): PanelState {
  const target = state.findings.find((f) => f.id === findingId);
  if (!target || target.readAt === null) return state;
  return {
    findings: state.findings.map((f) => (f.id === findingId ? { ...f, readAt: null } : f)),
    agents: state.agents.map((a) =>
      a.agentId === agentId ? { ...a, unreadCount: a.unreadCount + 1 } : a,
    ),
  };
}

/**
 * Only http(s) links are rendered as anchors — a stored `javascript:` or
 * other scheme (writer bug or tampering) must never become clickable.
 */
export function safeHttpUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
}

/** True when the agent's last run is older than `staleAfterMs` (or it never ran). */
export function isAgentStale(agent: AgentOverview, nowMs: number, staleAfterMs = 2 * 60 * 60 * 1000): boolean {
  if (!agent.lastRunAt) return true;
  const t = Date.parse(agent.lastRunAt);
  return Number.isNaN(t) || nowMs - t > staleAfterMs;
}

export function formatPanelTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
}

export type StatusTone = 'ok' | 'fail' | 'progress' | 'neutral';

/** Hebrew label + tone for the short status tokens the status sources carry. */
const STATUS_TOKENS: Record<string, { label: string; tone: StatusTone }> = {
  succeeded: { label: 'הצליח', tone: 'ok' },
  sent: { label: 'נשלח', tone: 'ok' },
  failed: { label: 'נכשל', tone: 'fail' },
  pending: { label: 'ממתין', tone: 'progress' },
  running: { label: 'רץ עכשיו', tone: 'progress' },
  processing: { label: 'בטיפול', tone: 'progress' },
};

export function describeStatusToken(status: string | null): { label: string; tone: StatusTone } | null {
  if (!status) return null;
  return STATUS_TOKENS[status] ?? { label: status, tone: 'neutral' };
}

/**
 * The one-line "last run" text of an automation card.
 *   - no status source             → "אין דיווח סטטוס עדיין"
 *   - status not loaded yet        → "טוען…"
 *   - the source read failed       → "הסטטוס לא זמין כרגע"
 *   - source exists, no doc yet    → "עוד אין רשומה"
 *   - otherwise                    → the timestamp
 */
export function describeLastRun(
  hasSource: boolean,
  status: { lastAt: string | null; error: string | null } | undefined,
): { text: string; known: boolean } {
  if (!hasSource) return { text: 'אין דיווח סטטוס עדיין', known: false };
  if (!status) return { text: 'טוען…', known: false };
  if (status.error) return { text: 'הסטטוס לא זמין כרגע', known: false };
  if (!status.lastAt) return { text: 'עוד אין רשומה', known: false };
  return { text: formatPanelTime(status.lastAt), known: true };
}
