'use client';

/**
 * Tap a day in the planner v2 (enable_week_builder_v1) → this drawer: the day's rings in the
 * Progress tab's language (SegmentedRing of minutes by track + each track's minutes, steps vs
 * the user's goal), the workouts done (tap → that workout's summary) and the sessions still
 * planned (tap → time / move), and "לכל ההתקדמות" → the Progress tab (it takes no day param).
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, ChevronLeft, Dumbbell, Footprints, type LucideIcon } from 'lucide-react';
import Sheet from '@/components/ui/v2/Sheet';
import IconTile, { type IconTileTone } from '@/components/ui/v2/IconTile';
import SegmentedRing from '@/components/ui/v2/SegmentedRing';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { TRACK_COLORS } from '@/components/ui/v2/track-colors';
import SessionIcon from '@/features/schedule/week-builder/components/SessionIcon';
import type { PlannerWbData } from '@/features/schedule/week-builder/planner/plannerWeek';
import type { WbSession } from '@/features/schedule/week-builder/types';
import type { ProgressDay, ProgressWorkout } from '@/features/progression-hub/v2/utils/progress-model';
import { formatDate, formatNumber } from '@/lib/i18n/core/fmt';
import { useLocaleStore } from '@/store/useLocaleStore';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import { buildDayDrawer, type DayDrawerDone } from '../lib/dayDrawer';
import { buildDayRings, dayMinutesByTrack } from '../lib/dayRings';

export interface PlannerDayDrawerProps {
  /** null = closed. */
  iso: string | null;
  todayKey: string;
  workouts: readonly ProgressWorkout[];
  day: ProgressDay | undefined;
  stepGoal: number;
  /** The day's sessions from the planner week (empty while that week loads). */
  sessions: ReadonlyArray<WbSession<PlannerWbData>>;
  onClose: () => void;
  onOpenWorkout: (iso: string) => void;
  onOpenSession: (session: WbSession<PlannerWbData>, iso: string) => void;
}

const KIND_TILE: Record<DayDrawerDone['kinds'][number], { icon: LucideIcon; tone: IconTileTone }> = {
  strength: { icon: Dumbbell, tone: 'accent' },
  run: { icon: Footprints, tone: 'run' },
  walk: { icon: Footprints, tone: 'steps' },
  other: { icon: Activity, tone: 'neutral' },
};

export default function PlannerDayDrawer(p: PlannerDayDrawerProps) {
  const t = useT(home);
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const model = useMemo(() => {
    if (!p.iso) return null;
    const rings = buildDayRings({ minutes: dayMinutesByTrack(p.workouts, p.day), steps: p.day?.steps ?? 0, stepGoal: p.stepGoal });
    return buildDayDrawer({ iso: p.iso, todayKey: p.todayKey, rings, workouts: p.workouts, sessions: p.sessions });
  }, [p.iso, p.todayKey, p.workouts, p.day, p.stepGoal, p.sessions]);

  const title = p.iso ? formatDate(new Date(`${p.iso}T00:00:00`), locale, { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  const sessionById = (id: string) => p.sessions.find((s) => s.id === id);

  return (
    <Sheet open={!!model} onClose={p.onClose} title={title} zIndex={SHEET_Z.nestedModal} backdropZIndex={SHEET_Z.adjusterBackdrop} closeLabel={t('plannerV2.close')}>
      {model && (
        <div dir="rtl" className="flex flex-col gap-5 px-5 pb-2">
          {/* Rings */}
          <div className="flex items-center gap-4 rounded-[22px] bg-white p-4 shadow-v2-card">
            <SegmentedRing segments={model.rings.segments} size={112} stroke={12} gap={4} label={t('plannerV2.day.ringAria', { minutes: `${model.rings.totalMinutes}`, goal: `${model.rings.minutesGoal}` })}>
              <span className="text-[24px] font-black leading-none tabular-nums text-v2-ink">{model.rings.totalMinutes}</span>
              <span className="mt-0.5 text-[11.5px] font-bold text-v2-muted">{t('plannerV2.day.minutesOf', { goal: `${model.rings.minutesGoal}` })}</span>
            </SegmentedRing>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {model.tracks.map((tr) => (
                <p key={tr.key} className="flex items-center gap-2 text-[13.5px] font-bold text-v2-ink">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tr.color }} />
                  <span className="flex-1 truncate">{t(`plannerV2.track.${tr.key}`)}</span>
                  <span className="tabular-nums text-v2-muted">{t('plannerV2.day.minutes', { n: `${tr.minutes}` })}</span>
                </p>
              ))}
              <div className="mt-1">
                <p className="flex items-center justify-between text-[13px] font-bold text-v2-ink">
                  <span>{t('plannerV2.day.steps')}</span>
                  <span className="tabular-nums text-v2-muted">
                    {formatNumber(model.rings.steps, locale)} / {formatNumber(model.rings.stepGoal, locale)}
                  </span>
                </p>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#fdf1dc]" aria-hidden>
                  <div className="h-full rounded-full" style={{ width: `${Math.round(model.rings.stepsPct * 100)}%`, background: TRACK_COLORS.walk }} />
                </div>
              </div>
            </div>
          </div>

          {/* Done */}
          {model.done.length > 0 && (
            <div>
              <h3 className="mb-2 text-[15px] font-extrabold text-v2-ink">{t('plannerV2.day.done')}</h3>
              <div className="flex flex-col gap-2">
                {model.done.map((d) => {
                  const tile = KIND_TILE[d.kinds[0]];
                  return (
                    <button
                      key={d.workoutId}
                      type="button"
                      onClick={() => p.onOpenWorkout(model.iso)}
                      className="flex min-h-[56px] items-center gap-2.5 rounded-[14px] bg-v2-surface px-2.5 py-2 text-start transition-transform duration-150 ease-v2 active:scale-[0.99]"
                    >
                      <IconTile icon={tile.icon} tone={tile.tone} size="sm" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[15px] font-extrabold text-v2-ink">{d.title ?? d.kinds.map((k) => t(`plannerV2.kind.${k}`)).join(' + ')}</span>
                        <span className="truncate text-[12px] font-bold text-v2-muted">
                          {d.km > 0 ? t('plannerV2.day.minutesKm', { n: `${d.minutes}`, km: formatNumber(d.km, locale) }) : t('plannerV2.day.minutes', { n: `${d.minutes}` })}
                        </span>
                      </span>
                      <ChevronLeft size={18} strokeWidth={2.2} className="shrink-0 text-v2-muted" aria-hidden />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Planned */}
          {model.planned.length > 0 && (
            <div>
              <h3 className="mb-2 text-[15px] font-extrabold text-v2-ink">{model.isPast ? t('plannerV2.day.missed') : t('plannerV2.day.planned')}</h3>
              <div className="flex flex-col gap-2">
                {model.planned.map((s) => {
                  const session = sessionById(s.sessionId);
                  return (
                    <button
                      key={s.sessionId}
                      type="button"
                      disabled={!session}
                      onClick={() => session && p.onOpenSession(session, model.iso)}
                      className="flex min-h-[56px] items-center gap-2.5 rounded-[14px] bg-v2-surface px-2.5 py-2 text-start transition-transform duration-150 ease-v2 active:scale-[0.99]"
                    >
                      {session && <SessionIcon s={session} />}
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-[15px] font-extrabold text-v2-ink">{s.titleHe}</span>
                        <span className="truncate text-[12px] font-bold text-v2-muted">{[s.time, s.detailHe].filter(Boolean).join(' · ')}</span>
                      </span>
                      {(s.timeEditable || s.movable) && <ChevronLeft size={18} strokeWidth={2.2} className="shrink-0 text-v2-muted" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {model.done.length === 0 && model.planned.length === 0 && (
            <p className="rounded-[14px] bg-v2-surface px-3.5 py-3 text-center text-[14px] font-bold text-v2-muted">{t('plannerV2.day.empty')}</p>
          )}

          <button
            type="button"
            onClick={() => {
              p.onClose();
              router.push('/progression');
            }}
            className="mx-auto inline-flex items-center gap-1 text-[14px] font-extrabold text-v2-deep underline underline-offset-4"
          >
            {t('plannerV2.day.allProgress')}
            <ChevronLeft size={16} strokeWidth={2.4} aria-hidden />
          </button>
        </div>
      )}
    </Sheet>
  );
}
