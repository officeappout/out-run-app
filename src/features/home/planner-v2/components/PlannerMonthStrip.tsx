'use client';

/**
 * The planner's month strip (enable_week_builder_v1; board PL2-planner) — months top to bottom
 * in one vertical scroll, a week per row: icons (flames / planned tiles / Zz + streak capsule)
 * or two rings per day. Opens on today's row. Tap a day → onDayTap.
 */
import { useEffect, useRef } from 'react';
import { HEBREW_DAYS } from '@/features/user/scheduling/utils/dateUtils';
import { formatDate, formatNumber } from '@/lib/i18n/core/fmt';
import { useLocaleStore } from '@/store/useLocaleStore';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import { TRACK_COLORS } from '@/components/ui/v2/track-colors';
import { ACTIVITY_RING_DAILY_GOAL } from '@/features/home/utils/activity-ring.utils';
import type { PlannerDayCell, PlannerMonthSection } from '../lib/monthCells';
import PlannerDayIcon from './PlannerDayIcon';
import PlannerDayRings from './PlannerDayRings';

export type PlannerView = 'icons' | 'rings';

export interface PlannerMonthStripProps {
  sections: PlannerMonthSection[];
  view: PlannerView;
  /** The selected day (its number gets a soft circle). */
  selectedIso: string | null;
  stepGoal: number;
  onDayTap: (iso: string) => void;
}

const ROW_H = 62;
const STRIP_H = 330;

function DayCell({ cell, view, selected, onTap }: { cell: PlannerDayCell; view: PlannerView; selected: boolean; onTap: () => void }) {
  const t = useT(home);
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={t('plannerV2.dayAria', { date: `${cell.day}` })}
      aria-current={cell.isToday ? 'date' : undefined}
      className="relative flex flex-col items-center gap-0.5 pt-1 transition-transform duration-150 ease-v2 active:scale-[0.94]"
    >
      <span
        className={`grid h-[18px] min-w-[22px] place-items-center rounded-full px-1 text-[13px] leading-4 tabular-nums ${
          cell.isToday ? 'font-black text-v2-deep' : 'font-bold text-v2-ink'
        } ${selected && !cell.isToday ? 'bg-v2-tint' : ''}`}
      >
        {cell.day}
      </span>
      <span className="grid h-[34px] w-[34px] place-items-center">
        {view === 'rings' ? <PlannerDayRings rings={cell.rings} faded={!cell.isPast && !cell.isToday} /> : <PlannerDayIcon cell={cell} />}
      </span>
    </button>
  );
}

export default function PlannerMonthStrip({ sections, view, selectedIso, stepGoal, onDayTap }: PlannerMonthStripProps) {
  const t = useT(home);
  const locale = useLocaleStore((s) => s.locale);
  const boxRef = useRef<HTMLDivElement>(null);
  const todayRowRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);

  // Open on today's row (once): the box scrolls, never the page.
  useEffect(() => {
    if (scrolled.current || !boxRef.current || !todayRowRef.current) return;
    boxRef.current.scrollTop = Math.max(0, todayRowRef.current.offsetTop - ROW_H);
    scrolled.current = true;
  }, [sections]);

  return (
    <div className="overflow-hidden rounded-[24px] bg-white shadow-v2-card">
      <div className="grid grid-cols-7 border-b border-v2-hairline px-2 pb-1 pt-2.5 text-center text-[11px] font-bold text-v2-muted">
        {HEBREW_DAYS.map((l) => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <div className="relative">
        <div ref={boxRef} className="relative overflow-y-auto overscroll-contain px-2" style={{ height: STRIP_H }}>
          {sections.map((m) => (
            <section key={m.key} aria-label={formatDate(new Date(m.year, m.month, 1), locale, { month: 'long', year: 'numeric' })}>
              <h3 className="px-1.5 pb-1 pt-2.5 text-[14px] font-black text-v2-ink">{formatDate(new Date(m.year, m.month, 1), locale, { month: 'long' })}</h3>
              {m.rows.map((row) => {
                const hasToday = row.cells.some((c) => c?.isToday);
                return (
                  <div key={row.sunday} ref={hasToday ? todayRowRef : undefined} className="relative grid grid-cols-7" style={{ height: ROW_H }}>
                    {view === 'icons' &&
                      row.capsules.map((c) => (
                        <span
                          key={`${c.from}-${c.to}`}
                          aria-hidden
                          className="pointer-events-none absolute rounded-full"
                          style={{
                            insetInlineStart: `${(c.from * 100) / 7}%`,
                            width: `${((c.to - c.from + 1) * 100) / 7}%`,
                            top: 18,
                            height: 40,
                            border: '1px solid transparent',
                            background: c.background,
                          }}
                        />
                      ))}
                    {row.cells.map((cell, i) =>
                      cell ? (
                        <DayCell key={cell.iso} cell={cell} view={view} selected={cell.iso === selectedIso} onTap={() => onDayTap(cell.iso)} />
                      ) : (
                        <span key={`blank-${i}`} aria-hidden />
                      ),
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </div>
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-white/0 to-white" />
      </div>
      {view === 'rings' && (
        <div className="flex justify-center gap-3.5 px-3 pb-3 pt-1 text-[12px] font-bold text-v2-muted">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-1.5 w-3.5 rounded-full"
              style={{ background: `linear-gradient(90deg, ${TRACK_COLORS.strength} 0 33%, ${TRACK_COLORS.run} 33% 66%, ${TRACK_COLORS.walk} 66%)` }}
            />
            {t('plannerV2.legend.minutes', { goal: `${ACTIVITY_RING_DAILY_GOAL}` })}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ border: `2.5px solid ${TRACK_COLORS.walk}` }} />
            {t('plannerV2.legend.steps', { goal: formatNumber(stepGoal, locale) })}
          </span>
        </div>
      )}
    </div>
  );
}
