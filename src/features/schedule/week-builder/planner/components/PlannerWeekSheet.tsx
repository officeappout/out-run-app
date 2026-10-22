'use client';

/**
 * "סידור השבוע" (enable_week_builder_v1, phase 2) — the week builder over the big schedule,
 * for ONE dated week. Full screen, portalled over the planner. Past days are locked (done /
 * missed shown), today and later are editable; mode 'replan' opens with the engine's
 * suggestion for the missed sessions. Nothing is written until "אישור השבוע" and the save
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
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import { isStrengthTemplateId } from '../../../engine/strengthVocabulary';
import WeekBuilder from '../../components/WeekBuilder';
import { kellyWeekAction } from '@/features/ai-coach/components/KellyWeekChip';
import { createWeekEngine } from '../../moveSession';
import { planPlannerSave, plannerMoves, recurringMoves, type PlannerSaveScope } from '../plannerSave.plan';
import { executePlannerSave } from '../plannerSave.service';
import { settleStatus, type PlannerWbData, type PlannerWeek } from '../plannerWeek';
import { replanMissed } from '../replanMissed';
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
}

export default function PlannerWeekSheet({ userId, sunday, mode, onClose, onSaved }: PlannerWeekSheetProps) {
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
    setWeek(mode === 'replan' ? replanMissed(model.week, model.rules).week : model.week);
    setError(null);
  }, [model, mode]);

  const engine = useMemo(() => (model ? createWeekEngine<PlannerWbData>(model.rules, { normalize: settleStatus }) : null), [model]);
  const moves = useMemo(() => (week ? plannerMoves(week, state.keys, state.todayKey) : []), [week, state.keys, state.todayKey]);
  const canForward = recurringMoves(moves).length > 0;

  if (!sunday || !mounted) return null;
  const range = weekRangeHe(state.keys);

  const save = async (scope: PlannerSaveScope) => {
    if (!week) return;
    setScopeOpen(false);
    setSaving(true);
    setError(null);
    const lifestyle = (useUserStore.getState().profile as { lifestyle?: { recurringTemplate?: Record<string, string[]>; scheduleDays?: string[] } } | null)?.lifestyle;
    const template = lifestyle?.recurringTemplate ?? {};
    const plan = planPlannerSave(week, state.keys, state.todayKey, scope, {
      recurringTemplate: template,
      scheduleDays: lifestyle?.scheduleDays ?? [],
      isStrengthId: (id) => isStrengthTemplateId(id, resolveToSlug),
    });
    const res = await executePlannerSave(userId, plan, template);
    setSaving(false);
    if (!res.ok) {
      setError(t('planner.saveError'));
      return;
    }
    if (plan.template) useUserStore.getState().refreshProfile().catch(() => {});
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
        headerAction={(w, ctl) => (
          <div className="flex shrink-0 items-center gap-2">
            {kellyWeekAction(w, ctl)}
            {closeButton}
          </div>
        )}
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
