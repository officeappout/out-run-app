'use client';

/**
 * One message in the "שאל את OUT" drawer: the question, or the answer with its page buttons,
 * quick-answer card, collapsible evidence ("הראיות"), the "לא אומת" badge, the answer's cost
 * and 👍/👎.
 */
import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpLeft, ChevronDown, Loader2, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { EvidenceItem, QuickCard } from '@/lib/ai/admin-assistant/sse';
import { AssistantText } from './AssistantText';
import type { AssistantLink, AssistantMessage } from './useAdminAssistantStore';

const TOOL_LABELS: Record<string, string> = {
  find_admin_page: 'מחפש עמוד',
  navigate: 'מכין כפתור',
  get_attention_queue: 'בודק מה דורש תשומת לב',
  get_pending_approvals: 'סופר ממתינים לאישור',
  get_crm_pipeline: 'קורא את צנרת ה-CRM',
  get_ai_costs: 'קורא עלויות AI',
  get_north_star: 'מחשב מתאמנים פעילים',
  get_retention_cohorts: 'מחשב קוהורטות שימור',
  get_retention_drivers: 'בודק מה מחזיק משתמשים',
  get_onboarding_stall: 'בודק איפה נתקעים באונבורדינג',
  get_push_performance: 'בודק ביצועי פושים',
  get_push_funnel: 'בודק פוש ← אימון',
};

export function PageButtons({ links, onNavigate }: { links: AssistantLink[]; onNavigate?: () => void }) {
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {links.map((l) => (
        <Link
          key={`${l.pageId}-${l.href}`}
          href={l.href}
          onClick={onNavigate}
          className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[13px] font-medium text-cyan-800 hover:bg-cyan-100"
        >
          <span>{l.title}</span>
          <ArrowUpLeft size={14} aria-hidden />
        </Link>
      ))}
    </div>
  );
}

export function QuickCardView({ card, onNavigate }: { card: QuickCard; onNavigate?: () => void }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-slate-900">{card.title}</h3>
        <span className="text-[11px] text-slate-500">נכון ל-{card.asOf}</span>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[13px]">
        {card.rows.map((r, i) => (
          <div key={i} className="contents">
            <dt className="text-slate-600">{r.label}</dt>
            <dd className="text-left font-semibold tabular-nums text-slate-900" dir="ltr">
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
      {card.caveats.length > 0 && <p className="mt-2 text-[11px] leading-4 text-slate-500">{card.caveats.join(' · ')}</p>}
      {card.href && <PageButtons links={[{ href: card.href, title: 'לעמוד המלא', pageId: card.metric }]} onNavigate={onNavigate} />}
    </div>
  );
}

function EvidenceView({ items }: { items: EvidenceItem[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-1.5 text-[12px] font-medium text-slate-600" aria-expanded={open}>
        <span>הראיות ({items.length})</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <ul className="space-y-1.5 px-3 pb-2 text-[12px] text-slate-600">
          {items.map((e, i) => (
            <li key={i}>
              <span className="font-mono text-[11px] text-slate-500">{e.definitionId}</span> · {e.period.from ? `${e.period.from} – ` : ''}
              {e.period.to}
              {e.n !== null ? ` · n=${e.n}` : ''}
              {e.belowThreshold ? ' · מדגם קטן' : ''}
              {e.caveats.length > 0 && <div className="text-[11px] text-slate-500">{e.caveats.join(' · ')}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AssistantMessageView({
  message,
  onRate,
  onNavigate,
}: {
  message: AssistantMessage;
  onRate?: (m: AssistantMessage, rating: 'up' | 'down') => void;
  onNavigate?: () => void;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-start">
        <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-slate-900 px-3 py-2 text-[14px] leading-6 text-white">{message.text}</div>
      </div>
    );
  }
  const showFooter = !message.pending && (message.costUsd !== undefined || message.auditId);
  return (
    <div className="space-y-2">
      {message.text && <AssistantText text={message.text} />}
      {message.pending && !message.text && !message.card && (
        <p className="flex items-center gap-2 text-[13px] text-slate-500">
          <Loader2 size={14} className="animate-spin" aria-hidden />
          {message.running?.length ? TOOL_LABELS[message.running[message.running.length - 1]] ?? 'בודק' : 'חושב'}…
        </p>
      )}
      {message.card && <QuickCardView card={message.card} onNavigate={onNavigate} />}
      <PageButtons links={message.links} onNavigate={onNavigate} />
      {message.evidence && <EvidenceView items={message.evidence} />}
      {message.unverified && (
        <p className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[12px] font-medium text-amber-800">
          <AlertTriangle size={12} aria-hidden /> לא אומת: יש בתשובה מספר שלא הגיע מכלי
        </p>
      )}
      {message.error && <p className="text-[13px] text-rose-700">{message.error}</p>}
      {showFooter && (
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          {typeof message.costUsd === 'number' && <span dir="ltr">${message.costUsd.toFixed(4)}</span>}
          {message.auditId && onRate && (
            <span className="flex items-center gap-1">
              <button type="button" aria-label="תשובה טובה" aria-pressed={message.rating === 'up'} onClick={() => onRate(message, 'up')} className={`rounded p-1 hover:bg-slate-100 ${message.rating === 'up' ? 'text-emerald-600' : ''}`}>
                <ThumbsUp size={13} />
              </button>
              <button type="button" aria-label="תשובה לא טובה" aria-pressed={message.rating === 'down'} onClick={() => onRate(message, 'down')} className={`rounded p-1 hover:bg-slate-100 ${message.rating === 'down' ? 'text-rose-600' : ''}`}>
                <ThumbsDown size={13} />
              </button>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
