'use client';

/**
 * "Your exercises" with their trend (PG-4): the best set of the last session
 * and a small line of the best set over the last ≤ 7 sessions (recentMax).
 * Tap → the exercise page (/profile/exercise/[id]), as the old strength tab did.
 */
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { HUB_COLORS } from '../hub-colors';
import HubKindIcon from '../components/HubKindIcon';
import type { ExerciseTrend } from './exercise-trends.service';
import { trendOf } from './strength-page.model';

const W = 64;
const H = 26;

function Spark({ values }: { values: readonly number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => (i / (values.length - 1)) * (W - 4) + 2;
  const y = (v: number) => (max > min ? H - 3 - ((v - min) / (max - min)) * (H - 6) : H / 2);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="shrink-0">
      <polyline fill="none" stroke={HUB_COLORS.strength.fill} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" points={values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} />
    </svg>
  );
}

export default function StrengthExercisesList({ items }: { items: readonly ExerciseTrend[] }) {
  const t = useT(profileNs);
  const router = useRouter();
  if (items.length === 0) return null;
  return (
    <section data-strength-exercises>
      <h3 className="mb-2 whitespace-nowrap text-[15px] font-black text-v2-ink">{t('hubV2.strength.exercises.title')}</h3>
      <div className="space-y-2">
        {items.map((ex) => {
          const trend = trendOf(ex.recentMax);
          return (
            <button
              key={ex.exerciseId}
              type="button"
              onClick={() => router.push(`/profile/exercise/${encodeURIComponent(ex.exerciseId)}?name=${encodeURIComponent(ex.name)}`)}
              className="flex w-full items-center gap-3 rounded-[20px] bg-white p-3 text-start shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
            >
              <HubKindIcon kind="strength" size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14.5px] font-extrabold text-v2-ink">{ex.name}</p>
                <p className="truncate text-[12px] font-bold text-v2-muted">
                  {ex.lastBest > 0 ? t('hubV2.strength.exercises.lastBest', { best: formatNumber(ex.lastBest, t.locale) }) : t('hub.strength.exercises.lastWorkout')}
                </p>
              </div>
              <Spark values={ex.recentMax} />
              {trend && <span className="sr-only">{t('hubV2.strength.exercises.trend', { trend })}</span>}
              <ChevronLeft className="h-4 w-4 shrink-0 text-v2-muted ltr:rotate-180" aria-hidden />
            </button>
          );
        })}
      </div>
    </section>
  );
}
