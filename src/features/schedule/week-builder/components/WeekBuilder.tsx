'use client';

/**
 * <WeekBuilder> (enable_week_builder_v1; boards S-2c…S-2g) — takes a week + an engine and
 * emits a new week. Reusable: the signup flows (strength / run / walk), add-second-track, and
 * later the home schedule manager mount it with their own adapter.
 *
 * Every edit (a drag, or "move to" in the day sheet) goes through `engine.move`: engine-v2
 * validates it; an invalid drop springs back and a short reason shows under the header.
 * Nothing is saved here — the host writes on "אישור השבוע".
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import ErrorBoundary from '@/components/ErrorBoundary';
import StickyActionButton from '@/components/ui/StickyActionButton';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';
import type { SchedulePriority, TimeWindow } from '../../engine-v2/types';
import { trackCounts, tracksOf, weekChips, type WbTab } from '../summary';
import type { WbMove, WbWeek, WeekBuilderEngine } from '../types';
import DayEditSheet from './DayEditSheet';
import WeekBuilderHeader from './WeekBuilderHeader';
import WeekDayCard from './WeekDayCard';
import WhySheet from './WhySheet';
import { useDayHitTest } from './useDayHitTest';

const NOTICE_MS = 3500;

export interface WeekBuilderProps<P> {
  title: string;
  subtitle: string;
  week: WbWeek<P>;
  engine: WeekBuilderEngine<P>;
  onChange: (week: WbWeek<P>) => void;
  /** Day of month per weekday (display). */
  dates: number[];
  /** Header action slot (the Kelly chip). */
  headerAction?: ReactNode;
  /** Chip labels for the run / walk tracks ("ריצת 10 ק״מ"). */
  chipLabels?: Partial<Record<'run' | 'walk', string>>;
  daysCount?: { value: number; options: number[]; onChange: (n: number) => void } | null;
  /** Two tracks: the engine's conflict priority. */
  priority?: { value: SchedulePriority; onChange: (p: SchedulePriority) => void } | null;
  /** Absent = the time of day isn't editable in this flow. */
  onWindow?: (dow: number, w: TimeWindow) => void;
  /** Under the list, above the "למה?" line (e.g. add-track's "keep it as it was"). */
  extra?: ReactNode;
  error?: string | null;
  confirmLabel?: string;
  confirmDisabled?: boolean;
  onConfirm: () => void | Promise<void>;
}

export default function WeekBuilder<P>(p: WeekBuilderProps<P>) {
  const t = useT(schedule);
  const tracks = useMemo(() => tracksOf(p.week), [p.week]);
  const [tab, setTab] = useState<WbTab>('all');
  const [editDow, setEditDow] = useState<number | null>(null);
  const [whyOpen, setWhyOpen] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { rowRef, dowAt } = useDayHitTest();

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);
  useEffect(() => {
    if (tab !== 'all' && !tracks.includes(tab)) setTab('all');
  }, [tab, tracks]);

  /** One edit through the engine; returns the refusal reason (null = it landed). */
  const tryMove = (move: WbMove): string | null => {
    const r = p.engine.move(p.week, move);
    if (!r.ok) return r.reasonHe;
    if (r.week !== p.week) p.onChange(r.week);
    return null;
  };

  const drop = (sessionId: string, clientY: number | null) => {
    setHover(null);
    const toDow = dowAt(clientY);
    if (toDow == null) return;
    const reason = tryMove({ sessionId, toDow });
    setNotice(reason);
  };

  const counts = trackCounts(p.week);
  const notes = p.week.warningsHe;

  return (
    <div dir="rtl" className="relative mx-auto flex min-h-full w-full max-w-md flex-1 flex-col bg-v2-surface font-simpler text-v2-ink">
      <WeekBuilderHeader
        title={p.title}
        subtitle={p.subtitle}
        action={p.headerAction}
        tracks={tracks.filter((tr) => counts[tr] > 0)}
        tab={tab}
        onTab={setTab}
        priority={p.priority}
        counts={counts}
        daysCount={p.daysCount}
        chips={weekChips(p.week, p.chipLabels)}
      />

      <div className="px-4">
        <p role="status" aria-live="polite" className={notice ? 'mb-2 rounded-[14px] bg-amber-50 px-3.5 py-2.5 text-[13px] font-bold text-amber-800' : 'sr-only'}>
          {notice ? t('weekBuilder.refused', { reason: notice }) : ''}
        </p>

        <div className="rounded-[22px] bg-white shadow-v2-card">
          <ErrorBoundary fallback={null}>
            {p.week.days.map((day) => (
              <WeekDayCard
                key={day.dow}
                day={day as WbWeek['days'][number]}
                date={p.dates[day.dow]}
                tab={tab}
                hovered={hover === day.dow}
                rowRef={rowRef(day.dow)}
                onEdit={() => setEditDow(day.dow)}
                onDragMove={(y) => setHover(dowAt(y))}
                onDrop={drop}
              />
            ))}
          </ErrorBoundary>
        </div>

        {p.extra}

        <div className="mt-3 flex items-start gap-2 rounded-[14px] bg-v2-tint px-3.5 py-2.5 text-[13px] font-bold leading-snug text-v2-ink">
          <Info size={16} strokeWidth={2.2} aria-hidden className="mt-0.5 shrink-0 text-v2-deep" />
          <span className="min-w-0 flex-1">{notes[0] ?? p.week.days.find((d) => d.whyHe)?.whyHe ?? ''}</span>
          <button type="button" onClick={() => setWhyOpen(true)} className="shrink-0 whitespace-nowrap font-extrabold text-v2-deep underline underline-offset-2">
            {t('weekBuilder.why')}
          </button>
        </div>
        {p.error && <p className="mt-3 text-center text-[13px] font-bold text-red-600">{p.error}</p>}
      </div>

      <div className="flex-grow" />
      <StickyActionButton variant="v2" label={p.confirmLabel ?? t('weekBuilder.confirm')} disabled={p.confirmDisabled} onPress={p.onConfirm} />

      <DayEditSheet
        week={p.week as WbWeek}
        dow={editDow}
        dates={p.dates}
        onClose={() => setEditDow(null)}
        onMove={tryMove}
        onWindow={p.onWindow}
      />
      <WhySheet open={whyOpen} onClose={() => setWhyOpen(false)} notesHe={notes} tracks={tracks} />
    </div>
  );
}
