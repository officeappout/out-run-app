'use client';

import { useState } from 'react';
import { motion, useReducedMotion, type PanInfo } from 'framer-motion';
import { CalendarSync, Check, ChevronLeft, ChevronRight, GripVertical, Plus } from 'lucide-react';
import { Button, EASE_V2 } from '@/components/ui/v2';
import LabFrame from '../_shared/LabFrame';
import { AppIcon, BackBar, BottomNav, ICON } from '../_app/parts';
import { BrandFlame } from '../_app/brand';
import { DayLetters, StreakRow, type StreakDay } from '../_app/week';
import { PLAN, USER, WEEK } from '../home/fixtures';

const LETTERS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/** October 2026, Sunday-first rows. Demo history: a streak up to today (16th). */
function octoberRows(): StreakDay[][] {
  const first = 4; // 1 Oct 2026 is a Thursday
  const cells: StreakDay[] = [];
  for (let i = 0; i < 35; i++) {
    const n = i - first + 1;
    const inMonth = n >= 1 && n <= 31;
    const date = inMonth ? n : n < 1 ? 30 + n : n - 31;
    let status: StreakDay['status'] = 'rest';
    let kind: StreakDay['kind'] = 'strength';
    if (inMonth && n < 16) {
      const pattern = [n % 7 === 3 ? 'rest' : 'done', 'done', 'done'];
      status = (n === 2 || n === 6 || n === 9 || n === 15 ? 'rest' : n === 7 ? 'missed' : pattern[n % 3]) as StreakDay['status'];
      kind = n % 4 === 1 ? 'steps' : n % 5 === 0 ? 'run' : 'strength';
    }
    if (n === 16) status = 'today';
    if (inMonth && n > 16) {
      status = [18, 20, 22, 24, 25, 27, 29, 31].includes(n) ? 'planned' : 'rest';
      kind = n % 3 === 0 ? 'walk' : 'strength';
    }
    cells.push({ short: '', date, status, kind, muted: !inMonth });
  }
  return Array.from({ length: 5 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
}

function CalendarPanel() {
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const rows = octoberRows();
  const todayRow = rows.findIndex((r) => r.some((d) => d.status === 'today'));
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 15) setExpanded(true);
    if (info.offset.y < -15) setExpanded(false);
  };
  return (
    <div className="relative z-[2] -mt-1 mb-5">
      <motion.div
        layout
        transition={{ duration: reduce ? 0 : 0.35, ease: EASE_V2 }}
        className="overflow-hidden rounded-b-[28px] bg-white px-3 pb-3 pt-2 shadow-v2-card"
      >
        <div className="mb-2 flex items-center justify-between px-1">
          {expanded ? (
            <span className="flex items-center gap-1">
              <button type="button" aria-label="החודש הקודם" className="grid h-8 w-8 place-items-center rounded-full text-v2-muted">
                <ChevronRight size={18} strokeWidth={2.6} />
              </button>
              <span className="text-[16px] font-black">אוקטובר 2026</span>
              <button type="button" aria-label="החודש הבא" className="grid h-8 w-8 place-items-center rounded-full text-v2-muted">
                <ChevronLeft size={18} strokeWidth={2.6} />
              </button>
            </span>
          ) : (
            <span className="text-[15px] font-black">11–17 אוקטובר</span>
          )}
          <span className="flex items-center gap-1 rounded-full bg-v2-tint pe-3 ps-1.5 py-0.5 text-[12.5px] font-extrabold text-v2-deep">
            <BrandFlame size={26} still />
            {USER.streakDays} ימים ברצף
          </span>
        </div>
        <DayLetters days={LETTERS.map((short) => ({ short }))} todayIndex={5} />
        {expanded ? (
          <div className="space-y-2">
            {rows.map((r, i) => (
              <StreakRow key={i} days={r} todayIndex={i === todayRow ? 5 : undefined} showDates cell={38} animateToday={i === todayRow} />
            ))}
          </div>
        ) : (
          <StreakRow
            days={WEEK.map((d) => ({ ...d }))}
            todayIndex={5}
            showDates
            cell={42}
          />
        )}
      </motion.div>
      <motion.button
        type="button"
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.2}
        onDragEnd={onDragEnd}
        onClick={() => setExpanded((v) => !v)}
        aria-label={expanded ? 'כווץ לוח שנה' : 'הרחב לוח שנה'}
        aria-expanded={expanded}
        className="mx-auto mt-2 flex h-6 w-24 cursor-grab touch-none items-center justify-center"
      >
        <span className="h-1.5 w-12 rounded-full bg-v2-pill-border" />
      </motion.button>
    </div>
  );
}

/** The big planner (תכנון אימונים): two weeks, drag to move, + to add. */
export default function ScheduleLab() {
  return (
    <LabFrame
      panel={
        <div>
          <div className="mb-1 text-[22px] font-black tracking-v2-tight">Design lab · תכנון אימונים</div>
          <p className="text-[14px] leading-relaxed text-v2-ink-2">
            כמו היום: לוח שנפתח משבוע לחודש (לחיצה או גרירה על הידית), עם הרצף המחובר. מתחת — רשימת הימים. נתוני דמו בלבד.
          </p>
        </div>
      }
    >
      <div className="h-full overflow-y-auto overscroll-contain pb-32">
        <BackBar
          title="תכנון אימונים"
          end={
            <button type="button" aria-label="סנכרון ליומן" className="grid h-11 w-11 place-items-center rounded-full bg-white text-v2-deep shadow-v2-ring">
              <CalendarSync size={18} strokeWidth={2.4} />
            </button>
          }
        />
        <CalendarPanel />
        <div className="space-y-5 px-4">
          {PLAN.map((week, wi) => (
            <section key={week.range} aria-label={week.range}>
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 className="text-[16px] font-black">{week.range}</h2>
                <span className="text-[12.5px] font-bold text-v2-muted">
                  {week.days.filter((d) => d.items.length).length} אימונים{wi === 0 ? ' · השבוע' : ''}
                </span>
              </div>
              <ol className="overflow-hidden rounded-v2-card bg-white shadow-v2-card">
                {week.days.map((d, i) => {
                  const today = 'today' in d && d.today;
                  return (
                    <li
                      key={d.n}
                      className={`flex min-h-[64px] items-center gap-3 px-3 py-2 ${i ? 'border-t border-v2-hairline' : ''} ${today ? 'bg-v2-tint/60' : ''}`}
                    >
                      <span className="w-10 shrink-0 text-center">
                        <span className={`block text-[12px] font-extrabold ${today ? 'text-v2-deep' : 'text-v2-muted'}`}>{d.d}</span>
                        <span
                          className={`mx-auto mt-0.5 grid h-8 w-8 place-items-center rounded-full text-[16px] font-black tabular-nums ${
                            today ? 'bg-v2-cta text-v2-on-cta' : ''
                          }`}
                        >
                          {d.n}
                        </span>
                      </span>
                      <span className="h-9 w-px bg-v2-hairline" />
                      <span className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                        {d.items.length ? (
                          d.items.map((it) => (
                            <span
                              key={it}
                              className={`flex h-10 items-center gap-2 rounded-[14px] pe-3 ps-2 text-[14px] font-extrabold ${
                                d.done ? 'bg-v2-surface text-v2-ink-2 ring-1 ring-inset ring-v2-hairline' : 'bg-white text-v2-ink shadow-v2-ring'
                              }`}
                            >
                              {!d.done && <GripVertical size={15} strokeWidth={2.4} className="text-v2-muted/60" aria-hidden />}
                              <AppIcon src={it.includes('הליכה') || it.includes('צעדים') ? ICON.walk : it.includes('ריצה') ? ICON.run : ICON.strength} size={20} />
                              {it}
                              {d.done && (
                                <span className="grid h-5 w-5 place-items-center rounded-full bg-v2-cta text-v2-on-cta">
                                  <Check size={12} strokeWidth={3.2} aria-label="בוצע" />
                                </span>
                              )}
                            </span>
                          ))
                        ) : (
                          <span className="text-[13.5px] font-bold text-v2-muted/80">
                            מנוחה <span className="italic">z<sup className="text-[9px]">z</sup></span>
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        aria-label={`הוספת אימון ביום ${d.d}`}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-v2-deep ring-1 ring-inset ring-v2-pill-border transition-transform duration-150 ease-v2 active:scale-[0.97]"
                      >
                        <Plus size={16} strokeWidth={2.6} />
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          <Button variant="primary" size="lg" block>
            שמירת הלו״ז
          </Button>
        </div>
      </div>
      <BottomNav active="home" />
    </LabFrame>
  );
}
