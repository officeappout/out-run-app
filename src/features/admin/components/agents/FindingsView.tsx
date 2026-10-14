'use client';

import { Loader2 } from 'lucide-react';
import { groupFindingsByTopic } from '@/features/admin/agents/agents-panel.logic';
import type { AgentFinding, FindingsStatusFilter } from '@/features/admin/agents/agent-findings.types';
import FindingCard from './FindingCard';

interface Props {
  agentLabel: string;
  findings: AgentFinding[];
  status: FindingsStatusFilter;
  onStatusChange: (status: FindingsStatusFilter) => void;
  loading: boolean;
  neverRan: boolean;
  onOpen: (findingId: string) => void;
}

/** One agent's findings tab: grouped by topic, newest first, unread highlighted. */
export default function FindingsView({ agentLabel, findings, status, onStatusChange, loading, neverRan, onOpen }: Props) {
  const groups = groupFindingsByTopic(findings);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-black text-slate-900">ממצאים — {agentLabel}</h2>
        <div className="flex rounded-lg bg-slate-100 p-0.5 text-sm font-bold" role="tablist" aria-label="סינון ממצאים">
          {(['all', 'unread'] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={status === s}
              onClick={() => onStatusChange(s)}
              className={`px-3 py-1 rounded-md ${status === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
            >
              {s === 'all' ? 'הכל' : 'לא נקראו'}
            </button>
          ))}
        </div>
      </div>

      {loading && findings.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : findings.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-16">
          {neverRan ? 'אין ממצאים עדיין — הסוכן עוד לא פעיל.' : status === 'unread' ? 'אין ממצאים שלא נקראו.' : 'אין ממצאים.'}
        </p>
      ) : (
        groups.map((g) => (
          <div key={g.topic} className="space-y-2">
            <h3 className="text-sm font-black text-slate-500 flex items-center gap-2">
              <span className="font-mono">{g.topic}</span>
              <span className="text-xs font-bold text-slate-400">
                {g.findings.length} ממצאים{g.unreadCount > 0 ? ` · ${g.unreadCount} לא נקראו` : ''}
              </span>
            </h3>
            {g.findings.map((f) => (
              <FindingCard key={f.id} finding={f} onOpen={onOpen} />
            ))}
          </div>
        ))
      )}
    </section>
  );
}
