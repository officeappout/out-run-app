'use client';

/**
 * Home 'התקדמות שבועית' row under enable_home_progress_slot_v1 (boards PG-1): the same
 * grid as today — the program slot (minmax(0,1fr)) beside the weekly bars (111px) — but
 * the slot is a swipeable pair with pager dots: strength program ↔ running plan (or the
 * walking plan, in orange). No running / walking plan → the strength card alone.
 */
import { useMemo, type ReactNode } from 'react';
import { PagedCarousel } from '@/components/ui/v2';
import { useUserStore } from '@/features/user';
import { resolvePlanSlide } from '@/features/home/utils/progress-slot';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import StrengthSlide from './StrengthSlide';
import RunPlanSlide from './RunPlanSlide';
import WalkPlanSlide from './WalkPlanSlide';
import { useUiDir } from '@/lib/i18n/useUiDir';

export interface HomeProgressSlotRowProps {
  /** The weekly bars card (ConsistencyWidget), passed in boundary-wrapped by the page. */
  aside: ReactNode;
}

export default function HomeProgressSlotRow({ aside }: HomeProgressSlotRowProps) {
  const { direction: uiDir } = useUiDir();
  const t = useT(home);
  const running = useUserStore((s) => s.profile?.running);
  const walkingGoal = useUserStore((s) => (s.profile?.lifestyle as { walkingGoal?: unknown } | undefined)?.walkingGoal);
  const slide = useMemo(() => resolvePlanSlide({ running, lifestyle: { walkingGoal } }), [running, walkingGoal]);

  return (
    <div
      className="grid w-full items-stretch gap-4"
      style={{ gridTemplateColumns: 'minmax(0, 1fr) 111px', direction: uiDir }}
      data-home-progress-slot={slide?.kind ?? 'strength'}
    >
      <PagedCarousel
        ariaLabel={t('progressSlot.carousel.aria')}
        dotLabel={(i, n) => t('progressSlot.carousel.dot', { page: formatNumber(i + 1, t.locale), count: formatNumber(n, t.locale) })}
      >
        <StrengthSlide key="strength" />
        {slide?.kind === 'run' && <RunPlanSlide key="run" plan={slide.plan} pct={slide.pct} />}
        {slide?.kind === 'walk' && <WalkPlanSlide key="walk" targetWeeklyMinutes={slide.targetWeeklyMinutes} />}
      </PagedCarousel>
      {aside}
    </div>
  );
}
