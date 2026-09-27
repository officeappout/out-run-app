'use client';

/**
 * TreeNode — the Skill Tree's photo-only node card.
 *
 * Ported from ChainNode (MasterExerciseView.tsx:229-300), the closest
 * existing visual precedent (rounded photo, state ring, lock overlay) — but
 * NOT reused as-is: ChainNode is a private, unexported function with its own
 * duplicate image-resolution waterfall (resolveThumbnail). This version calls
 * the canonical resolveImageForLocation() instead, and moves the level number
 * from a below-card text line onto an on-photo corner badge, per the locked
 * visual design (photo-only card; name rendered OUTSIDE/below the card, no
 * inner text strip, no muscle-group icon).
 *
 * Locked state: a gentle desaturate+dim filter on the photo itself, plus a
 * small corner lock badge — not full opacity + a centered black scrim (an
 * earlier pass that read as "broken" in visual QA). Locked nodes are still
 * tappable — the button is never disabled; tapping opens the exercise's
 * normal detail sheet with a small "above your level" notice, handled by the
 * caller (SkillTreeScreen), not by blocking the tap here.
 *
 * Round 2: a soft blurred halo sits behind the photo (readability over the
 * park scenery background) and "אתה כאן" is a label bubble ABOVE the current
 * node (visual-only, no tap target, no start-workout action) rather than a
 * plain caption below it.
 *
 * Round 3: the image is resolveParkNodeImage(exercise), not
 * resolveImageForLocation(exercise, location) — the shared function's last
 * fallback step can silently surface a wrong-location (home) photo; see
 * resolve-park-node-image.ts. No `location` prop anymore — every node image
 * is park, unconditionally, with an honest placeholder (not a wrong photo)
 * when an exercise genuinely has no park image yet.
 */
import { Check, Lock, Crown } from 'lucide-react';
import { Exercise, getLocalizedText } from '@/features/content/exercises';
import { resolveParkNodeImage } from '../services/resolve-park-node-image';
import { SwapPill } from './SwapPill';

export type TreeNodeState = 'done' | 'current' | 'locked' | 'target';

const IMAGE_PLACEHOLDER = '/images/park-placeholder.svg';

const STATE_RING: Record<TreeNodeState, string> = {
  done: 'ring-2 ring-[#20C6D6]',
  current: 'ring-[3px] ring-[#2AA3E8] shadow-[0_0_0_4px_rgba(42,163,232,0.25)] animate-pulse',
  locked: 'ring-1 ring-slate-200',
  target: 'ring-[3px] ring-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.25)]',
};

export interface TreeNodeProps {
  exercise: Exercise;
  level: number;
  state: TreeNodeState;
  siblingCount: number;
  onTap: () => void;
  onSwapTap?: () => void;
  /** Left/right alternation for the winding path — purely presentational. */
  align: 'start' | 'end';
}

export function TreeNode({
  exercise,
  level,
  state,
  siblingCount,
  onTap,
  onSwapTap,
  align,
}: TreeNodeProps) {
  const locked = state === 'locked';
  const isTarget = state === 'target';
  const isCurrent = state === 'current';
  const isDone = state === 'done';
  const imageUrl = resolveParkNodeImage(exercise) || IMAGE_PLACEHOLDER;
  const name = getLocalizedText(exercise.name, 'he');
  const photoSize = isCurrent || isTarget ? 92 : 78;

  return (
    <div className={`flex flex-col items-${align === 'start' ? 'start' : 'end'} gap-1 max-w-[120px]`}>
      <div className="relative">
        {/* Soft halo — keeps the photo legible over the park background */}
        <div className="absolute rounded-full bg-white/65 blur-xl pointer-events-none" style={{ inset: -14 }} />

        {/* "אתה כאן" — visual label only, not a button, no tap action */}
        {isCurrent && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
            <span className="bg-[#2AA3E8] text-white text-[10px] font-black px-2.5 py-1 rounded-full whitespace-nowrap shadow-sm">
              אתה כאן
            </span>
            <div className="w-2 h-2 bg-[#2AA3E8] rotate-45 -mt-1" />
          </div>
        )}

        <button
          type="button"
          onClick={onTap}
          className={`relative rounded-2xl overflow-hidden bg-slate-200 flex-shrink-0 transition-transform active:scale-95 ${STATE_RING[state]}`}
          style={{ width: photoSize, height: photoSize }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover"
            loading="lazy"
            decoding="async"
            style={locked ? { filter: 'grayscale(55%) brightness(0.92)' } : undefined}
            onError={(e) => {
              (e.target as HTMLImageElement).src = IMAGE_PLACEHOLDER;
            }}
          />

          {/* On-photo level badge (top corner) */}
          <span
            className={`absolute top-1.5 ${align === 'start' ? 'right-1.5' : 'left-1.5'} min-w-[20px] h-[20px] px-1 rounded-full text-[10px] font-black text-white flex items-center justify-center shadow-sm`}
            style={{ background: isTarget ? '#F59E0B' : 'linear-gradient(135deg, #2CE0C0 0%, #20C6D6 50%, #2AA3E8 100%)' }}
          >
            {level}
          </span>

          {locked && (
            <div className="absolute bottom-1 left-1 bg-slate-500/90 rounded-full p-0.5 shadow-sm">
              <Lock size={10} className="text-white" />
            </div>
          )}
          {isDone && (
            <div className="absolute -top-1 -right-1 bg-[#20C6D6] rounded-full p-0.5 shadow-sm">
              <Check size={12} strokeWidth={3} className="text-white" />
            </div>
          )}
          {isTarget && (
            <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-amber-400 rounded-full p-1 shadow-sm">
              <Crown size={14} strokeWidth={2.5} className="text-white" />
            </div>
          )}
        </button>
      </div>

      {isTarget && (
        <span className="text-[10px] font-black text-amber-500">היעד</span>
      )}

      <span
        className="text-[12px] font-semibold text-center leading-tight line-clamp-2 text-slate-800"
        style={{ minHeight: 28 }}
      >
        {name}
      </span>

      {siblingCount > 0 && onSwapTap && (
        <SwapPill count={siblingCount} onTap={onSwapTap} />
      )}
    </div>
  );
}
