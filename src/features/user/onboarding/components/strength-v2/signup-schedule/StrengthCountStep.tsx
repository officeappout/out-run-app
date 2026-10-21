'use client';

/**
 * Strength schedule · Q1 "מתי נתאמן?" opened with the recommendation
 * pre-filled and its count preselected (enable_home_v2; boards jr/J1-07,
 * sch/S-5a). The old "routine last month" question survives only as an
 * optional chip row. One CTA.
 */
import { useT } from '@/hooks/useT';
import { onboarding, type OnboardingKey } from '@/messages/ns/onboarding';
import StickyActionButton from '@/components/ui/StickyActionButton';
import { RecommendationCard } from '@/components/ui/v2';
import { MAX_STRENGTH_FREQUENCY, MIN_STRENGTH_FREQUENCY } from '@/features/schedule/utils/strengthWeekRecommendation';

export type HistoryFrequency = 'none' | '1-2' | '3+';

const HISTORY_OPTIONS: ReadonlyArray<{ id: HistoryFrequency; labelKey: OnboardingKey }> = [
  { id: 'none', labelKey: 'signup.strength.count.history.none' },
  { id: '1-2', labelKey: 'signup.strength.count.history.oneTwo' },
  { id: '3+', labelKey: 'signup.strength.count.history.threePlus' },
];

const COUNTS = Array.from(
  { length: MAX_STRENGTH_FREQUENCY - MIN_STRENGTH_FREQUENCY + 1 },
  (_, i) => MIN_STRENGTH_FREQUENCY + i,
);

export interface StrengthCountStepProps {
  /** "3 ימים בשבוע · כוח מלא א׳ / ג׳ / ה׳" */
  recommendationTitle: string;
  /** "רמה 4 · 48 שעות התאוששות בין אימונים" */
  whyLine: string;
  /** More policy reasons + the add-ons line (recommendation policy). */
  notes?: string[];
  /** "כוח · כל הגוף" */
  planLine: string;
  recommendedFrequency: number;
  frequency: number;
  onFrequency: (n: number) => void;
  history: HistoryFrequency | null;
  onHistory: (h: HistoryFrequency | null) => void;
  /** Gender-aware question ("אתה" / "את"). */
  question: string;
  onNext: () => void;
}

const chipCls = (on: boolean) =>
  `inline-flex h-[34px] items-center whitespace-nowrap rounded-full px-3 text-[13.5px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
    on ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
  }`;

export default function StrengthCountStep(p: StrengthCountStepProps) {
  const t = useT(onboarding);
  return (
    <div dir="rtl" className="relative mx-auto flex min-h-full w-full max-w-md flex-1 flex-col bg-v2-surface font-simpler text-v2-ink">
      <div className="px-4 pb-2 pt-1">
        <h1 className="truncate whitespace-nowrap text-[24px] font-black leading-[1.2] !tracking-[-0.02em]">{t('signup.strength.count.title')}</h1>
        <p className="mt-0.5 truncate whitespace-nowrap text-[13.5px] font-bold text-v2-muted">{t('signup.strength.count.subtitle')}</p>

        <RecommendationCard className="mt-3.5" title={p.recommendationTitle} detail={p.whyLine} notes={p.notes} aside={t('signup.strength.count.aside')} />

        <p className="mt-4 truncate whitespace-nowrap text-[13px] font-extrabold text-v2-muted">{p.planLine}</p>
        <p className="mt-2.5 truncate whitespace-nowrap text-[16px] font-black">{p.question}</p>
        <div className="mt-3 flex gap-1.5" role="radiogroup" aria-label={t('signup.strength.count.aria')}>
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
                    {t('signup.strength.count.recommended')}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-6">
          <p className="whitespace-nowrap text-[13px] font-extrabold text-v2-muted">{t('signup.strength.count.history.label')}</p>
          <div className="mt-2 flex gap-2" role="radiogroup" aria-label={t('signup.strength.count.history.aria')}>
            {HISTORY_OPTIONS.map((o) => {
              const on = p.history === o.id;
              return (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => p.onHistory(on ? null : o.id)}
                  className={chipCls(on)}
                >
                  {t(o.labelKey)}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-grow" />
      <StickyActionButton
        variant="v2"
        label={p.frequency === p.recommendedFrequency ? t('signup.strength.count.cta.recommended') : t('signup.strength.count.cta.next')}
        onPress={p.onNext}
      />
    </div>
  );
}
