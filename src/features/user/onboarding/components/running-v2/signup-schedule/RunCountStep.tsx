'use client';

/**
 * Run signup · Q1 "כמה ריצות?" with the recommendation pre-filled
 * (enable_home_v2; boards jr/J2-06, sch/S-5d). One CTA.
 */
import { RecommendationCard } from '@/components/ui/v2';
import StickyActionButton from '@/components/ui/StickyActionButton';
import { MAX_RUNNING_FREQUENCY, MIN_RUNNING_FREQUENCY } from '@/lib/running-frequency-bounds';

export interface RunCountStepProps {
  /** "3 ריצות: איכות · איכות נוספת · ארוכה בשישי" */
  recommendationTitle: string;
  /** "תוכנית 10 ק״מ · 8 שבועות" */
  planLine: string;
  /** Why (recommendation policy reasons) + add-ons, one line each. */
  notes?: string[];
  recommendedFrequency: number;
  frequency: number;
  onFrequency: (n: number) => void;
  onNext: () => void;
}

const COUNTS = Array.from(
  { length: MAX_RUNNING_FREQUENCY - MIN_RUNNING_FREQUENCY + 1 },
  (_, i) => MIN_RUNNING_FREQUENCY + i,
);

export default function RunCountStep(p: RunCountStepProps) {
  return (
    <div dir="rtl" className="relative mx-auto flex w-full max-w-md flex-1 flex-col bg-v2-surface font-simpler text-v2-ink">
      <div className="px-4 pb-2 pt-1">
        <h1 className="truncate whitespace-nowrap text-[24px] font-black leading-[1.2] !tracking-[-0.02em]">מתי נרוץ?</h1>
        <p className="mt-0.5 truncate whitespace-nowrap text-[13.5px] font-bold text-v2-muted">הכנו המלצה — אישור בלחיצה</p>

        <RecommendationCard className="mt-3.5" title={p.recommendationTitle} detail={p.planLine} notes={p.notes} aside="אפשר לשנות" />

        <p className="mt-5 whitespace-nowrap text-[16px] font-black">כמה ריצות בשבוע?</p>
        <div className="mt-3 flex gap-1.5" role="radiogroup" aria-label="מספר ריצות בשבוע">
          {COUNTS.map((n) => {
            const on = n === p.frequency;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => p.onFrequency(n)}
                className={`relative grid h-12 flex-1 place-items-center rounded-2xl text-[18px] font-black tabular-nums transition-transform duration-150 ease-v2 active:scale-[0.97] ${
                  on ? 'bg-v2-tint text-v2-deep ring-2 ring-inset ring-v2-accent' : 'bg-white text-v2-ink-2 shadow-v2-ring'
                }`}
              >
                {n}
                {n === p.recommendedFrequency && (
                  <span className="absolute -top-[9px] left-1/2 inline-flex h-[18px] -translate-x-1/2 items-center whitespace-nowrap rounded-full bg-v2-deep px-1.5 text-[11px] font-extrabold text-white">
                    מומלץ
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-grow" />
      <StickyActionButton
        variant="v2"
        label={p.frequency === p.recommendedFrequency ? 'המשך עם ההמלצה' : 'המשך'}
        onPress={p.onNext}
      />
    </div>
  );
}
