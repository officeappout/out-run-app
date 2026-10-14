'use client';

export const dynamic = 'force-dynamic';

import nextDynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { ArrowRight, Bot, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import {
  fetchAgentFindings,
  fetchAgentsOverview,
  markAgentFindingRead,
} from '@/features/admin/services/agents.service';
import { AGENT_REGISTRY, agentLabel } from '@/features/admin/agents/agent-registry';
import {
  applyOptimisticRead,
  revertOptimisticRead,
  type PanelState,
} from '@/features/admin/agents/agents-panel.logic';
import { buildNetworkSummary } from '@/features/admin/agents/agents-network.logic';
import type { AgentFinding, FindingsStatusFilter } from '@/features/admin/agents/agent-findings.types';
import AgentList from '@/features/admin/components/agents/AgentList';
import FindingsView from '@/features/admin/components/agents/FindingsView';

// React Flow is loaded only when this page renders, client-side only.
const AgentsNetwork = nextDynamic(() => import('@/features/admin/components/agents/network/AgentsNetwork'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[480px] items-center justify-center rounded-[20px] border border-slate-200 bg-[#f8fafc] sm:h-[540px]">
      <Loader2 className="h-6 w-6 animate-spin text-slate-500" aria-label="טוען את רשת הסוכנים" />
    </div>
  ),
});

const REGISTERED_IDS = AGENT_REGISTRY.map((a) => a.id);

/**
 * /admin/agents — agents panel, root-only.
 *
 * Overview = the agents network (node graph); clicking an agent opens its
 * findings (the existing drill-down). The gate on this page is UX only
 * (non-root sees a "root only" screen and NO request is ever sent). The real
 * boundary is the three /api/admin/agents/** routes, which return the same
 * generic 403 to anyone who is not root (src/lib/agentsPanelServer.ts). All
 * data comes from those routes — there is no Firestore client read of
 * agents/** anywhere.
 */
export default function AgentsPanelPage() {
  const [checking, setChecking] = useState(true);
  const [isRoot, setIsRoot] = useState(false);
  const [panel, setPanel] = useState<PanelState>({ agents: [], findings: [] });
  // null = network overview; an id = that agent's findings.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<FindingsStatusFilter>('all');
  // Unread findings per agent, fetched only to count "critical" for the
  // commander node (GET /api/admin/agents has no severity breakdown).
  const [unreadByAgent, setUnreadByAgent] = useState<Record<string, AgentFinding[]>>({});
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Drops a findings response that arrives after the user switched agent/filter.
  const findingsRequestId = useRef(0);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsRoot(false);
        setChecking(false);
        return;
      }
      try {
        const role = await checkUserRole(user.uid, user.email);
        setIsRoot(role.isRootAdmin);
      } catch {
        setIsRoot(false);
      }
      setChecking(false);
    });
    return () => unsub();
  }, []);

  const loadAgents = useCallback(async () => {
    setLoadingAgents(true);
    try {
      const agents = await fetchAgentsOverview();
      setPanel((prev) => ({ ...prev, agents }));
      // Only agents that actually have unread findings are queried (no
      // request, no audit row, for an agent with nothing open).
      const withUnread = agents.filter((a) => a.unreadCount > 0 && REGISTERED_IDS.includes(a.agentId));
      const entries = await Promise.all(
        withUnread.map(async (a) => [a.agentId, await fetchAgentFindings(a.agentId, 'unread')] as const),
      );
      setUnreadByAgent(Object.fromEntries(entries));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת הסוכנים');
    } finally {
      setLoadingAgents(false);
    }
  }, []);

  const loadFindings = useCallback(async (agentId: string, s: FindingsStatusFilter) => {
    const requestId = ++findingsRequestId.current;
    setLoadingFindings(true);
    try {
      const findings = await fetchAgentFindings(agentId, s);
      if (requestId === findingsRequestId.current) setPanel((prev) => ({ ...prev, findings }));
    } catch (err) {
      if (requestId === findingsRequestId.current) {
        setError(err instanceof Error ? err.message : 'שגיאה בטעינת הממצאים');
      }
    } finally {
      if (requestId === findingsRequestId.current) setLoadingFindings(false);
    }
  }, []);

  useEffect(() => {
    if (isRoot) loadAgents();
  }, [isRoot, loadAgents]);

  useEffect(() => {
    if (!isRoot || !selectedId) return;
    setPanel((prev) => ({ ...prev, findings: [] }));
    loadFindings(selectedId, status);
  }, [isRoot, selectedId, status, loadFindings]);

  const refresh = useCallback(() => {
    setError(null);
    setNotice(null);
    loadAgents();
    if (selectedId) loadFindings(selectedId, status);
  }, [loadAgents, loadFindings, selectedId, status]);

  const selectAgent = useCallback((agentId: string) => {
    setNotice(null);
    setSelectedId(agentId);
  }, []);

  const comingSoon = useCallback((label: string) => {
    setNotice(`${label} — בקרוב.`);
  }, []);

  const summary = useMemo(
    () => buildNetworkSummary(REGISTERED_IDS, panel.agents, unreadByAgent),
    [panel.agents, unreadByAgent],
  );

  // Click on a finding → optimistic read (counter drops now), then the
  // server call; on failure the change is reverted and the error shown.
  const openFinding = (findingId: string) => {
    if (!selectedId) return;
    const target = panel.findings.find((f) => f.id === findingId);
    if (!target || target.readAt !== null) return;
    const agentId = selectedId;
    const nowIso = new Date().toISOString();
    const setUnreadReadAt = (readAt: string | null) =>
      setUnreadByAgent((prev) =>
        prev[agentId]
          ? { ...prev, [agentId]: prev[agentId].map((f) => (f.id === findingId ? { ...f, readAt } : f)) }
          : prev,
      );
    setPanel((prev) => applyOptimisticRead(prev, agentId, findingId, nowIso));
    setUnreadReadAt(nowIso);
    markAgentFindingRead(agentId, findingId).catch((err) => {
      setPanel((prev) => revertOptimisticRead(prev, agentId, findingId));
      setUnreadReadAt(null);
      setError(err instanceof Error ? `סימון כנקרא נכשל: ${err.message}` : 'סימון כנקרא נכשל');
    });
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!isRoot) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500">
        <ShieldAlert className="w-8 h-8" />
        <p className="text-sm">המסך הזה זמין ל-root בלבד.</p>
      </div>
    );
  }

  const selectedDef = AGENT_REGISTRY.find((a) => a.id === selectedId) ?? null;
  const selectedOverview = panel.agents.find((a) => a.agentId === selectedId) ?? null;

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6 font-sans" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <Bot className="w-6 h-6" style={{ color: '#007399' }} aria-hidden="true" />
          {selectedDef ? agentLabel(selectedDef) : 'רשת הסוכנים'}
        </h1>
        <div className="flex items-center gap-2">
          {selectedDef && (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-lg bg-white border border-slate-200 hover:bg-slate-50"
              style={{ color: '#007399' }}
            >
              <ArrowRight size={14} aria-hidden="true" />
              חזרה לרשת
            </button>
          )}
          <button
            type="button"
            onClick={refresh}
            disabled={loadingAgents || loadingFindings}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
          >
            <RefreshCw size={14} className={loadingAgents || loadingFindings ? 'animate-spin' : ''} aria-hidden="true" />
            רענן
          </button>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
      )}
      <p aria-live="polite" className={notice ? 'text-sm font-bold rounded-lg p-3 bg-white border border-slate-200' : 'sr-only'} style={{ color: '#007399' }}>
        {notice ?? ''}
      </p>

      {!selectedDef ? (
        <AgentsNetwork
          agents={panel.agents}
          summary={summary}
          onSelectAgent={selectAgent}
          onComingSoon={comingSoon}
          onRefresh={refresh}
        />
      ) : (
        <>
          <AgentList agents={panel.agents} selectedId={selectedId} onSelect={selectAgent} agentIds={[selectedDef.id]} />
          <FindingsView
            agentLabel={agentLabel(selectedDef)}
            findings={panel.findings}
            status={status}
            onStatusChange={setStatus}
            loading={loadingFindings}
            neverRan={!selectedOverview?.lastRunAt}
            onOpen={openFinding}
          />
        </>
      )}
    </div>
  );
}
