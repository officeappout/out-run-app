'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { Bot, Loader2, RefreshCw, ShieldAlert } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';
import {
  fetchAgentFindings,
  fetchAgentsOverview,
  markAgentFindingRead,
} from '@/features/admin/services/agents.service';
import {
  AGENT_REGISTRY,
  AUTOMATION_REGISTRY,
  groupAutomationsByTopic,
} from '@/features/admin/agents/agent-registry';
import {
  applyOptimisticRead,
  revertOptimisticRead,
  type PanelState,
} from '@/features/admin/agents/agents-panel.logic';
import type { AutomationStatus, FindingsStatusFilter } from '@/features/admin/agents/agent-findings.types';
import AutomationCard from '@/features/admin/components/agents/AutomationCard';
import FindingsView from '@/features/admin/components/agents/FindingsView';

/**
 * /admin/agents — agents & automations hub, root-only.
 *
 * Every automation in the registry (agent-registry.ts), grouped by topic:
 * what it does, when it runs, where it writes, a link to its admin screen
 * and — where a source exists — its real last run, read-only, from the
 * root-only overview route. Agents with findings (oncall) keep the findings
 * view below the cards.
 *
 * The gate on this page is UX only (non-root sees a "root only" screen and
 * NO request is ever sent). The real boundary is the three
 * /api/admin/agents/** routes, which return the same generic 403 to anyone
 * who is not root (src/lib/agentsPanelServer.ts). All data comes from those
 * routes — there is no Firestore client read of agents/** anywhere.
 */
export default function AgentsPanelPage() {
  const [checking, setChecking] = useState(true);
  const [isRoot, setIsRoot] = useState(false);
  const [panel, setPanel] = useState<PanelState>({ agents: [], findings: [] });
  const [selectedId, setSelectedId] = useState<string | null>(AGENT_REGISTRY[0]?.id ?? null);
  const [status, setStatus] = useState<FindingsStatusFilter>('all');
  const [loadingAgents, setLoadingAgents] = useState(false);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [automations, setAutomations] = useState<AutomationStatus[]>([]);
  const [overviewLoaded, setOverviewLoaded] = useState(false);
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
      const overview = await fetchAgentsOverview();
      setPanel((prev) => ({ ...prev, agents: overview.agents }));
      setAutomations(overview.automations);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'שגיאה בטעינת הסוכנים');
    } finally {
      setLoadingAgents(false);
      setOverviewLoaded(true);
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

  const refresh = () => {
    setError(null);
    loadAgents();
    if (selectedId) loadFindings(selectedId, status);
  };

  // Click on a finding → optimistic read (counter drops now), then the
  // server call; on failure the change is reverted and the error shown.
  const openFinding = (findingId: string) => {
    if (!selectedId) return;
    const target = panel.findings.find((f) => f.id === findingId);
    if (!target || target.readAt !== null) return;
    const agentId = selectedId;
    setPanel((prev) => applyOptimisticRead(prev, agentId, findingId, new Date().toISOString()));
    markAgentFindingRead(agentId, findingId).catch((err) => {
      setPanel((prev) => revertOptimisticRead(prev, agentId, findingId));
      setError(err instanceof Error ? `סימון כנקרא נכשל: ${err.message}` : 'סימון כנקרא נכשל');
    });
  };

  if (checking) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
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
  const groups = groupAutomationsByTopic();

  return (
    <div className="max-w-6xl mx-auto py-8 space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Bot className="w-6 h-6 text-cyan-600" />
            סוכנים ואוטומציות
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {AUTOMATION_REGISTRY.length} אוטומציות במערכת, לפי נושא. הסטטוס נקרא בלבד — שום דבר כאן לא מפעיל או משנה אוטומציה.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loadingAgents || loadingFindings}
          className="flex shrink-0 items-center gap-1.5 px-3 py-1.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
        >
          <RefreshCw size={14} className={loadingAgents || loadingFindings ? 'animate-spin' : ''} />
          רענן
        </button>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">{error}</p>
      )}

      <nav className="flex flex-wrap gap-2" aria-label="נושאים">
        {groups.map((g) => (
          <a
            key={g.topic}
            href={`#topic-${g.topic}`}
            className="whitespace-nowrap rounded-full bg-white px-3 py-1 text-sm font-bold text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
          >
            {g.label} <span className="text-slate-400">{g.automations.length}</span>
          </a>
        ))}
      </nav>

      {groups.map((g) => (
        <section key={g.topic} id={`topic-${g.topic}`} className="space-y-3 scroll-mt-4">
          <h2 className="text-lg font-black text-slate-900">
            {g.label} <span className="text-sm font-bold text-slate-400">({g.automations.length})</span>
          </h2>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {g.automations.map((def) => (
              <AutomationCard
                key={def.id}
                def={def}
                status={automations.find((a) => a.automationId === def.id)}
                agent={panel.agents.find((a) => a.agentId === def.id)}
                loaded={overviewLoaded && !loadingAgents}
                selected={def.hasFindings === true && selectedId === def.id}
                onShowFindings={(id) => {
                  setSelectedId(id);
                  document.getElementById('agent-findings')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              />
            ))}
          </div>
        </section>
      ))}

      {selectedDef && (
        <div id="agent-findings" className="scroll-mt-4 border-t border-slate-200 pt-6">
          <FindingsView
            agentLabel={selectedDef.label}
            findings={panel.findings}
            status={status}
            onStatusChange={setStatus}
            loading={loadingFindings}
            neverRan={!selectedOverview?.lastRunAt}
            onOpen={openFinding}
          />
        </div>
      )}
    </div>
  );
}
