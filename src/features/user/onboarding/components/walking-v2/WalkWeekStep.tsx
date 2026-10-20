'use client';

/**
 * Walking signup · "השבוע שלך" (enable_home_v2; board wr/WR-3c). The recommendation,
 * the week in the schedule builder's own rows (WeekDayRow / WeekSessionPiece), the
 * optional core add-on days (display only), the gentle ramp line and "לא לבד".
 * One CTA. Presentational.
 */
import { Dumbbell, Footprints, Info, TrendingUp } from 'lucide-react';
import StickyActionButton from '@/components/ui/StickyActionButton';
import { IconTile, RecommendationCard, WeekDayRow, WeekSessionPiece } from '@/components/ui/v2';
import { DAY_LETTERS_HE, RUN_TIME_PRESETS, DEFAULT_RUN_WINDOW } from '@/features/schedule/utils/runWeekRecommendation';
import type { TimeWindow } from '@/features/schedule/engine-v2/types';
import type { PolicyAddOn } from '@/features/schedule/recommendation-policy/types';
import {
  walkRampLine,
  walkRecommendationTitle,
  walkWeekDays,
  walkWeekSubtitle,
  type WalkingGroupSuggestion,
  type WalkPlan,
} from '@/features/schedule/walking';
import NotAloneCard from '@/features/schedule/walking/components/NotAloneCard';

export interface WalkWeekStepProps {
  plan: WalkPlan;
  addOn: PolicyAddOn | null;
  windows: Partial<Record<number, TimeWindow>>;
  dates: number[];
  notAlone: WalkingGroupSuggestion | null;
  onOpenGroup: (groupId: string) => void;
  error: string | null;
  onConfirm: () => void | Promise<void>;
}

export default function WalkWeekStep(p: WalkWeekStepProps) {
  const rows = walkWeekDays(p.plan.weeks[0], p.addOn);
  const ramp = walkRampLine(p.plan);
  return (
    <div dir="rtl" className="relative mx-auto flex w-full max-w-md flex-1 flex-col bg-v2-surface font-simpler text-v2-ink">
      <div className="px-4 pb-2 pt-1">
        <h1 className="truncate whitespace-nowrap text-[24px] font-black leading-[1.2] !tracking-[-0.02em]">השבוע שלך</h1>
        <p className="mt-0.5 truncate whitespace-nowrap text-[13.5px] font-bold text-v2-muted">{walkWeekSubtitle(p.plan, p.addOn)}</p>

        <RecommendationCard className="mt-3.5" title={walkRecommendationTitle(p.plan)} detail={p.plan.reasonsHe[0]} notes={p.plan.reasonsHe.slice(1)} />

        {ramp && (
          <p className="mt-2.5 flex items-center gap-1.5 whitespace-nowrap px-1 text-[12.5px] font-extrabold text-v2-deep">
            <TrendingUp size={14} strokeWidth={2.2} aria-hidden className="shrink-0" />
            <span className="truncate">{ramp}</span>
          </p>
        )}

        <div className="mt-3 overflow-hidden rounded-[22px] bg-white shadow-v2-card">
          {rows.map((r) => {
            const time = RUN_TIME_PRESETS[p.windows[r.dow] ?? DEFAULT_RUN_WINDOW];
            return (
              <WeekDayRow
                key={r.dow}
                letter={DAY_LETTERS_HE[r.dow]}
                date={p.dates[r.dow]}
                muted={!r.walk}
                emptyLabel="מנוחה"
                divider={r.dow > 0}
              >
                {r.walk && (
                  <WeekSessionPiece
                    icon={<IconTile icon={Footprints} tone="steps" size="sm" />}
                    title={r.walk.title}
                    subtitle={`${r.walk.subtitle} · ${time.label} ${time.time}`}
                  />
                )}
                {r.addOn && (
                  <WeekSessionPiece icon={<IconTile icon={Dumbbell} tone="accent" size="sm" />} title={r.addOn.title} subtitle={r.addOn.subtitle} />
                )}
              </WeekDayRow>
            );
          })}
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-[14px] bg-v2-tint px-3.5 py-2.5 text-[13px] font-bold leading-snug text-v2-ink">
          <Info size={16} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-v2-deep" />
          <span className="min-w-0">הליכה מותרת גם ביום כוח וגם יומיים ברצף. כל הליכה נספרת ליעד הצעדים.</span>
        </div>

        <NotAloneCard className="mt-3" suggestion={p.notAlone} onOpenGroup={p.onOpenGroup} />

        {p.error && <p className="mt-3 text-center text-[13px] font-bold text-red-600">{p.error}</p>}
      </div>

      <div className="flex-grow" />
      <StickyActionButton variant="v2" label="אישור השבוע" onPress={p.onConfirm} />
    </div>
  );
}
