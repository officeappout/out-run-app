'use client';

/**
 * The week's day rows (enable_week_builder_v1; board PL2-planner) — one WeekDayRow per day
 * with its sessions (two on a double day), "מנוחה" when empty. A session that can still move
 * has the week builder's drag handle: the drop goes through the planner engine (the same rules
 * as "סידור השבוע": no past days, run rules, 48h…), then the save-scope sheet ("רק השבוע" /
 * "מעכשיו והלאה") writes it with the sheet's own save (savePlannerWeek). A refused drop springs
 * back with a short reason. Tap a date → onOpenDay; tap a session → onOpenSession.
 */
import { useEffect, useMemo, useState } from 'react';
import { WeekDayRow } from '@/components/ui/v2';
import ConfirmSheet from '@/components/ui/v2/ConfirmSheet';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { HEBREW_DAYS } from '@/features/user/scheduling/utils/dateUtils';
import { useDayHitTest } from '@/features/schedule/week-builder/components/useDayHitTest';
import { plannerMoves, recurringMoves, type PlannerSaveScope } from '@/features/schedule/week-builder/planner/plannerSave.plan';
import { settleStatus, type PlannerWbData, type PlannerWeek, type PlannerWeekModel } from '@/features/schedule/week-builder/planner/plannerWeek';
import { createPlannerEngine } from '@/features/schedule/week-builder/planner/runMoveRules';
import { savePlannerWeek } from '@/features/schedule/week-builder/planner/savePlannerWeek';
import type { WbSession } from '@/features/schedule/week-builder/types';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import PlannerSessionRow from './PlannerSessionRow';

export interface PlannerWeekRowsProps {
  userId: string;
  model: PlannerWeekModel;
  keys: readonly string[];
  todayKey: string;
  onSaved: () => void;
  onOpenDay?: (iso: string) => void;
  onOpenSession?: (session: WbSession<PlannerWbData>, iso: string) => void;
}

const NOTICE_MS = 3500;

export default function PlannerWeekRows({ userId, model, keys, todayKey, onSaved, onOpenDay, onOpenSession }: PlannerWeekRowsProps) {
  const t = useT(home);
  const [week, setWeek] = useState<PlannerWeek>(model.week);
  const [pending, setPending] = useState<PlannerWeek | null>(null);
  const [saving, setSaving] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const { rowRef, dowAt } = useDayHitTest();
  const engine = useMemo(() => createPlannerEngine<PlannerWbData>(model.rules, { normalize: settleStatus }), [model]);

  useEffect(() => setWeek(model.week), [model]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), NOTICE_MS);
    return () => clearTimeout(id);
  }, [notice]);

  const canForward = pending ? recurringMoves(plannerMoves(pending, keys, todayKey)).length > 0 : false;

  const drop = (sessionId: string, fromDow: number, clientY: number | null) => {
    setHover(null);
    const toDow = dowAt(clientY);
    if (toDow == null || toDow === fromDow) return;
    const r = engine.move(week, { sessionId, toDow });
    if (!r.ok) {
      setNotice(t('plannerV2.refused', { reason: r.reasonHe }));
      return;
    }
    if (r.week !== week) setPending(r.week);
  };

  const save = async (scope: PlannerSaveScope) => {
    const next = pending;
    if (!next) return;
    setSaving(true);
    const ok = await savePlannerWeek(userId, next, keys, todayKey, scope);
    setSaving(false);
    setPending(null);
    if (!ok) {
      setNotice(t('plannerV2.saveError'));
      return;
    }
    setWeek(next);
    onSaved();
  };

  return (
    <>
      <p role="status" aria-live="polite" className={notice ? 'mx-4 mb-2 rounded-[14px] bg-amber-50 px-3.5 py-2.5 text-[13px] font-bold text-amber-800' : 'sr-only'}>
        {notice ?? ''}
      </p>
      <div className="mx-4 overflow-hidden rounded-[24px] bg-white shadow-v2-card">
        {week.days.map((day) => {
          const iso = keys[day.dow];
          const isToday = iso === todayKey;
          return (
            <div
              key={day.dow}
              ref={rowRef(day.dow)}
              className={`transition-colors duration-150 ${hover === day.dow ? 'bg-v2-tint' : isToday ? 'bg-v2-tint/60' : ''}`}
            >
              <WeekDayRow
                letter={HEBREW_DAYS[day.dow]}
                date={model.dates[day.dow]}
                muted={day.sessions.length === 0}
                emptyLabel={t('plannerV2.rest')}
                divider={day.dow > 0}
                onDateTap={onOpenDay ? () => onOpenDay(iso) : undefined}
                dateAriaLabel={t('plannerV2.dayAria', { date: `${model.dates[day.dow]}` })}
              >
                {day.sessions.map((s) => (
                  <PlannerSessionRow
                    key={s.id}
                    session={s}
                    draggable={!s.locked && !saving}
                    onDragMove={(y) => setHover(dowAt(y))}
                    onDrop={(y) => drop(s.id, day.dow, y)}
                    onOpen={onOpenSession ? () => onOpenSession(s, iso) : undefined}
                  />
                ))}
              </WeekDayRow>
            </div>
          );
        })}
      </div>
      <ConfirmSheet
        open={pending != null}
        onClose={() => setPending(null)}
        title={t('plannerV2.scope.title')}
        description={canForward ? t('plannerV2.scope.description') : t('plannerV2.scope.weekOnlyNote')}
        actions={[
          { label: t('plannerV2.scope.onlyWeek'), tone: 'cta', onClick: () => void save('week') },
          ...(canForward ? [{ label: t('plannerV2.scope.forward'), tone: 'secondary' as const, onClick: () => void save('forward') }] : []),
          { label: t('plannerV2.scope.cancel'), tone: 'ghost', onClick: () => setPending(null) },
        ]}
        zIndex={SHEET_Z.agendaMove}
        backdropZIndex={SHEET_Z.agendaMoveBackdrop}
      />
    </>
  );
}
