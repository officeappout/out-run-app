'use client';

/**
 * One session on a planner v2 day row (enable_week_builder_v1): the shared WeekSessionPiece
 * (icon, title, "07:30 · detail", done / long tag) with the week builder's drag handle on a
 * session that can still move. Drag starts only from the handle and the card springs back;
 * the row re-renders on its new day when the engine accepts the drop. Tap → onOpen.
 */
import { GripVertical } from 'lucide-react';
import { motion, useDragControls, useReducedMotion } from 'framer-motion';
import { WeekSessionPiece } from '@/components/ui/v2';
import SessionIcon from '@/features/schedule/week-builder/components/SessionIcon';
import { clientYOf } from '@/features/schedule/week-builder/components/useDayHitTest';
import type { PlannerWbData } from '@/features/schedule/week-builder/planner/plannerWeek';
import type { WbSession } from '@/features/schedule/week-builder/types';
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';
import { useShownPlannedTime } from '../hooks/useShownPlannedTime';

export interface PlannerSessionRowProps {
  session: WbSession<PlannerWbData>;
  draggable: boolean;
  onDragMove: (clientY: number | null) => void;
  onDrop: (clientY: number | null) => void;
  onOpen?: () => void;
}

export default function PlannerSessionRow({ session: s, draggable, onDragMove, onDrop, onOpen }: PlannerSessionRowProps) {
  const t = useT(home);
  const controls = useDragControls();
  const reduce = useReducedMotion();
  const tag =
    s.status === 'done'
      ? { label: t('plannerV2.tag.done'), tone: 'done' as const }
      : s.slot === 'long_run' || s.long
        ? { label: t('plannerV2.tag.long'), tone: 'new' as const }
        : null;
  const shownTime = useShownPlannedTime();
  const subtitle = [shownTime(s.data?.startTime), s.detailHe].filter(Boolean).join(' · ') || undefined;
  const handle = draggable ? (
    <button
      type="button"
      aria-label={t('plannerV2.dragAria', { title: s.titleHe })}
      onPointerDown={(e) => {
        e.stopPropagation();
        controls.start(e);
      }}
      onClick={(e) => e.stopPropagation()}
      style={{ touchAction: 'none' }}
      className="-me-1 grid h-10 w-8 shrink-0 cursor-grab place-items-center rounded-[10px] text-v2-muted active:cursor-grabbing"
    >
      <GripVertical size={18} strokeWidth={2.2} aria-hidden />
    </button>
  ) : null;

  return (
    <motion.div
      drag={draggable ? 'y' : false}
      dragControls={controls}
      dragListener={false}
      dragSnapToOrigin
      dragElastic={0.6}
      dragMomentum={false}
      whileDrag={reduce ? { zIndex: 30 } : { scale: 1.03, zIndex: 30, boxShadow: '0 18px 40px -18px rgba(9,30,50,0.45)' }}
      onDrag={(e) => onDragMove(clientYOf(e))}
      onDragEnd={(e: MouseEvent | TouchEvent | PointerEvent) => onDrop(clientYOf(e))}
      className="relative rounded-[14px]"
    >
      <div
        role={onOpen ? 'button' : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onClick={onOpen}
        onKeyDown={onOpen ? (e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onOpen()) : undefined}
        className={onOpen ? 'cursor-pointer rounded-[14px] transition-transform duration-150 ease-v2 active:scale-[0.99]' : undefined}
      >
        <WeekSessionPiece icon={<SessionIcon s={s} />} title={s.titleHe} subtitle={subtitle} tag={tag} trailing={handle} />
      </div>
    </motion.div>
  );
}
