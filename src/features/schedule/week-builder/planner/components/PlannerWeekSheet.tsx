'use client';

/**
 * "סידור השבוע" (enable_week_builder_v1, phase 2) — the week builder over the big schedule,
 * for ONE dated week. Full screen, portalled over the planner. Past days are locked (only
 * "בוצע" shows — nothing is ever tagged as missed), today and later are editable; runs move
 * inside the current week; mode 'replan' opens with the engine's calm suggestion for the rest
 * of the week. Nothing is written until "אישור השבוע" and the save
 * scope ("רק השבוע" / "מעכשיו והלאה").
 */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import ErrorBoundary from '@/components/ErrorBoundary';
import ConfirmSheet from '@/components/ui/v2/ConfirmSheet';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';
import WeekBuilder from '../../components/WeekBuilder';
import { kellyWeekAction } from '@/features/ai-coach/components/KellyWeekChip';
import { plannerMoves, recurringMoves, type PlannerSaveScope } from '../plannerSave.plan';
import { savePlannerWeek } from '../savePlannerWeek';
import { applyPlannedMoves, type WbPlannedMove } from '../../applyMoves';
import TellKellyRow from './TellKellyRow';
import { settleStatus, type PlannerWbData, type PlannerWeek } from '../plannerWeek';
import { replanMissed } from '../replanMissed';
import { createPlannerEngine } from '../runMoveRules';
import { usePlannerWeek } from '../usePlannerWeek';
import { weekRangeHe } from '../weekRange';

export type PlannerWeekMode = 'arrange' | 'replan';

export interface PlannerWeekSheetProps {
  userId: string;
  /** The week's Sunday ('YYYY-MM-DD'); null = closed. */
  sunday: string | null;
  mode: PlannerWeekMode;
  onClose: () => void;
  onSaved: () => void;
  /** Planner v2: moves to apply on open (Kelly's proposal from the planner header). */
  initialMoves?: readonly WbPlannedMove[] | null;
  /** Planner v2: Kelly as the "או לספר לקלי מה השתנה" row above the days, not the header chip. */
  tellKellyRow?: boolean;
}

export default function PlannerWeekSheet({ userId, sunday, mode, onClose, onSaved, initialMoves = null, tellKellyRow = false }: PlannerWeekSheetProps) {
  const t = useT(schedule);
  const state = usePlannerWeek(userId, sunday);
  const [week, setWeek] = useState<PlannerWeek | null>(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const model = state.status === 'ready' ? state.model : null;
  useEffect(() => {
    if (!model) {
      setWeek(null);
      return;
    }
    const base = mode === 'replan' ? replanMissed(model.week, model.rules).week : model.week;
    // Kelly's proposal from the planner (v2): its moves land on the week on screen, each
    // validated like a drag; nothing is saved until "אישור השבוע".
    const seeded = initialMoves?.length
      ? applyPlannedMoves(base, initialMoves, createPlannerEngine<PlannerWbData>(model.rules, { normalize: settleStatus })).week
      : base;
    setWeek(seeded);
    setError(null);
    // initialMoves is read once per opened week.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, mode]);

  const engine = useMemo(() => (model ? createPlannerEngine<PlannerWbData>(model.rules, { normalize: settleStatus }) : null), [model]);
  const moves = useMemo(() => (week ? plannerMoves(week, state.keys, state.todayKey) : []), [week, state.keys, state.todayKey]);
  const canForward = recurringMoves(moves).length > 0;

  if (!sunday || !mounted) return null;
  const range = weekRangeHe(state.keys);

  const save = async (scope: PlannerSaveScope) => {
    if (!week) return;
    setScopeOpen(false);
    setSaving(true);
    setError(null);
    const ok = await savePlannerWeek(userId, week, state.keys, state.todayKey, scope);
    setSaving(false);
    if (!ok) {
      setError(t('planner.saveError'));
      return;
    }
    onSaved();
    onClose();
  };

  const closeButton = (
    <button
      type="button"
      onClick={onClose}
      aria-label={t('planner.close')}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-v2-ink shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
    >
      <X size={16} strokeWidth={2.5} aria-hidden />
    </button>
  );

  const body =
    week && engine && model ? (
      <WeekBuilder<PlannerWbData>
        title={t('planner.title')}
        subtitle={t(mode === 'replan' ? 'planner.replanSubtitle' : 'planner.subtitle', { range })}
        week={week}
        engine={engine}
        onChange={setWeek}
        dates={model.dates}
        headerAction={(w, ctl) =>
          tellKellyRow ? (
            closeButton
          ) : (
            <div className="flex shrink-0 items-center gap-2">
              {kellyWeekAction(w, ctl)}
              {closeButton}
            </div>
          )
        }
        lead={tellKellyRow ? (w, ctl) => kellyWeekAction(w, ctl, (open) => <TellKellyRow onPress={open} />) : undefined}
        error={error}
        confirmDisabled={saving}
        onConfirm={() => (moves.length === 0 ? onClose() : setScopeOpen(true))}
      />
    ) : (
      <div dir="rtl" className="mx-auto flex w-full max-w-md flex-1 flex-col px-4">
        <div className="flex items-center justify-between py-2">
          <h1 className="text-[24px] font-black text-v2-ink">{t('planner.title')}</h1>
          {closeButton}
        </div>
        <p role="status" className="mt-6 text-center text-[14px] font-bold text-v2-muted">
          {state.status === 'error' ? t('planner.error') : t('planner.loading')}
        </p>
      </div>
    );

  return createPortal(
    <div
      className="fixed inset-0 flex flex-col overflow-y-auto bg-v2-surface"
      style={{ zIndex: SHEET_Z.nestedModal, paddingTop: 'max(1rem, env(safe-area-inset-top, 24px))' }}
    >
      <ErrorBoundary fallback={null}>{body}</ErrorBoundary>
      <ConfirmSheet
        open={scopeOpen}
        onClose={() => setScopeOpen(false)}
        title={t('planner.scope.title')}
        description={canForward ? t('planner.scope.description') : t('planner.scope.weekOnlyNote')}
        actions={[
          { label: t('planner.scope.onlyWeek'), tone: 'cta', onClick: () => void save('week') },
          ...(canForward ? [{ label: t('planner.scope.forward'), tone: 'secondary' as const, onClick: () => void save('forward') }] : []),
          { label: t('planner.scope.cancel'), tone: 'ghost', onClick: () => setScopeOpen(false) },
        ]}
        zIndex={SHEET_Z.agendaDeletePanel}
        backdropZIndex={SHEET_Z.agendaDelete}
      />
    </div>,
    document.body,
  );
}
