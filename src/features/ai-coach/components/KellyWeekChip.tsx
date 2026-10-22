'use client';

/**
 * "סדר לי במילים" (enable_week_builder_v1) — the week builder's Kelly chip. Shown ONLY when the
 * user has Kelly AI (useAiCoachAccess, the app's one entitlement check for Kelly AI). Opens the
 * Kelly chat over the builder (the builder keeps its state underneath) with the week the user
 * is looking at in the composer — the user's own words, never auto-sent: Kelly advises, then
 * asks whether to update.
 *
 * Builder mode (owner 22.10): every chat request carries the DRAFT week on screen (with the
 * engine's rules), so Kelly's schedule proposal is about THIS week; its card's button applies
 * the moves to the week on screen through the builder (each validated like a drag), closes the
 * chat and highlights the changed days. Nothing is saved: the user still taps "אישור השבוע".
 */
import { useRef, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { coach } from '@/messages/ns/coach';
import { useUserStore } from '@/features/user';
import { useAiCoachAccess } from '../hooks/useAiCoachAccess';
import { useKellyChatConfig } from '../hooks/useKellyChatConfig';
import { weekContextLineHe } from '@/features/schedule/week-builder/weekContext';
import type { WbWeek } from '@/features/schedule/week-builder/types';
import type { WeekBuilderControls } from '@/features/schedule/week-builder/components/WeekBuilder';
import { builderContextOf, type BuilderContext, type BuilderMove } from '@/lib/ai/coach/schedule-proposal/builder-context';
import AiCoachChat from './AiCoachChat';

export interface KellyWeekChipProps {
  /** The week as one line (weekContextLineHe); '' = nothing placed yet. */
  weekLineHe: string;
  /** The draft week on screen as Kelly's builder context; null = advice only (no rules). */
  builderContext?: (() => BuilderContext | null) | null;
  /** Applies a builder proposal's moves to the week on screen. */
  onApplyMoves?: ((moves: BuilderMove[]) => void) | null;
}

interface OverlayProps {
  initialInput: string;
  onClose: () => void;
  builder: { context: () => BuilderContext | null; onApply: (moves: BuilderMove[]) => void } | null;
}

function KellyWeekOverlay({ initialInput, onClose, builder }: OverlayProps) {
  const { profile } = useUserStore();
  const cfg = useKellyChatConfig();
  if (!profile || cfg.loading || !cfg.canUseAi) return null;
  return (
    <AiCoachChat
      profile={profile}
      onClose={onClose}
      unified={cfg.unified}
      phase2={cfg.phase2}
      weatherOn={cfg.weatherOn}
      proactive={cfg.unified && cfg.proactive}
      memory={cfg.memory}
      round4={cfg.round4}
      runsByType={cfg.runsByType}
      initialInput={initialInput}
      builder={builder}
    />
  );
}

export default function KellyWeekChip({ weekLineHe, builderContext = null, onApplyMoves = null }: KellyWeekChipProps) {
  const t = useT(coach);
  const { canUseAi } = useAiCoachAccess();
  const [open, setOpen] = useState<string | null>(null);
  if (!canUseAi) return null;
  const context = weekLineHe ? t('weekChip.context', { week: weekLineHe }) : t('weekChip.contextEmpty');
  const builder =
    builderContext && onApplyMoves
      ? {
          context: builderContext,
          onApply: (moves: BuilderMove[]) => {
            setOpen(null);
            onApplyMoves(moves);
          },
        }
      : null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(context)}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-v2-tint px-3 text-[13px] font-extrabold text-v2-deep ring-1 ring-inset ring-v2-accent/40 transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        <Sparkles size={14} strokeWidth={2.2} aria-hidden />
        {t('weekChip.label')}
      </button>
      {open != null && <KellyWeekOverlay initialInput={open} onClose={() => setOpen(null)} builder={builder} />}
    </>
  );
}

/** Kelly's builder moves → the builder's planned moves (by session id). */
export const plannedMovesOf = (moves: readonly BuilderMove[]) => moves.map((m) => ({ sessionId: m.sessionId, to: m.to }));

function KellyWeekAction<P>({ week, ctl }: { week: WbWeek<P>; ctl?: WeekBuilderControls }) {
  // The latest week on screen, read at each chat request.
  const weekRef = useRef(week);
  weekRef.current = week;
  const rules = ctl?.rules ?? null;
  return (
    <KellyWeekChip
      weekLineHe={weekContextLineHe(week)}
      builderContext={rules ? () => builderContextOf(weekRef.current, rules) : null}
      onApplyMoves={ctl ? (moves) => ctl.apply(plannedMovesOf(moves)) : null}
    />
  );
}

/** The week builder's header action: the chip over the week the user is looking at. */
export function kellyWeekAction<P>(week: WbWeek<P>, ctl?: WeekBuilderControls) {
  return <KellyWeekAction week={week} ctl={ctl} />;
}
