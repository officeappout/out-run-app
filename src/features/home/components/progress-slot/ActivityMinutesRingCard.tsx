'use client';

/**
 * Home 'מדדי בריאות' — the week's active minutes as a ring split by activity, the same
 * numbers as the ring at the top of the Progress page (summarizePeriod over this week;
 * strength cyan / run green / walk orange), with the change vs last week at the same
 * stage. Replaces the steps ring here (steps live on the Progress page). Tap → Progress.
 */
import { useRouter } from 'next/navigation';
import { SegmentedRing } from '@/components/ui/v2';
import { STEPS_WALK_COLORS, TRACK_COLORS } from '@/components/ui/v2/track-colors';
import { activitySplit, type SplitKind } from '@/features/progression-hub/v2/utils/period-spark';
import { useWeekActivitySummary } from '@/features/home/hooks/useWeekActivitySummary';
import { PROGRESS_HREF } from '@/features/home/utils/progress-slot';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';

const RING_COLORS: Record<SplitKind, string> = {
  strength: TRACK_COLORS.strength,
  run: TRACK_COLORS.run,
  walk: STEPS_WALK_COLORS.fill,
};

const CARD = 'flex h-full w-full flex-col items-center justify-center gap-1.5 rounded-v2-card bg-white p-3.5 shadow-v2-card';

export default function ActivityMinutesRingCard() {
  const t = useT(home);
  const router = useRouter();
  const { current, previous, error } = useWeekActivitySummary();

  if (error) {
    return (
      <div className={CARD} data-home-minutes-ring="error">
        <p className="text-center text-[12.5px] font-bold text-v2-muted">{t('progressSlot.minutesRing.error')}</p>
      </div>
    );
  }
  if (!current) {
    return <div className={`${CARD} animate-pulse`} aria-busy="true" data-home-minutes-ring="loading" />;
  }

  const minutes = current.minutes;
  const delta = minutes - (previous?.minutes ?? 0);
  const minutesText = formatNumber(minutes, t.locale);
  const segments = activitySplit(current).map((s) => ({ key: s.kind, value: s.minutes, color: RING_COLORS[s.kind] }));

  return (
    <button
      type="button"
      onClick={() => router.push(PROGRESS_HREF)}
      className={`${CARD} transition-transform duration-150 ease-v2 active:scale-[0.97]`}
      data-home-minutes-ring="ready"
    >
      <SegmentedRing size={78} stroke={8} gap={4} segments={segments} label={t('progressSlot.minutesRing.ringAria', { minutes: minutesText })}>
        <span className="text-[16px] font-black tabular-nums text-v2-ink">{minutesText}</span>
      </SegmentedRing>
      <span className="whitespace-nowrap text-[12.5px] font-extrabold text-v2-deep">{t('progressSlot.minutesRing.label')}</span>
      <span className={`whitespace-nowrap text-[12px] font-bold ${delta > 0 ? 'text-[#047857]' : 'text-v2-muted'}`}>
        {delta === 0
          ? t('progressSlot.minutesRing.sameAsLastWeek')
          : t('progressSlot.minutesRing.vsLastWeek', { delta: formatNumber(delta, t.locale, { signDisplay: 'always' }) })}
      </span>
    </button>
  );
}
