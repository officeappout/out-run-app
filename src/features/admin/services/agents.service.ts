/**
 * Agents panel — client wrappers for the three root-only routes.
 *
 * The ONLY way the panel touches agent data: there is deliberately no
 * Firestore client read of agents/** anywhere (the collection is
 * server-only; firestore.rules `match /agents/**`). The Firebase ID token
 * is read per request from the signed-in user, never stored, and no other
 * credential exists on the client.
 */
import { auth } from '@/lib/firebase';
import type {
  AgentFinding,
  AgentOverview,
  AutomationStatus,
  FindingsStatusFilter,
} from '@/features/admin/agents/agent-findings.types';

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await auth.currentUser?.getIdToken();
  const res = await fetch(path, {
    ...init,
    headers: { ...(init?.headers ?? {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(typeof body.error === 'string' ? body.error : `HTTP ${res.status}`);
  }
  return res;
}

/** Findings-agent health + every automation's read-only last-run status. */
export async function fetchAgentsOverview(): Promise<{ agents: AgentOverview[]; automations: AutomationStatus[] }> {
  const res = await authedFetch('/api/admin/agents');
  const body = (await res.json()) as { agents?: AgentOverview[]; automations?: AutomationStatus[] };
  return { agents: body.agents ?? [], automations: body.automations ?? [] };
}

export async function fetchAgentFindings(
  agentId: string,
  status: FindingsStatusFilter,
): Promise<AgentFinding[]> {
  const qs = new URLSearchParams({ status });
  const res = await authedFetch(`/api/admin/agents/${encodeURIComponent(agentId)}/findings?${qs}`);
  const body = (await res.json()) as { findings?: AgentFinding[] };
  return body.findings ?? [];
}

export async function markAgentFindingRead(agentId: string, findingId: string): Promise<void> {
  await authedFetch(
    `/api/admin/agents/${encodeURIComponent(agentId)}/findings/${encodeURIComponent(findingId)}/read`,
    { method: 'POST' },
  );
}
