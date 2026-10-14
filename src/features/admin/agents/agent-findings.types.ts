/**
 * Agents panel — shared types (client + server, no Firebase imports).
 *
 * Firestore layout (server-only — see firestore.rules `match /agents/**`):
 *   agents/{agentId}                    AgentStateDoc  (written by the agent's Cloud Function)
 *   agents/{agentId}/findings/{id}      AgentFindingDoc
 *
 * The *Doc shapes describe what is stored; the API shapes are what the
 * root-only /api/admin/agents/** routes return (timestamps as ISO strings).
 *
 * PII: a finding never stores a user, IP, URL with query, or raw message
 * text — the writer sanitizes before writing, and details stay in the
 * source system (Sentry), reached through `sourceUrl`.
 *
 * `readAt` is ALWAYS written explicitly as `null` on create: the unread
 * query is `where('readAt', '==', null)`, which does not match a document
 * where the field is absent (axioms.md §33).
 */

export type FindingKind = 'new' | 'escalating' | 'regressed';
export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low';
export type FindingConfidence = 'high' | 'medium' | 'low' | 'none';
export type FindingPlatform = 'web' | 'server' | 'ios' | 'android' | 'unknown';

export interface SuspectedPr {
  number: number;
  title: string;
  sha: string;
  url: string;
  /** ISO string in the API; Timestamp in Firestore. */
  deployedAt: string | null;
}

export interface FindingCounts {
  lastHour: number;
  last24h: number;
  total: number;
}

/** A finding as returned by GET /api/admin/agents/[agentId]/findings. */
export interface AgentFinding {
  id: string;
  kind: FindingKind | string;
  topic: string;
  title: string;
  severity: FindingSeverity | string;
  counts: FindingCounts;
  platform: FindingPlatform | string;
  suspectedPr: SuspectedPr | null;
  confidence: FindingConfidence | string;
  suggestion: string;
  sourceUrl: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  createdAt: string | null;
  readAt: string | null;
}

/** Per-agent health + unread count, as returned by GET /api/admin/agents. */
export interface AgentOverview {
  agentId: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: { at: string | null; code: string } | null;
  consecutiveFailures: number;
  unreadCount: number;
}

export type FindingsStatusFilter = 'unread' | 'all';
