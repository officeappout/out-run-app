'use client';

import { CalendarSync, Check, GripVertical, Plus } from 'lucide-react';
import { Button } from '@/components/ui/v2';
import LabFrame from '../_shared/LabFrame';
import { AppIcon, BackBar, BottomNav, ICON } from '../_app/parts';
import { PLAN } from '../home/fixtures';

/** The big planner (תכנון אימונים): two weeks, drag to move, + to add. */
export default function ScheduleLab() {
  return (
    <LabFrame
      panel={
        <div>
          <div className="mb-1 text-[22px] font-black tracking-v2-tight">Design lab · תכנון אימונים</div>
          <p className="text-[14px] leading-relaxed text-v2-ink-2">
            אותו מבנה כמו היום: רצועת שבוע ורשימת ימים. אימון שבוצע מסומן ב־✓ ולא בקו חוצה, ימי מנוחה שקטים. נתוני דמו בלבד.
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
                              <AppIcon src={it.includes('הליכה') ? ICON.walk : it.includes('ריצה') ? ICON.run : ICON.strength} size={20} />
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
