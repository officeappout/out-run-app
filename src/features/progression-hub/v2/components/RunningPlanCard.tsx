'use client';

/**
 * P-4 · ריצה — the running plan as one card: "שבוע 3 מתוך 8 · 7/9 אימונים
 * בוצעו" + one dot per week (done / this week / ahead). A running plan has no
 * skill map, so the tap opens its summary in view mode (/progression/running-plan).
 */
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import type { RunningPlanProgress } from '../utils/running-plan-progress';
import { PROGRESS_COLORS } from '../utils/progress-model';
import KindIcon from './KindIcon';

export default function RunningPlanCard({ plan }: { plan: RunningPlanProgress }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push('/progression/running-plan')}
      className="w-full rounded-v2-card bg-white p-4 text-right shadow-v2-card transition-transform duration-150 ease-v2 active:scale-[0.97]"
    >
      <div className="flex items-center gap-3">
        <KindIcon kind="run" size={40} />
        <div className="min-w-0 flex-1">
          <p className="truncate whitespace-nowrap text-[15px] font-extrabold text-v2-ink">{plan.title}</p>
          <p className="truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted tabular-nums">
            שבוע {plan.currentWeek} מתוך {plan.weeks} · {plan.done}/{plan.dueSoFar} אימונים בוצעו
          </p>
        </div>
        <ChevronLeft className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
      </div>
      <div className="mt-3 flex gap-1" aria-hidden>
        {Array.from({ length: plan.weeks }, (_, i) => {
          const w = i + 1;
          const state = w < plan.currentWeek ? 'done' : w === plan.currentWeek ? 'now' : 'ahead';
          return (
            <span
              key={w}
              className={`h-2 flex-1 rounded-full ${state === 'ahead' ? 'bg-v2-hairline' : ''}`}
              style={
                state === 'done'
                  ? { background: PROGRESS_COLORS.run }
                  : state === 'now'
                    ? { background: PROGRESS_COLORS.run, opacity: 0.45 }
                    : undefined
              }
            />
          );
        })}
      </div>
    </button>
  );
}
