'use client';

/**
 * The plan by weeks, Runna-style (PG-3): each week's phase, totals and state.
 * This week and next week list their sessions (planned time / distance, done
 * check); finished weeks are collapsed to "3 of 3 runs done" and open on tap;
 * weeks further ahead are summarized, with "show weeks N–M" for the rest.
 */
import { useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { HUB_COLORS } from '../hub-colors';
import type { PlanEntry, PlanWeek } from './run-page.model';

const GREEN = HUB_COLORS.run;
const AHEAD_SHOWN = 2;

function EntryRow({ e }: { e: PlanEntry }) {
  const t = useT(profileNs);
  const done = e.status === 'completed';
  const n1 = (v: number) => formatNumber(v, t.locale, { maximumFractionDigits: 1 });
  return (
    <li className="flex items-center gap-3 py-2">
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-black tabular-nums"
        style={done ? { background: GREEN.fill, color: '#fff' } : { background: GREEN.tile, color: GREEN.text }}
        aria-hidden
      >
        {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : formatNumber(e.ordinal, t.locale)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-extrabold text-v2-ink">{e.name ?? t('hubV2.run.weeks.session', { n: e.ordinal })}</p>
        {(e.plannedMin != null || e.plannedKm != null) && (
          <p className="truncate text-[12px] font-bold text-v2-muted">
            {t('hubV2.run.weeks.sessionPlan', {
              min: e.plannedMin != null ? formatNumber(e.plannedMin, t.locale) : '',
              km: e.plannedKm != null ? n1(e.plannedKm) : '',
              has: e.plannedMin != null && e.plannedKm != null ? 'both' : e.plannedMin != null ? 'min' : 'km',
            })}
          </p>
        )}
      </div>
      <span className="sr-only">{t('hubV2.run.weeks.sessionState', { state: e.status })}</span>
    </li>
  );
}

function WeekCard({ w, defaultOpen }: { w: PlanWeek; defaultOpen: boolean }) {
  const t = useT(profileNs);
  const [open, setOpen] = useState(defaultOpen);
  const n = (v: number) => formatNumber(v, t.locale);
  const n1 = (v: number) => formatNumber(v, t.locale, { maximumFractionDigits: 1 });
  const totals = t('hubV2.run.weeks.totals', {
    km: w.plannedKm != null ? n1(w.plannedKm) : '',
    min: w.plannedMin != null ? n(w.plannedMin) : '',
    has: w.plannedKm != null && w.plannedMin != null ? 'yes' : 'no',
    count: w.entries.length,
  });
  const highlight = w.state === 'current';
  return (
    <Card padding="none" className="px-4 py-3" style={highlight ? { boxShadow: `inset 0 0 0 2px ${GREEN.fill}` } : undefined} data-run-week={w.state}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2 text-start">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="whitespace-nowrap text-[15px] font-black text-v2-ink">{t('hubV2.run.weeks.week', { n: n(w.week) })}</span>
            {w.phase && (
              <span className="rounded-full px-2 py-0.5 text-[11px] font-extrabold" style={{ background: GREEN.tile, color: GREEN.text }}>
                {t('hubV2.run.weeks.phase', { phase: w.phase })}
              </span>
            )}
            <span className="ms-auto whitespace-nowrap text-[11.5px] font-extrabold" style={{ color: w.state === 'ahead' ? '#64748b' : GREEN.text }}>
              {t('hubV2.run.weeks.state', { state: w.state })}
            </span>
          </span>
          <span className="block truncate text-[12px] font-bold text-v2-muted">
            {w.state === 'done' ? t('hubV2.run.weeks.doneOf', { done: n(w.completed), count: w.entries.length }) : totals}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-v2-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && w.entries.length > 0 && (
        <ul className="mt-1 divide-y divide-v2-hairline">
          {w.entries.map((e) => (
            <EntryRow key={e.key} e={e} />
          ))}
        </ul>
      )}
    </Card>
  );
}

export default function RunWeeksList({ weeks }: { weeks: readonly PlanWeek[] }) {
  const t = useT(profileNs);
  const [showAll, setShowAll] = useState(false);
  const curIdx = weeks.findIndex((w) => w.state === 'current');
  const lastShown = showAll ? weeks.length : Math.min(weeks.length, (curIdx < 0 ? 0 : curIdx) + 1 + AHEAD_SHOWN);
  const shown = weeks.slice(0, lastShown);
  const hidden = weeks.length - lastShown;
  if (weeks.length === 0) return null;
  return (
    <section className="space-y-2" data-run-weeks>
      <h3 className="whitespace-nowrap text-[15px] font-black text-v2-ink">{t('hubV2.run.weeks.title')}</h3>
      {shown.map((w) => (
        <WeekCard key={w.week} w={w} defaultOpen={w.state === 'current' || w.state === 'next'} />
      ))}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="flex h-11 w-full items-center justify-center rounded-full bg-white text-[14px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          {t('hubV2.run.weeks.showMore', { from: formatNumber(lastShown + 1, t.locale), to: formatNumber(weeks.length, t.locale) })}
        </button>
      )}
    </section>
  );
}
