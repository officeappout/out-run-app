'use client';

/**
 * One session of the week builder: the shared WeekSessionPiece (title, detail, new / moved tag)
 * with a drag handle. Dragging starts only from the handle (the page keeps scrolling) and the
 * card always springs back to its slot — the builder re-renders it on its new day when the
 * engine accepts the drop.
 */
import { GripVertical } from 'lucide-react';
import { motion, useDragControls, useReducedMotion } from 'framer-motion';
import { WeekSessionPiece } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';
import type { WbSession } from '../types';
import SessionIcon from './SessionIcon';
import { clientYOf } from './useDayHitTest';

export interface WeekSessionCardProps {
  session: WbSession;
  dow: number;
  /** "1 מתוך 2" on a double day. */
  counterHe?: string | null;
  draggable: boolean;
  onDragMove: (clientY: number | null) => void;
  onDrop: (clientY: number | null) => void;
}

export default function WeekSessionCard({ session: s, dow, counterHe, draggable, onDragMove, onDrop }: WeekSessionCardProps) {
  const t = useT(schedule);
  const controls = useDragControls();
  const reduce = useReducedMotion();
  const tag = s.isNew
    ? { label: t('weekBuilder.tag.new'), tone: 'new' as const }
    : s.homeDow != null && s.homeDow !== dow
      ? { label: t('weekBuilder.tag.moved'), tone: 'moved' as const }
      : null;
  const subtitle = [s.detailHe, counterHe].filter(Boolean).join(' · ') || undefined;

  const handle = draggable ? (
    <button
      type="button"
      aria-label={t('weekBuilder.dragAria', { title: s.titleHe })}
      onPointerDown={(e) => controls.start(e)}
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
      <WeekSessionPiece icon={<SessionIcon s={s} />} title={s.titleHe} subtitle={subtitle} tag={tag} trailing={handle} />
    </motion.div>
  );
}
