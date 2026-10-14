'use client';

import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { AGENT_REGISTRY } from '@/features/admin/agents/agent-registry';
import { isAgentStale } from '@/features/admin/agents/agents-panel.logic';
import type { AgentOverview } from '@/features/admin/agents/agent-findings.types';

export function formatPanelTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
}

interface Props {
  agents: AgentOverview[];
  selectedId: string | null;
  onSelect: (agentId: string) => void;
}

/** One card per registered agent: health + unread counter. Click → its findings. */
export default function AgentList({ agents, selectedId, onSelect }: Props) {
  const now = Date.now();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {AGENT_REGISTRY.map((def) => {
        const a = agents.find((x) => x.agentId === def.id);
        const stale = a ? isAgentStale(a, now) : true;
        const failing = (a?.consecutiveFailures ?? 0) > 0;
        const selected = selectedId === def.id;
        return (
          <button
            key={def.id}
            type="button"
            onClick={() => onSelect(def.id)}
            aria-pressed={selected}
            className={`text-right rounded-xl border p-4 transition-colors ${
              selected ? 'border-cyan-500 bg-cyan-50/60' : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-black text-slate-900">{def.label}</p>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{def.description}</p>
              </div>
              {(a?.unreadCount ?? 0) > 0 && (
                <span className="shrink-0 min-w-[1.75rem] text-center rounded-full bg-red-600 text-white text-xs font-black px-2 py-0.5">
                  {a?.unreadCount}
                </span>
              )}
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-slate-400 flex items-center gap-1"><Clock size={12} /> ריצה אחרונה</dt>
                <dd className={`font-bold ${stale ? 'text-red-600' : 'text-slate-700'}`}>
                  {a?.lastRunAt ? formatPanelTime(a.lastRunAt) : 'עוד לא רץ'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400 flex items-center gap-1"><AlertTriangle size={12} /> שגיאה אחרונה</dt>
                <dd className="font-bold text-slate-700 truncate" title={a?.lastError?.code ?? undefined}>
                  {a?.lastError ? `${a.lastError.code} · ${formatPanelTime(a.lastError.at)}` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-slate-400 flex items-center gap-1"><CheckCircle2 size={12} /> כשלים רצופים</dt>
                <dd className={`font-bold ${failing ? 'text-red-600' : 'text-slate-700'}`}>
                  {a?.consecutiveFailures ?? 0}
                </dd>
              </div>
            </dl>
          </button>
        );
      })}
    </div>
  );
}
