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
 * Locked state (revised per visual QA — the first pass read as "broken"):
 * a gentle desaturate+dim filter on the photo itself, keeping it clearly
 * visible, plus a small corner lock badge — NOT full opacity-55 + a
 * centered black scrim, which washed the whole card out. Locked nodes are
 * still tappable (per the founder's explicit correction) — the button is
 * never disabled; tapping opens the exercise's normal detail sheet with a
 * small "above your level" notice, handled by the caller (SkillTreeScreen),
 * not by blocking the tap here.
 */
import { Check, Lock, Crown } from 'lucide-react';
import { Exercise, getLocalizedText, resolveImageForLocation } from '@/features/content/exercises';
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
  location: string | null;
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
  location,
  siblingCount,
  onTap,
  onSwapTap,
  align,
}: TreeNodeProps) {
  const locked = state === 'locked';
  const isTarget = state === 'target';
  const isCurrent = state === 'current';
  const isDone = state === 'done';
  const imageUrl = resolveImageForLocation(exercise, location) || IMAGE_PLACEHOLDER;
  const name = getLocalizedText(exercise.name, 'he');

  return (
    <div className={`flex flex-col items-${align === 'start' ? 'start' : 'end'} gap-1 max-w-[120px]`}>
      <button
        type="button"
        onClick={onTap}
        className={`relative rounded-2xl overflow-hidden bg-slate-200 flex-shrink-0 transition-transform active:scale-95 ${STATE_RING[state]}`}
        style={{ width: isCurrent || isTarget ? 92 : 78, height: isCurrent || isTarget ? 92 : 78 }}
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

      {isCurrent && (
        <span className="text-[10px] font-black text-[#2AA3E8]">אתה כאן</span>
      )}
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
