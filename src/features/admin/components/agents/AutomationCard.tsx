'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowUpLeft, CalendarClock, Clock, Database, Flag, ListChecks } from 'lucide-react';
import {
  AUTOMATION_KIND_LABEL,
  type AutomationDefinition,
} from '@/features/admin/agents/agent-registry';
import {
  describeLastRun,
  describeStatusToken,
  formatPanelTime,
  isAgentStale,
  type StatusTone,
} from '@/features/admin/agents/agents-panel.logic';
import type { AgentOverview, AutomationStatus } from '@/features/admin/agents/agent-findings.types';

const TONE_CLASS: Record<StatusTone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  fail: 'bg-red-50 text-red-700 ring-red-200',
  progress: 'bg-amber-50 text-amber-800 ring-amber-200',
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
};

interface Props {
  def: AutomationDefinition;
  /** Read-only last-run status (latestDoc sources). Undefined while loading. */
  status: AutomationStatus | undefined;
  /** agents/{id} health — only for automations with findings. */
  agent: AgentOverview | undefined;
  /** True once the overview request finished (so "loading" can end). */
  loaded: boolean;
  selected: boolean;
  onShowFindings?: (id: string) => void;
}

/** One automation: what it does, when it runs, where it writes, last run. */
export default function AutomationCard({ def, status, agent, loaded, selected, onShowFindings }: Props) {
  const planned = def.lifecycle === 'planned';
  const notDeployed = def.lifecycle === 'not-deployed';
  const src = def.statusSource;

  let lastRun: { text: string; known: boolean };
  let stale = false;
  if (src?.kind === 'agentDoc') {
    if (!loaded) lastRun = { text: 'טוען…', known: false };
    else if (agent?.lastRunAt) lastRun = { text: formatPanelTime(agent.lastRunAt), known: true };
    else lastRun = { text: planned ? 'לא רץ — עוד אין מימוש' : 'עוד לא רץ', known: false };
    stale = !planned && !!agent && isAgentStale(agent, Date.now());
  } else {
    lastRun = describeLastRun(!!src, loaded ? status ?? { lastAt: null, error: 'unavailable' } : undefined);
  }
  const token = describeStatusToken(status?.status ?? null);
  const label = src?.kind === 'latestDoc' ? src.label : 'ריצה אחרונה';
  const note = src?.kind === 'latestDoc' ? src.note : undefined;

  return (
    <article
      className={`flex flex-col rounded-xl border bg-white p-4 text-right ${
        selected ? 'border-cyan-500 ring-1 ring-cyan-500' : 'border-slate-200'
      } ${planned ? 'opacity-80' : ''}`}
    >
      <header className="flex items-start justify-between gap-2">
        <h3 className="font-black text-slate-900 leading-snug">{def.name}</h3>
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          {planned && (
            <span className="whitespace-nowrap rounded-full bg-slate-800 px-2 py-0.5 text-[11px] font-bold text-white">
              מתוכנן — לא פעיל
            </span>
          )}
          {notDeployed && (
            <span
              className="whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800"
              title="לפי הקוד (functions/src/index.ts) — מוכן לפריסה אבל עוד לא נפרס"
            >
              בקוד — עוד לא נפרס
            </span>
          )}
          <span className="whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
            {AUTOMATION_KIND_LABEL[def.kind]}
          </span>
        </div>
      </header>

      <p className="mt-1 text-sm text-slate-600">{def.description}</p>

      <dl className="mt-3 space-y-1.5 text-xs">
        <div className="flex gap-1.5">
          <dt className="flex shrink-0 items-center gap-1 text-slate-400"><CalendarClock size={12} /> מתי</dt>
          <dd className="font-bold text-slate-700">{def.schedule}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="flex shrink-0 items-center gap-1 text-slate-400"><Database size={12} /> כותב ל</dt>
          <dd className="font-bold text-slate-700 break-words" dir="auto">{def.writesTo}</dd>
        </div>
        {def.gate && (
          <div className="flex gap-1.5">
            <dt className="flex shrink-0 items-center gap-1 text-slate-400"><Flag size={12} /> מותנה בדגל</dt>
            <dd className="font-mono text-[11px] text-slate-600 break-all" dir="ltr">{def.gate}</dd>
          </div>
        )}
      </dl>

      <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex items-center gap-1 text-slate-400"><Clock size={12} /> {label}</span>
          <span className={`font-bold ${stale ? 'text-red-600' : lastRun.known ? 'text-slate-800' : 'text-slate-500'}`}>
            {lastRun.text}
          </span>
          {token && (
            <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ring-inset ${TONE_CLASS[token.tone]}`}>
              {token.label}
            </span>
          )}
        </div>
        {status && status.counts.length > 0 && (
          <p className="mt-1 text-slate-600">
            {status.counts.map((c) => `${c.label}: ${c.value.toLocaleString('he-IL')}`).join(' · ')}
          </p>
        )}
        {src?.kind === 'agentDoc' && agent?.lastError && (
          <p className="mt-1 flex items-center gap-1 text-red-600">
            <AlertTriangle size={12} /> שגיאה אחרונה: {agent.lastError.code} · {formatPanelTime(agent.lastError.at)}
            {agent.consecutiveFailures > 0 && ` · ${agent.consecutiveFailures} כשלים רצופים`}
          </p>
        )}
        {note && lastRun.known && <p className="mt-1 text-[11px] text-slate-400">{note}</p>}
      </div>

      <footer className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
        <code className="min-w-0 truncate text-[11px] text-slate-400" dir="ltr" title={def.source}>
          {def.source}
        </code>
        <div className="flex shrink-0 items-center gap-2">
          {def.hasFindings && onShowFindings && (
            <button
              type="button"
              onClick={() => onShowFindings(def.id)}
              aria-pressed={selected}
              className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-200"
            >
              <ListChecks size={13} /> ממצאים
              {(agent?.unreadCount ?? 0) > 0 && (
                <span className="min-w-[1.25rem] rounded-full bg-red-600 px-1.5 text-center text-[11px] font-black text-white">
                  {agent?.unreadCount}
                </span>
              )}
            </button>
          )}
          {def.adminHref && (
            <Link
              href={def.adminHref}
              className="flex items-center gap-1 whitespace-nowrap rounded-lg bg-cyan-50 px-2.5 py-1 text-xs font-bold text-cyan-700 hover:bg-cyan-100"
            >
              למסך <ArrowUpLeft size={13} />
            </Link>
          )}
        </div>
      </footer>
    </article>
  );
}
