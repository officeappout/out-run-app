'use client';

import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';
import { useTogetherLocale } from '../hooks/useTogetherLocale';
import { localizeParams } from '../core/localize';
import { formatPace } from '../core/rail-logic';
import type { SummaryPerson, TogetherSummary } from '../core/summary';

const KM = { km: 1, me: 2, them: 2 };

/**
 * The "יחד" layer added to the EXISTING summaries (no new screen): collective
 * line, equal participant list (me first, no ranking, no MVP), pair closeness,
 * and the duel result only if a duel was picked.
 */
export default function TogetherSummarySection({ summary }: { summary: TogetherSummary }) {
  const t = useT(together);
  const { locale, dir } = useTogetherLocale();
  const L = (p: Record<string, string | number>, fixed: Record<string, number> = KM) => localizeParams(p, locale, fixed);
  const { totals, kind } = summary;

  const collective = (() => {
    const base = { n: summary.count, count: summary.count };
    switch (kind) {
      case 'run': return t('summary.collective.run', L({ ...base, km: totals.distanceKm }));
      case 'strength': return t('summary.collective.strength', L({ ...base, sets: totals.sets }));
      case 'amrap': return t('summary.collective.amrap', L({ ...base, rounds: totals.rounds }));
      case 'emom': return t('summary.collective.emom', L({ ...base, minutes: totals.minutes }));
    }
  })();

  const row = (p: SummaryPerson) => {
    switch (kind) {
      case 'run': {
        const pace = formatPace(p.paceSecPerKm);
        return pace ? t('summary.row.run', { ...L({ km: p.distanceKm }), pace }) : t('summary.row.runKm', L({ km: p.distanceKm }));
      }
      case 'strength': return t('summary.row.strength', L({ sets: p.sets }));
      case 'amrap': return t('summary.row.amrap', L({ rounds: p.rounds }));
      case 'emom': return t('summary.row.emom', L({ minutes: p.minutes }));
    }
  };

  return (
    <section dir={dir} aria-label={t('summary.title')} className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="text-[15px] font-extrabold text-slate-900" data-testid="together-collective">{collective}</p>

      {summary.closenessMeters != null && (
        <p className="mt-1 text-[13px] font-semibold text-slate-600">
          {summary.closenessMeters < 20 ? t('summary.close.tight') : t('summary.close.gap', L({ m: summary.closenessMeters }, {}))}
        </p>
      )}

      <p className="mb-1 mt-3 text-xs font-bold text-slate-500">{t('summary.list.title')}</p>
      <ul className="flex flex-col">
        {summary.people.map((p) => (
          <li
            key={p.uid}
            className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${p.isMe ? 'bg-emerald-50' : ''}`}
            data-me={p.isMe ? 'true' : undefined}
          >
            <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 text-xs font-bold text-slate-700">
              {p.photoURL ? <img src={p.photoURL} alt="" className="h-full w-full object-cover" /> : (p.name.charAt(0) || '·')}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900">{p.name}</span>
            <span className="text-sm tabular-nums text-slate-700">{row(p)}</span>
            {p.cheers > 0 && <span className="text-xs font-bold text-amber-600">{t('summary.cheers', L({ n: p.cheers, count: p.cheers }, {}))}</span>}
          </li>
        ))}
      </ul>

      {summary.duel && (
        <div className="mt-3 rounded-xl bg-sky-50 p-3" data-testid="together-duel">
          <p className="text-[13px] font-extrabold text-sky-900">{t('summary.duel.title', { name: summary.duel.name })}</p>
          <p className="text-[13px] tabular-nums text-sky-900">{t('summary.duel.distances', L({ me: summary.duel.meKm, them: summary.duel.themKm }))}</p>
          <p className="text-[13px] font-semibold text-sky-900">
            {summary.duel.leader === 'even'
              ? t('summary.duel.even')
              : summary.duel.leader === 'me'
                ? t('summary.duel.me', L({ km: summary.duel.gapKm }, { km: 2 }))
                : t('summary.duel.them', { ...L({ km: summary.duel.gapKm }, { km: 2 }), name: summary.duel.name })}
          </p>
        </div>
      )}
    </section>
  );
}
