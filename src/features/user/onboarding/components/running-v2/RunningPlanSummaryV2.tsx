'use client';

/**
 * Running plan summary — enable_home_v2, owner-approved R6 hero + the
 * journey-2 tiles (boards jr/J2-10, J2-11). Same onGenerate as the legacy
 * screen; nothing new is saved.
 *
 *  race photo hero (fades into the page) → "התוכנית שלך מוכנה" + plan name +
 *  "8 שבועות · עד 12.12 · 3 ריצות בשבוע" → tiles entering one after the
 *  other on scroll (RevealOnScroll): הימים שבחרת → השבוע הראשון → נפח שבועי
 *  → יעדי קצב (only when a result was entered) → one gradient CTA.
 *
 * Data: the chosen week (engine v2, from the days step), the template's
 * relative volume (running-plan-shape) and the default pace-map zones —
 * no invented numbers (kilometres are only known after the plan is built).
 */

import { useMemo, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Check } from 'lucide-react';
import StickyActionButton from '@/components/ui/StickyActionButton';
import { Card, MediaHeroFade, RevealOnScroll } from '@/components/ui/v2';
import type { RunWeekDay } from '@/features/schedule/utils/runWeekRecommendation';
import { buildWeeklyVolumePattern, isConservativePlan, paceTargetRows } from '../../utils/running-plan-shape';
import PlanVolumeChart from './summary/PlanVolumeChart';
import { ChosenDaysTile, FirstWeekTile } from './summary/PlanDaysTiles';
import PaceTargetsTile from './summary/PaceTargetsTile';

export interface RunningPlanSummaryV2Props {
  answers: Record<string, unknown>;
  distLabel: string;
  weeks: number;
  frequency: number;
  /** "12.12" */
  endDateShort: string;
  /** The chosen week — one entry per run day (engine v2 placement). */
  weekDays: RunWeekDay[];
  /** "ערב 19:00 · שישי בוקר 07:00" */
  timesLine: string | null;
  /** "שינוי" on the days tile (back to the days step). */
  onEditDays?: () => void;
  onGenerate: () => void;
}

export default function RunningPlanSummaryV2(p: RunningPlanSummaryV2Props) {
  const reduce = useReducedMotion();
  const bars = useMemo(() => buildWeeklyVolumePattern(p.weeks, isConservativePlan(p.answers)), [p.weeks, p.answers]);
  const paceRows = useMemo(() => paceTargetRows(p.answers), [p.answers]);

  const title = p.answers.targetDistance === 'maintenance' ? 'תוכנית לשמירה על כושר' : `תוכנית ${p.distLabel}`;

  const tiles = [
    p.weekDays.length > 0 && { id: 'days', node: <ChosenDaysTile days={p.weekDays} timesLine={p.timesLine} onEdit={p.onEditDays} /> },
    p.weekDays.length > 0 && { id: 'week', node: <FirstWeekTile days={p.weekDays} /> },
    {
      id: 'volume',
      node: (
        <Card padding="none" className="px-4 py-3.5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="whitespace-nowrap text-[15px] font-black">נפח שבועי</h2>
            <span className="whitespace-nowrap text-[12px] font-extrabold text-v2-muted">נפח יחסי</span>
          </div>
          <PlanVolumeChart bars={bars} />
        </Card>
      ),
    },
    paceRows.length > 0 && { id: 'pace', node: <PaceTargetsTile rows={paceRows} /> },
  ].filter(Boolean) as Array<{ id: string; node: ReactNode }>;

  return (
    <div dir="rtl" className="relative mx-auto flex w-full max-w-md flex-1 flex-col bg-v2-surface font-simpler text-v2-ink">
      <MediaHeroFade
        media={{ kind: 'image', src: '/images/gateway/card-running.png', alt: 'רצים בקו הזינוק של מרוץ', position: '50% 100%', zoom: 2 }}
        height="clamp(200px,34vh,300px)"
        fadeTo="#f6fbfd"
        topShade={false}
      />

      <div className="relative -mt-[88px] flex flex-col gap-3.5 px-4 pb-2">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
        >
          <span className="inline-flex h-7 items-center gap-[5px] whitespace-nowrap rounded-full bg-white px-2.5 text-[12.5px] font-extrabold text-v2-deep shadow-v2-ring">
            <Check size={14} strokeWidth={3} aria-hidden />
            התוכנית שלך מוכנה
          </span>
          <h1 className="mt-2.5 truncate whitespace-nowrap text-[30px] font-black leading-[1.1] !tracking-[-0.03em]">{title}</h1>
          <p className="mt-1 truncate whitespace-nowrap text-[14px] font-bold text-v2-ink-2">
            {p.weeks} שבועות · עד {p.endDateShort} · {p.frequency} ריצות בשבוע
          </p>
        </motion.div>

        {tiles.map((t, i) => (
          <RevealOnScroll key={t.id} index={i}>
            {t.node}
          </RevealOnScroll>
        ))}
      </div>

      <div className="flex-grow" />

      <StickyActionButton variant="v2" label="בואו נתחיל" onPress={p.onGenerate} />
    </div>
  );
}
