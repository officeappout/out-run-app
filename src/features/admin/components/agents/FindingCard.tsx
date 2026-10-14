'use client';

import { ExternalLink, GitPullRequest, Lightbulb } from 'lucide-react';
import { safeHttpUrl } from '@/features/admin/agents/agents-panel.logic';
import type { AgentFinding } from '@/features/admin/agents/agent-findings.types';
import { formatPanelTime } from './AgentList';

const KIND_LABEL: Record<string, string> = { new: 'חדש', escalating: 'מזנק', regressed: 'חזר' };
const CONFIDENCE_LABEL: Record<string, string> = { high: 'גבוה', medium: 'בינוני', low: 'נמוך', none: 'אין' };
const PLATFORM_LABEL: Record<string, string> = { web: 'Web', server: 'שרת', ios: 'iOS', android: 'Android', unknown: 'לא ידוע' };
const SEVERITY_CLASS: Record<string, string> = {
  critical: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-amber-200 text-amber-900',
  low: 'bg-slate-200 text-slate-700',
};

interface Props {
  finding: AgentFinding;
  onOpen: (findingId: string) => void;
}

/**
 * One finding. Clicking (or Enter/Space) marks it read — the parent applies
 * the optimistic update. Unread = bold + accent border. Only fields the
 * route already returned are shown; links are http(s)-only.
 */
export default function FindingCard({ finding: f, onOpen }: Props) {
  const unread = f.readAt === null;
  const sourceUrl = safeHttpUrl(f.sourceUrl);
  const prUrl = safeHttpUrl(f.suspectedPr?.url);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(f.id)}
      onKeyDown={(e) => {
        // Only when the card itself is focused — Enter on an inner link must
        // still open the link (preventDefault here would swallow it).
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(f.id);
        }
      }}
      aria-label={unread ? `ממצא לא נקרא: ${f.title}` : f.title}
      className={`rounded-xl border p-4 cursor-pointer transition-colors ${
        unread ? 'border-r-4 border-r-cyan-500 border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/70'
      } hover:bg-slate-50`}
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded px-1.5 py-0.5 font-black ${SEVERITY_CLASS[f.severity] ?? SEVERITY_CLASS.low}`}>
          {f.severity}
        </span>
        <span className="rounded bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">{KIND_LABEL[f.kind] ?? f.kind}</span>
        <span className="text-slate-500">{PLATFORM_LABEL[f.platform] ?? f.platform}</span>
        {unread && <span className="font-black text-cyan-700">● לא נקרא</span>}
      </div>

      <p className={`mt-2 break-words ${unread ? 'font-black text-slate-900' : 'font-medium text-slate-600'}`}>{f.title}</p>

      <p className="mt-1 text-xs text-slate-500">
        {f.counts.lastHour} אירועים בשעה האחרונה · {f.counts.last24h} ב-24 שעות · {f.counts.total} סה״כ
      </p>

      {f.suspectedPr && (
        <p className="mt-2 text-xs text-slate-600 flex flex-wrap items-center gap-1">
          <GitPullRequest size={13} className="shrink-0" />
          <span>סיבה סבירה:</span>
          {prUrl ? (
            <a href={prUrl} target="_blank" rel="noopener noreferrer" className="font-bold text-cyan-700 hover:underline">
              PR #{f.suspectedPr.number}
            </a>
          ) : (
            <span className="font-bold">PR #{f.suspectedPr.number}</span>
          )}
          <span className="truncate max-w-[20rem]">“{f.suspectedPr.title}”</span>
          <span className="text-slate-400">· ביטחון: {CONFIDENCE_LABEL[f.confidence] ?? f.confidence}</span>
        </p>
      )}

      {f.suggestion && (
        <p className="mt-2 text-sm text-slate-700 flex gap-1.5 bg-amber-50 border border-amber-100 rounded-lg p-2">
          <Lightbulb size={15} className="shrink-0 mt-0.5 text-amber-600" />
          <span className="break-words">{f.suggestion}</span>
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <span>
          הופעה ראשונה {formatPanelTime(f.firstSeenAt)} · נוצר {formatPanelTime(f.createdAt)} · נקרא{' '}
          {f.readAt ? formatPanelTime(f.readAt) : '—'}
        </span>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 font-bold text-cyan-700 hover:underline"
          >
            פתח במקור <ExternalLink size={12} />
          </a>
        )}
      </div>
    </div>
  );
}
