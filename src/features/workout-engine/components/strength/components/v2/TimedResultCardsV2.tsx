'use client';

/**
 * TimedResultCardsV2 — the format cards of the v2 strength summary
 * (enable_home_v2): AMRAP "התוצאה שלך · 4 סבבים מלאים · ועוד 16 חזרות"
 * with a tile per round (board A-2f), EMOM "11/12 דקות בזמן" + minute-by-
 * minute bars (A-4f), tabata intervals. Presentational; the numbers come
 * from utils/timed-summary.model. The sets table below stays the shared one.
 */
import React from 'react';
import { Check, Timer } from 'lucide-react';
import { Card, IconTile } from '@/components/ui/v2';
import type { TimedBlockResult } from '@/features/workout-engine/engines/timed/timed-result';
import {
  amrapSummaryModel,
  emomSummaryModel,
  tabataSummaryLine,
  type AmrapSummaryModel,
  type EmomSummaryModel,
  type MinuteTone,
} from '../../utils/timed-summary.model';

function AmrapCard({ m }: { m: AmrapSummaryModel }) {
  return (
    <Card>
      <div className="text-[13px] font-extrabold text-v2-deep">התוצאה שלך · {m.title}</div>
      <div className="mt-0.5 flex items-baseline gap-2.5">
        <span className="text-[64px] font-black leading-none tabular-nums !tracking-[-0.04em] text-v2-ink">{m.fullRounds}</span>
        <span className="whitespace-nowrap text-[24px] font-black !tracking-[-0.02em] text-v2-ink">
          {m.fullRounds === 1 ? 'סבב מלא' : 'סבבים מלאים'}
        </span>
      </div>
      {m.extraLine && <div className="mt-1 whitespace-nowrap text-[16px] font-extrabold text-v2-ink-2">{m.extraLine}</div>}
      {(m.rounds.length > 0 || m.partial) && (
        <div className="mt-3.5 flex gap-1.5" dir="rtl">
          {m.rounds.map((r) => (
            <div key={r.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="grid h-[30px] w-full place-items-center rounded-[9px] bg-[#00baf7]">
                <Check size={16} strokeWidth={3} className="text-white" aria-hidden />
              </div>
              <span className="whitespace-nowrap text-[11px] font-extrabold text-v2-ink-2">{r.label}</span>
              <span dir="ltr" className="whitespace-nowrap text-[11px] font-bold tabular-nums text-v2-muted">{r.time}</span>
            </div>
          ))}
          {m.partial && (
            <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="relative h-[30px] w-full overflow-hidden rounded-[9px] bg-[#00baf71f] ring-[1.5px] ring-inset ring-[#00baf7]">
                <div className="absolute inset-y-0 right-0 bg-[#00baf7] opacity-85" style={{ width: `${Math.round(m.partial.fraction * 100)}%` }} />
                <span dir="ltr" className="relative grid h-full place-items-center text-[11.5px] font-black tabular-nums text-v2-ink">{m.partial.label}</span>
              </div>
              <span className="whitespace-nowrap text-[11px] font-extrabold text-v2-ink-2">חלקי</span>
              <span className="text-[11px] font-bold text-v2-muted">—</span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

const BAR: Record<MinuteTone, string> = { done: 'bg-[#8b5cf6]', partial: 'bg-[#f97316]', missed: 'bg-v2-pill-border' };

function EmomCards({ m }: { m: EmomSummaryModel }) {
  return (
    <>
      <Card>
        <div className="flex items-center gap-3.5">
          <div className="min-w-0 flex-1">
            <div className="whitespace-nowrap text-[44px] font-black leading-none tabular-nums !tracking-[-0.03em] text-v2-ink">{m.doneLabel}</div>
            <div className="mt-1 whitespace-nowrap text-[13px] font-extrabold text-v2-muted">דקות שהושלמו בזמן · {m.title}</div>
          </div>
          <div className="text-center">
            <div className="text-[18px] font-black tabular-nums text-v2-ink">{m.percent}%</div>
            <div className="text-[11px] font-bold text-v2-muted">הושלם</div>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          {[
            { k: 'reps', v: String(m.totalReps), l: 'חזרות' },
            ...(m.avgWork ? [{ k: 'work', v: m.avgWork, l: 'עבודה בדקה' }] : []),
          ].map((t) => (
            <div key={t.k} className="min-w-0 flex-1 rounded-2xl bg-v2-surface p-3 ring-1 ring-inset ring-v2-hairline">
              <div className="whitespace-nowrap text-[20px] font-black tabular-nums text-v2-ink">{t.v}</div>
              <div className="whitespace-nowrap text-[12px] font-bold text-v2-muted">{t.l}</div>
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <div className="mb-3 flex items-center gap-2">
          <IconTile icon={Timer} tone="accent" size="sm" />
          <span className="flex-1 whitespace-nowrap text-[16px] font-black text-v2-ink">דקה אחר דקה</span>
          {m.avgRest && (
            <span className="inline-flex h-7 items-center whitespace-nowrap rounded-full bg-white px-3 text-[12px] font-extrabold tabular-nums text-v2-ink-2 shadow-v2-ring">
              מנוחה ממוצעת {m.avgRest}
            </span>
          )}
        </div>
        <div className="flex items-end gap-2" dir="rtl" role="img" aria-label={`${m.doneLabel} דקות בזמן`}>
          {m.bars.map((b) => (
            <div key={b.key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="flex h-20 w-full max-w-[34px] items-end">
                <div className={`w-full rounded-[8px_8px_4px_4px] ${BAR[b.tone]}`} style={{ height: `${Math.round(b.fraction * 100)}%` }} />
              </div>
              <span className="whitespace-nowrap text-[11px] font-bold tabular-nums text-v2-muted">{b.label}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[12px] font-bold text-v2-muted">
          גובה = זמן עבודה מתוך הדקה{m.note ? `. ${m.note}` : ''}
        </p>
      </Card>
    </>
  );
}

export default function TimedResultCardsV2({ results }: { results: readonly TimedBlockResult[] }) {
  return (
    <>
      {results.map((r, i) => {
        const amrap = amrapSummaryModel(r);
        if (amrap) return <AmrapCard key={i} m={amrap} />;
        const emom = emomSummaryModel(r);
        if (emom) return <EmomCards key={i} m={emom} />;
        const line = tabataSummaryLine(r);
        return line ? (
          <Card key={i}>
            <div className="text-[13px] font-extrabold text-v2-deep">טבטה</div>
            <div className="whitespace-nowrap text-[24px] font-black tabular-nums text-v2-ink">{line}</div>
          </Card>
        ) : null;
      })}
    </>
  );
}
