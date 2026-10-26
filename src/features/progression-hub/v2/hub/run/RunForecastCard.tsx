'use client';

/**
 * Forecast (PG-3): race times from the base pace (main distance first) and,
 * when the pace history moved it, how the main forecast changed over the last
 * weeks (a small line, oldest → today). Data: running.paceProfile only.
 */
import { Card } from '@/components/ui/v2';
import { formatRaceClock, type RaceRow } from '@/features/home/utils/race-prediction';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { HUB_COLORS } from '../hub-colors';

const GREEN = HUB_COLORS.run;
const W = 300;
const H = 64;

function TrendLine({ points }: { points: readonly { daysAgo: number; seconds: number }[] }) {
  const t = useT(profileNs);
  const xs = points.map((p) => p.daysAgo);
  const ys = points.map((p) => p.seconds);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const x = (d: number) => (maxX > 0 ? ((maxX - d) / maxX) * (W - 16) + 8 : W / 2);
  // Faster (fewer seconds) is drawn higher.
  const y = (s: number) => (maxY > minY ? ((s - minY) / (maxY - minY)) * (H - 16) + 8 : H / 2);
  const first = points[0];
  const last = points[points.length - 1];
  return (
    <div className="mt-3 border-t border-v2-hairline pt-3" data-run-forecast-trend>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-16 w-full" role="img" aria-label={t('hubV2.run.forecast.trendAria', { from: formatRaceClock(first.seconds), to: formatRaceClock(last.seconds) })}>
        <polyline fill="none" stroke={GREEN.fill} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" points={points.map((p) => `${x(p.daysAgo)},${y(p.seconds)}`).join(' ')} />
        {points.map((p) => (
          <circle key={p.daysAgo} cx={x(p.daysAgo)} cy={y(p.seconds)} r={p === last ? 5 : 3.5} fill={p === last ? GREEN.fill : '#fff'} stroke={GREEN.fill} strokeWidth={2} />
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[12px] font-bold text-v2-muted">
        <span>
          {t('hubV2.run.forecast.weeksAgo', { weeks: Math.round(first.daysAgo / 7) })} · <span dir="ltr" className="tabular-nums">{formatRaceClock(first.seconds)}</span>
        </span>
        <span className="font-extrabold" style={{ color: GREEN.text }}>
          {t('hubV2.run.forecast.today')} · <span dir="ltr" className="tabular-nums">{formatRaceClock(last.seconds)}</span>
        </span>
      </div>
    </div>
  );
}

export default function RunForecastCard({
  rows,
  trend,
}: {
  rows: readonly RaceRow[];
  trend: readonly { daysAgo: number; seconds: number }[];
}) {
  const t = useT(profileNs);
  if (rows.length === 0) return null;
  return (
    <Card padding="none" className="px-4 py-3.5" data-run-forecast>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="whitespace-nowrap text-[15px] font-black text-v2-ink">{t('hubV2.run.forecast.title')}</h3>
        <span className="truncate whitespace-nowrap text-[12px] font-extrabold text-v2-muted">{t('hub.run.prediction.basis')}</span>
      </div>
      <ul className="space-y-1.5">
        {rows.slice(0, 3).map((r, i) => (
          <li key={r.km} className="flex items-center justify-between rounded-[14px] bg-v2-surface px-3 py-2 ring-1 ring-inset ring-v2-hairline">
            <span className="text-[13.5px] font-extrabold text-v2-ink-2">
              {i === 0 ? t('hubV2.run.forecast.target', { distance: r.label }) : r.label}
            </span>
            <span className="text-[17px] font-black tabular-nums" dir="ltr" style={i === 0 ? { color: GREEN.text } : undefined}>
              {formatRaceClock(r.seconds)}
            </span>
          </li>
        ))}
      </ul>
      {trend.length >= 2 && <TrendLine points={trend} />}
    </Card>
  );
}
