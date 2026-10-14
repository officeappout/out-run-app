/**
 * Agents panel — server side of the root-only /api/admin/agents/** routes.
 *
 * Security contract (David, 14.10.2026), enforced in this order by every
 * route:
 *   1. Bearer ID token verified with checkRevoked=true → 401 if missing,
 *      invalid or revoked.
 *   2. Root only (isRootAdmin on the VERIFIED token email). Anyone else gets
 *      the same generic 403, with ZERO Firestore reads and ZERO audit rows —
 *      the routes do not even obtain a db handle before this check.
 *   3. agentId / findingId must match ID_PATTERN and agentId must be in the
 *      registry → otherwise the same generic 403. The client never sends a
 *      scope; there is nothing else to send.
 *   4. Per-uid rate limit (shared budget across the three routes) → 429.
 *   5. Reads/writes via the Admin SDK only (agents/** is client-locked in
 *      firestore.rules).
 * Audit: listing findings = best-effort audit row; mark-read = fail-closed
 * (the audit row is written in the SAME transaction as the readAt update,
 * so neither happens without the other). Audit rows carry the root uid and
 * counts/ids only — no email, IP or finding content.
 * Logging: error NAME only — never uid, email, ids or content.
 */
import 'server-only';
import { FieldValue, type Firestore, type DocumentSnapshot } from 'firebase-admin/firestore';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { isRootAdmin } from '@/config/feature-flags';
import { RATE_LIMITS, isBlockedByAny } from '@/lib/rateLimitConfig';
import { isRegisteredAgent, AGENT_REGISTRY } from '@/features/admin/agents/agent-registry';
import type {
  AgentFinding,
  AgentOverview,
  FindingsStatusFilter,
  SuspectedPr,
} from '@/features/admin/agents/agent-findings.types';

export const ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
export const GENERIC_FORBIDDEN = 'אין הרשאה.';
const AGENTS = 'agents';
const FINDINGS = 'findings';
export const DEFAULT_FINDINGS_LIMIT = 100;
export const MAX_FINDINGS_LIMIT = 200;

export interface RootCaller {
  uid: string;
}

// ── 1+2. Auth gate (pure decision — unit/emulator testable) ──────────────────

export type GateDecision =
  | { ok: true; caller: RootCaller }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Decides access from an already-verified token (or the verification
 * failure). Pure: no Firestore, no side effects — so the "non-root → zero
 * reads" guarantee is structural, not incidental.
 */
export function decideAgentsAccess(
  verified: { decoded: Pick<DecodedIdToken, 'uid' | 'email'> } | { error: 'missing' | 'invalid' },
): GateDecision {
  if ('error' in verified) {
    return {
      ok: false,
      status: 401,
      error: verified.error === 'missing' ? 'Missing auth token' : 'Invalid auth token',
    };
  }
  const email = verified.decoded.email ?? null;
  if (!isRootAdmin(email)) {
    return { ok: false, status: 403, error: GENERIC_FORBIDDEN };
  }
  return { ok: true, caller: { uid: verified.decoded.uid } };
}

/**
 * Steps 1+2 for a route: extract the Bearer token, verify it (the route
 * passes `getAdminAuth().verifyIdToken(t, true)` — checkRevoked=true), then
 * decideAgentsAccess. Touches no Firestore.
 */
export async function gateAgentsRequest(
  authHeader: string | null,
  verify: (idToken: string) => Promise<Pick<DecodedIdToken, 'uid' | 'email'>>,
): Promise<GateDecision> {
  const header = authHeader ?? '';
  const idToken = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!idToken) return decideAgentsAccess({ error: 'missing' });
  try {
    return decideAgentsAccess({ decoded: await verify(idToken) });
  } catch {
    return decideAgentsAccess({ error: 'invalid' });
  }
}

/** Step 4: per-uid sliding window, shared across the three routes. */
export async function isAgentsPanelRateLimited(
  db: Firestore,
  uid: string,
): Promise<{ blocked: boolean; retryAfterSec: number }> {
  const window = RATE_LIMITS.agentsPanel.uid();
  const rl = await isBlockedByAny(db, [{ key: `agents-panel:uid:${uid}`, window }]);
  return { blocked: rl.blocked, retryAfterSec: Math.ceil(window.windowMs / 1000) };
}

// ── 3. Id validation ─────────────────────────────────────────────────────────

export function isValidAgentId(agentId: unknown): agentId is string {
  return typeof agentId === 'string' && ID_PATTERN.test(agentId) && isRegisteredAgent(agentId);
}

export function isValidFindingId(findingId: unknown): findingId is string {
  return typeof findingId === 'string' && ID_PATTERN.test(findingId);
}

// ── Serialization ────────────────────────────────────────────────────────────

function toIso(v: unknown): string | null {
  if (!v) return null;
  const d =
    v instanceof Date
      ? v
      : typeof (v as { toDate?: unknown }).toDate === 'function'
        ? (v as { toDate: () => Date }).toDate()
        : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function toSuspectedPr(v: unknown): SuspectedPr | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>;
  if (typeof p.number !== 'number') return null;
  return {
    number: p.number,
    title: str(p.title),
    sha: str(p.sha),
    url: str(p.url),
    deployedAt: toIso(p.deployedAt),
  };
}

export function serializeFinding(snap: DocumentSnapshot): AgentFinding {
  const d = (snap.data() ?? {}) as Record<string, unknown>;
  const counts = (d.counts ?? {}) as Record<string, unknown>;
  return {
    id: snap.id,
    kind: str(d.kind, 'unknown'),
    topic: str(d.topic, 'כללי'),
    title: str(d.title),
    severity: str(d.severity, 'low'),
    counts: { lastHour: num(counts.lastHour), last24h: num(counts.last24h), total: num(counts.total) },
    platform: str(d.platform, 'unknown'),
    suspectedPr: toSuspectedPr(d.suspectedPr),
    confidence: str(d.confidence, 'none'),
    suggestion: str(d.suggestion),
    sourceUrl: typeof d.sourceUrl === 'string' ? d.sourceUrl : null,
    firstSeenAt: toIso(d.firstSeenAt),
    lastSeenAt: toIso(d.lastSeenAt),
    createdAt: toIso(d.createdAt),
    readAt: toIso(d.readAt),
  };
}

// ── Reads ────────────────────────────────────────────────────────────────────

/** Health + unread count for every registered agent (missing doc = never ran). */
export async function computeAgentsOverview(db: Firestore): Promise<AgentOverview[]> {
  return Promise.all(
    AGENT_REGISTRY.map(async ({ id }) => {
      const ref = db.collection(AGENTS).doc(id);
      const [stateSnap, unreadAgg] = await Promise.all([
        ref.get(),
        ref.collection(FINDINGS).where('readAt', '==', null).count().get(),
      ]);
      const s = (stateSnap.data() ?? {}) as Record<string, unknown>;
      const lastError = s.lastError && typeof s.lastError === 'object'
        ? (s.lastError as Record<string, unknown>)
        : null;
      return {
        agentId: id,
        lastRunAt: toIso(s.lastRunAt),
        lastSuccessAt: toIso(s.lastSuccessAt),
        lastError: lastError ? { at: toIso(lastError.at), code: str(lastError.code, 'unknown') } : null,
        consecutiveFailures: num(s.consecutiveFailures),
        unreadCount: unreadAgg.data().count,
      };
    }),
  );
}

/**
 * Findings for one agent, newest first. Neither query needs a composite
 * index: 'unread' is a single equality filter (sorted in memory — the unread
 * set is small and capped), 'all' is a single-field orderBy.
 */
export async function computeAgentFindings(
  db: Firestore,
  agentId: string,
  opts: { status: FindingsStatusFilter; limit: number },
): Promise<AgentFinding[]> {
  const col = db.collection(AGENTS).doc(agentId).collection(FINDINGS);
  const limit = Math.min(Math.max(1, Math.floor(opts.limit) || DEFAULT_FINDINGS_LIMIT), MAX_FINDINGS_LIMIT);

  if (opts.status === 'unread') {
    const snap = await col.where('readAt', '==', null).limit(MAX_FINDINGS_LIMIT).get();
    return snap.docs
      .map(serializeFinding)
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .slice(0, limit);
  }
  const snap = await col.orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map(serializeFinding);
}

// ── Audit ────────────────────────────────────────────────────────────────────

function auditRow(caller: RootCaller, actionType: 'READ' | 'UPDATE', targetId: string, details: string) {
  // Same document shape the other admin routes write to audit_logs — minus
  // adminName/sourceIp: no email or IP (no PII), the uid identifies the actor.
  return {
    adminId: caller.uid,
    adminName: 'root',
    actionType,
    targetEntity: 'AgentFindings',
    targetId,
    details,
    oldValue: null,
    newValue: null,
    timestamp: new Date(),
  };
}

/** Best-effort: a failed audit write is logged (name only) and swallowed. */
export async function auditFindingsListBestEffort(
  db: Firestore,
  caller: RootCaller,
  agentId: string,
  status: FindingsStatusFilter,
  count: number,
): Promise<void> {
  try {
    await db.collection('audit_logs').add(
      auditRow(caller, 'READ', agentId, `Listed agent findings via /api/admin/agents (status=${status}, count=${count})`),
    );
  } catch (err) {
    console.error('[agentsPanel] list audit failed (best-effort)', err instanceof Error ? err.name : 'unknown');
  }
}

// ── Writes ───────────────────────────────────────────────────────────────────

export type MarkReadResult =
  | { status: 200; body: { ok: true; alreadyRead: boolean } }
  | { status: 404; body: { error: string } };

/**
 * Sets readAt on one finding. Fail-closed audit: the audit row and the
 * update commit in ONE transaction — if either fails, neither is written
 * and the route returns 500. Already-read findings are left untouched (no
 * write, no audit) and reported as alreadyRead.
 */
export async function markFindingRead(
  db: Firestore,
  caller: RootCaller,
  agentId: string,
  findingId: string,
): Promise<MarkReadResult> {
  const ref = db.collection(AGENTS).doc(agentId).collection(FINDINGS).doc(findingId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { status: 404, body: { error: 'Finding not found' } } as const;
    if (snap.get('readAt') != null) return { status: 200, body: { ok: true, alreadyRead: true } } as const;

    tx.update(ref, { readAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    tx.set(
      db.collection('audit_logs').doc(),
      auditRow(caller, 'UPDATE', `${agentId}/${findingId}`, 'Marked agent finding as read via /api/admin/agents'),
    );
    return { status: 200, body: { ok: true, alreadyRead: false } } as const;
  });
}
