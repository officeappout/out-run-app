'use client';

/**
 * P-7 · התמדה — which days counted toward the streak and why. One row per
 * day (the shared WeekDayRow: day letter + date), the day's flame in the
 * colours of what counted (the app's Lottie StreakFlame, same as the strip),
 * and a reason chip per cause: כוח / ריצה / הליכה / יעד צעדים / התאוששות.
 * A day that didn't count says what was missing. Rule = streak-rules.ts.
 */
import { useState, type ReactNode } from 'react';
import { Activity, Info, Leaf } from 'lucide-react';
import { Card, StreakFlame, WeekDayRow } from '@/components/ui/v2';
import { sortTones } from '@/components/ui/v2/streak';
import { STREAK_MINIMUM_MINUTES } from '@/features/activity/types/activity.types';
import { missedLine, reasonCounts, REASON_LABEL, type ConsistencyDay, type ConsistencyReason } from '../utils/consistency-days';
import { KindGlyph } from './KindIcon';

const HEB_DAY = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const COLLAPSED = 7;

const TONE: Record<ConsistencyReason, { bg: string; fg: string }> = {
  strength: { bg: 'rgba(0,186,247,0.12)', fg: '#0284c7' },
  run: { bg: 'rgba(132,204,22,0.14)', fg: '#65a30d' },
  walk: { bg: 'rgba(245,158,11,0.14)', fg: '#b45309' },
  steps: { bg: 'rgba(245,158,11,0.14)', fg: '#b45309' },
  recovery: { bg: 'rgba(168,85,247,0.12)', fg: '#7e22ce' },
  active: { bg: 'rgba(132,204,22,0.14)', fg: '#65a30d' },
};

function ReasonGlyph({ reason }: { reason: ConsistencyReason }) {
  const c = 'h-3.5 w-3.5 shrink-0';
  if (reason === 'recovery') return <Leaf className={c} strokeWidth={2.4} aria-hidden />;
  if (reason === 'active') return <Activity className={c} strokeWidth={2.4} aria-hidden />;
  return <KindGlyph kind={reason} className={c} />;
}

function ReasonChip({ reason, children }: { reason: ConsistencyReason; children: ReactNode }) {
  return (
    <span
      className="inline-flex h-[26px] items-center gap-1 whitespace-nowrap rounded-full px-2.5 text-[12px] font-extrabold"
      style={{ background: TONE[reason].bg, color: TONE[reason].fg }}
    >
      <ReasonGlyph reason={reason} />
      {children}
    </span>
  );
}

export interface ConsistencyCardProps {
  /** Newest first (consistencyDays). */
  days: ConsistencyDay[];
  currentStreak: number;
  longestStreak: number;
}

export default function ConsistencyCard({ days, currentStreak, longestStreak }: ConsistencyCardProps) {
  const [all, setAll] = useState(false);
  const counted = days.filter((d) => d.counted);
  const headTones = sortTones(counted.slice(0, 7).flatMap((d) => d.tones));
  const counts = reasonCounts(days);
  const shown = all ? days : days.slice(0, COLLAPSED);

  return (
    <Card padding="none" className="pb-1.5 pt-3.5">
      <div className="flex items-center gap-2.5 px-3.5">
        {headTones.length > 0 ? <StreakFlame tones={headTones} size={40} /> : null}
        <div className="min-w-0 flex-1">
          <h2 className="whitespace-nowrap text-[17px] font-black text-v2-ink">
            התמדה{currentStreak > 0 ? ` · רצף ${currentStreak} ימים` : ''}
          </h2>
          <p className="truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">
            {longestStreak > 1 ? `השיא שלך ${longestStreak} ימים · ` : ''}
            {counted.length} מתוך {days.length} הימים נספרו
          </p>
        </div>
      </div>

      <div className="mx-3.5 mt-2.5 flex items-start gap-2 rounded-[14px] bg-v2-surface p-2.5 ring-1 ring-inset ring-v2-hairline">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-v2-muted" aria-hidden />
        <p className="text-[12px] font-bold leading-snug text-v2-ink-2">
          יום נספר לרצף כשיש לפחות {STREAK_MINIMUM_MINUTES} דק׳ פעילות (כוח, ריצה, הליכה, התאוששות) או כשהגעת ליעד הצעדים היומי.
        </p>
      </div>

      {counts.length > 0 && (
        <div className="mx-3.5 mt-2.5 flex gap-1">
          {counts.map((c) => (
            <span
              key={c.reason}
              className="flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-[14px] py-2"
              style={{ background: TONE[c.reason].bg }}
            >
              <span className="text-[18px] font-black leading-none tabular-nums text-v2-ink">{c.count}</span>
              <span className="inline-flex max-w-full items-center gap-0.5 truncate whitespace-nowrap text-[11px] font-extrabold" style={{ color: TONE[c.reason].fg }}>
                <ReasonGlyph reason={c.reason} />
                {REASON_LABEL[c.reason]}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-1.5">
        {shown.map((d, i) => (
          <div key={d.iso} className={d.isToday ? 'rounded-[14px] bg-v2-tint' : ''}>
            <WeekDayRow letter={HEB_DAY[d.weekday]} date={d.dayOfMonth} muted={!d.counted} divider={i > 0 && !d.isToday}>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-1.5">
                    {d.counted ? (
                      d.reasons.map((r) => (
                        <ReasonChip key={r.reason} reason={r.reason}>
                          {r.text}
                        </ReasonChip>
                      ))
                    ) : (
                      <span className="inline-flex h-[26px] items-center whitespace-nowrap rounded-full bg-v2-surface px-2.5 text-[12px] font-extrabold text-v2-muted">
                        {d.isToday ? 'עוד לא נספר' : 'לא נספר'}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">
                    {d.counted ? `${d.minutes} דק׳ פעילות${d.isToday ? ' · היום' : ''}` : missedLine(d)}
                  </p>
                </div>
                <span className="grid h-[30px] w-[30px] shrink-0 place-items-center">
                  {d.counted ? <StreakFlame tones={d.tones} size={30} live={d.isToday} /> : <span className="h-2 w-2 rounded-full bg-v2-hairline" />}
                </span>
              </div>
            </WeekDayRow>
          </div>
        ))}
      </div>

      {days.length > COLLAPSED && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mx-auto mb-1.5 mt-1 flex h-9 items-center whitespace-nowrap rounded-full bg-white px-4 text-[13px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          {all ? 'הצג פחות' : `הצג את כל ${days.length} הימים`}
        </button>
      )}
    </Card>
  );
}
