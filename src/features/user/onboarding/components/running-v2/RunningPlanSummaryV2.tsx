'use client';

/**
 * Running plan summary — owner-approved light premium design
 * (R6-prop-summary + R6-prop-summary-plan, structure only — no first-week
 * preview). enable_home_v2 only; same data and the same onGenerate as the
 * legacy screen, nothing new is saved.
 *
 *  hero race photo → plan headline → "איך התוכנית בנויה" (relative weekly
 *  volume from the template rules, see utils/running-plan-shape.ts) →
 *  "מה יש בתוכנית" → "ימי ריצה" info row (the silent default + one caption
 *  line on where they're chosen; no change button) → one gradient CTA.
 *
 * Lives inside OnboardingLayout's scroll area (flex-1); the CTA is the
 * sticky in-flow StickyActionButton v2.
 */

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { CalendarDays, Check, Footprints, RefreshCcw, Waves, Zap } from 'lucide-react';
import StickyActionButton from '@/components/ui/StickyActionButton';
import {
  buildPlanContentRows,
  buildWeeklyVolumePattern,
  easyPaceRangeLabel,
  isConservativePlan,
  weekLabelsToShow,
  type PlanContentKind,
  type PlanWeekBar,
} from '../../utils/running-plan-shape';

export interface RunningPlanSummaryV2Props {
  answers: Record<string, unknown>;
  distLabel: string;
  weeks: number;
  frequency: number;
  /** User's entered result for the distance ("58:30"), only when given. */
  currentResult: string | null;
  endDateShort: string;
  /** Hebrew day letters, e.g. ['א','ג','ו']. */
  scheduleDays: string[];
  scheduleTime: string | null;
  /** User already trains strength — run days get woven around those days. */
  hasStrengthTrack?: boolean;
  onGenerate: () => void;
}

const BAR_COLOR: Record<PlanWeekBar['kind'], string> = {
  build: '#00baf7',
  recovery: '#bfe3f2',
  goal: '#ffc83d',
};

const ROW_STYLE: Record<PlanContentKind, { bg: string; fg: string; Icon: typeof Footprints }> = {
  easy: { bg: '#eef7df', fg: '#65a30d', Icon: Footprints },
  quality: { bg: '#fff1e6', fg: '#ea580c', Icon: Zap },
  recovery: { bg: '#eef8fc', fg: '#0284c7', Icon: Waves },
  adapt: { bg: '#eef8fc', fg: '#0284c7', Icon: RefreshCcw },
};

function VolumeChart({ bars }: { bars: PlanWeekBar[] }) {
  const labels = weekLabelsToShow(bars.length);
  const gap = bars.length > 20 ? 2 : 4;
  return (
    <div>
      <div className="flex h-[92px] items-end" style={{ gap }} role="img" aria-label={`נפח שבועי יחסי לאורך ${bars.length} שבועות`}>
        {bars.map((b) => (
          <div key={b.week} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
            <div
              className="w-full rounded-[6px]"
              style={{
                height: `${Math.max(8, Math.round(b.relative * 100))}%`,
                background: b.week === 1 && b.kind === 'build' ? '#0284c7' : BAR_COLOR[b.kind],
              }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex" style={{ gap }} aria-hidden>
        {bars.map((b) => (
          <span key={b.week} className="min-w-0 flex-1 text-center text-[11px] font-extrabold tabular-nums text-v2-muted">
            {labels.has(b.week) ? b.week : ''}
          </span>
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] font-extrabold text-v2-muted">
        {([
          ['build', 'בנייה'],
          ['recovery', 'שבוע קל להתאוששות'],
          ['goal', 'שבוע המטרה'],
        ] as const).map(([k, label]) =>
          k === 'recovery' && !bars.some((b) => b.kind === 'recovery') ? null : (
            <span key={k} className="inline-flex items-center gap-[5px] whitespace-nowrap">
              <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: BAR_COLOR[k] }} />
              {label}
            </span>
          ),
        )}
      </div>
    </div>
  );
}

export default function RunningPlanSummaryV2(p: RunningPlanSummaryV2Props) {
  const isFemale =
    typeof window !== 'undefined' && sessionStorage.getItem('onboarding_personal_gender') === 'female';

  const { bars, rows } = useMemo(() => {
    const bars = buildWeeklyVolumePattern(p.weeks, isConservativePlan(p.answers));
    const rows = buildPlanContentRows({
      goalPath: p.answers.goalPath,
      frequency: p.frequency,
      bars,
      easyPaceLabel: easyPaceRangeLabel(p.answers),
    });
    return { bars, rows };
  }, [p.weeks, p.frequency, p.answers]);

  const daysLine = p.scheduleDays.length > 0
    ? [p.scheduleDays.map((d) => `${d}׳`).join(' '), p.scheduleTime].filter(Boolean).join(' · ')
    : null;
  const daysCaption = p.hasStrengthTrack
    ? 'נשלב את הריצות עם ימי הכוח שלך במסך הבית.'
    : 'את הימים והשעה תבחרו במסך הבית, מיד אחרי ההרשמה. התוכנית תתעדכן בלי לאבד התקדמות.';

  return (
    <div dir="rtl" className="relative mx-auto flex w-full max-w-md flex-1 flex-col bg-v2-surface font-simpler text-v2-ink">
      {/* Hero race photo — fades into the page */}
      <div className="relative h-[clamp(180px,30vh,260px)] shrink-0 overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/gateway/card-running.png"
          alt="רצים בקו הזינוק של מרוץ"
          className="h-full w-full object-cover"
          style={{ objectPosition: '50% 100%', transform: 'scale(2)', transformOrigin: '50% 100%' }}
          draggable={false}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(246,251,253,0) 35%, rgba(246,251,253,0.7) 72%, #f6fbfd 100%)' }}
        />
      </div>

      <div className="relative -mt-[72px] flex flex-col gap-3 px-4 pb-2">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
        >
          <span className="inline-flex h-7 items-center gap-[5px] whitespace-nowrap rounded-full bg-white px-2.5 text-[12.5px] font-extrabold text-v2-deep shadow-v2-ring">
            <Check size={14} strokeWidth={3} aria-hidden />
            התוכנית שלך מוכנה
          </span>
          <h1 className="mt-2.5 truncate whitespace-nowrap text-[30px] font-black leading-[1.1] !tracking-[-0.03em]">
            {p.answers.targetDistance === 'maintenance' ? 'תוכנית לשמירה על כושר' : `תוכנית ל-${p.distLabel}`}
          </h1>
          <p className="mt-1 truncate whitespace-nowrap text-[14px] font-bold text-v2-ink-2">
            {p.weeks} שבועות · {p.frequency} ריצות בשבוע · עד {p.endDateShort}
          </p>
          {p.currentResult && (
            <p className="mt-0.5 truncate whitespace-nowrap text-[13px] font-bold text-v2-muted">
              {isFemale ? 'היום את על' : 'היום אתה על'} <span dir="ltr" className="tabular-nums">{p.currentResult}</span> ל-{p.distLabel}
            </p>
          )}
        </motion.div>

        {/* How the plan is built */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.08 }}
          className="rounded-v2-card bg-white px-4 py-3.5 shadow-v2-card"
        >
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="whitespace-nowrap text-[15px] font-black">איך התוכנית בנויה</h2>
            <span className="whitespace-nowrap text-[12px] font-extrabold text-v2-muted">נפח יחסי</span>
          </div>
          <VolumeChart bars={bars} />
        </motion.section>

        {/* What's in the plan */}
        <motion.section
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.14 }}
          className="rounded-v2-card bg-white px-4 pb-1.5 pt-3.5 shadow-v2-card"
        >
          <h2 className="whitespace-nowrap text-[15px] font-black">מה יש בתוכנית</h2>
          {rows.map((r, i) => {
            const st = ROW_STYLE[r.kind];
            return (
              <div key={r.kind} className={`flex items-center gap-3 py-2.5 ${i > 0 ? 'border-t border-v2-hairline' : ''}`}>
                <span className="grid h-[38px] w-[38px] shrink-0 place-items-center rounded-xl" style={{ background: st.bg, color: st.fg }} aria-hidden>
                  <st.Icon size={18} strokeWidth={2.2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate whitespace-nowrap text-[14.5px] font-black">{r.title}</p>
                  <p className="truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">
                    {r.sub.split(/(\d+:\d{2}–\d+:\d{2})/).map((part, j) =>
                      /^\d+:\d{2}–\d+:\d{2}$/.test(part) ? <span key={j} dir="ltr">{part}</span> : <React.Fragment key={j}>{part}</React.Fragment>,
                    )}
                  </p>
                </div>
              </div>
            );
          })}
        </motion.section>

        {/* Run days */}
        {daysLine && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
            <div className="flex items-center gap-2.5 rounded-[18px] bg-white px-3.5 py-3 shadow-v2-ring">
              <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-xl bg-v2-tint text-v2-deep" aria-hidden>
                <CalendarDays size={17} strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[12px] font-extrabold text-v2-deep">ימי ריצה</p>
                <p dir="rtl" className="truncate whitespace-nowrap text-[14.5px] font-black">
                  {daysLine} <span className="text-[12.5px] font-bold text-v2-muted">(ברירת מחדל)</span>
                </p>
              </div>
            </div>
            <p className="mt-1.5 px-1 text-[12px] font-bold leading-snug text-v2-muted">{daysCaption}</p>
          </motion.div>
        )}
      </div>

      <div className="flex-grow" />

      <StickyActionButton
        variant="v2"
        label={isFemale ? 'צרי לי את התוכנית!' : 'צור לי את התוכנית!'}
        onPress={p.onGenerate}
      />
    </div>
  );
}
