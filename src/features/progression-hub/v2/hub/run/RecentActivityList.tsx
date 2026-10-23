'use client';

/**
 * Recent runs / walks (PG-3): title + distance, day · pace · minutes, and —
 * for runs saved with time-in-zone — the % of the run inside the target band
 * (checked at ≥ 70%). Tap → the saved workout.
 */
import { useRouter } from 'next/navigation';
import { Check, ChevronLeft } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import type { ProgressWorkout } from '../../utils/progress-model';
import { formatKm, formatPace, relativeDay } from '../../utils/progress-format';
import { HUB_COLORS } from '../hub-colors';
import HubKindIcon from '../components/HubKindIcon';

export const IN_ZONE_MARK = 70;

export default function RecentActivityList({ kind, items, now }: { kind: 'run' | 'walk'; items: readonly ProgressWorkout[]; now: Date }) {
  const t = useT(profileNs);
  const router = useRouter();
  const tone = HUB_COLORS[kind];
  if (items.length === 0) return null;
  return (
    <section data-recent={kind}>
      <h3 className="mb-2 whitespace-nowrap text-[15px] font-black text-v2-ink">{t('hubV2.run.recent.title', { kind })}</h3>
      <div className="space-y-2">
        {items.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => router.push(`/workouts/${r.sessionId ?? r.id}/history`)}
            className="flex w-full items-center gap-3 rounded-[20px] bg-white p-3 text-start shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <HubKindIcon kind={kind} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-extrabold text-v2-ink">
                {t('hubV2.run.recent.rowTitle', { kind, title: r.title ?? '', hasTitle: r.title ? 'yes' : 'no', km: formatKm(r.km, t.locale) })}
              </p>
              <p className="truncate text-[12px] font-bold text-v2-muted">
                {t('hubV2.run.recent.rowMeta', { day: relativeDay(r.date, now), pace: formatPace(r.pace), minutes: formatNumber(Math.round(r.minutes), t.locale) })}
              </p>
            </div>
            {r.inZonePct != null && (
              <span
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-extrabold"
                style={{ background: tone.tile, color: tone.text }}
              >
                {r.inZonePct >= IN_ZONE_MARK && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
                {t('hubV2.run.recent.inZone', { pct: formatNumber(r.inZonePct, t.locale) })}
              </span>
            )}
            <ChevronLeft className="h-4 w-4 shrink-0 text-v2-muted ltr:rotate-180" aria-hidden />
          </button>
        ))}
      </div>
    </section>
  );
}
