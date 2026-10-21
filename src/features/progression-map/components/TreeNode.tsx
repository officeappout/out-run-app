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
 * Round 4 (image resolution, reverted from round 3's stricter version):
 * park-first-but-fall-back-to-home — the founder's explicit call: if an
 * exercise genuinely has no park variant, a home photo beats a blank/
 * placeholder card. Round 3's resolveParkNodeImage (exact-park-only,
 * placeholder if none) solved a different problem — avoiding a MISLEADING
 * wrong-location photo — that turned out to matter less than "always show
 * something real." Removed that resolver rather than keep unused code around.
 *
 * Round 5: the canonical resolveImageForLocation only derives a park image
 * from a park method's previewVideo or imageUrl — never from mainVideoUrl —
 * so an exercise with a park VIDEO but no park image variant fell straight
 * through to the home fallback. resolveTreeNodeImage (resolve-tree-node-
 * image.ts) adds one more tier before giving up on park: derive a Bunny
 * thumbnail from the park method's mainVideoUrl. Falls through to the same
 * canonical park-then-home waterfall when that's not derivable either.
 *
 * The image-load failure is tracked in React state (imgFailed), not a raw
 * `e.target.src = ...` DOM patch — a plain DOM mutation on error can get
 * silently overwritten the next time this component re-renders for an
 * unrelated reason (React reconciles the <img> src back to the computed
 * value), which was a plausible contributor to "some nodes render blank."
 * State-driven fallback survives re-renders because the computed `imageUrl`
 * itself accounts for it. Resets on exercise.id change so a swapped-in
 * representative isn't stuck showing a previous exercise's failure state.
 */
import { memo, useEffect, useState } from 'react';
import { Check, Lock, Crown } from 'lucide-react';
import { Exercise, getLocalizedText } from '@/features/content/exercises';
import { resolveTreeNodeImage } from '../services/resolve-tree-node-image';
import { SwapPill } from './SwapPill';
import { useT } from '@/hooks/useT';
import { profile } from '@/messages/ns/profile';

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
  /** Home v2 (enable_home_v2) styling — bigger photo, name pill, tint states, gentle pulse. */
  v2?: boolean;
}

// ── Home v2 node states (tint/brand, never black) ─────────────────────────
const V2_STATE_RING: Record<TreeNodeState, string> = {
  done: 'ring-[3px] ring-v2-accent/70 shadow-v2-card',
  current: 'ring-[4px] ring-v2-accent shadow-v2-float',
  locked: 'ring-[3px] ring-white shadow-v2-ring',
  target: 'ring-[4px] ring-v2-gold shadow-v2-float',
};

function TreeNodeImpl({
  exercise,
  level,
  state,
  siblingCount,
  onTap,
  onSwapTap,
  align,
  v2 = false,
}: TreeNodeProps) {
  const locked = state === 'locked';
  const isTarget = state === 'target';
  const isCurrent = state === 'current';
  const isDone = state === 'done';
  const t = useT(profile);
  const name = getLocalizedText(exercise.name, 'he');

  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [exercise.id]);

  const resolvedUrl = resolveTreeNodeImage(exercise);
  const imageUrl = imgFailed || !resolvedUrl ? IMAGE_PLACEHOLDER : resolvedUrl;

  if (v2) {
    const size = isCurrent || isTarget ? 104 : 88;
    return (
      <div className="flex w-[124px] flex-col items-center gap-1.5">
        <div className="relative">
          {/* Soft halo — keeps the photo legible over the park background */}
          <div className="pointer-events-none absolute rounded-full bg-white/70 blur-xl" style={{ inset: -14 }} />

          {/* Current node: a gentle expanding ring (off under reduced motion — see .v2-node-pulse) */}
          {isCurrent && (
            <span aria-hidden className="v2-node-pulse pointer-events-none absolute -inset-1 rounded-[26px] ring-[3px] ring-v2-accent/60" />
          )}

          {/* "אתה כאן" — visual label only, not a button, no tap action */}
          {isCurrent && (
            <div className="pointer-events-none absolute -top-9 left-1/2 flex -translate-x-1/2 flex-col items-center">
              <span className="whitespace-nowrap rounded-full bg-v2-deep px-3 py-1 text-[11px] font-black text-white shadow-v2-card">
                {t('skillTree.node.youAreHere')}
              </span>
              <div className="-mt-1 h-2 w-2 rotate-45 bg-v2-deep" />
            </div>
          )}

          <button
            type="button"
            onClick={onTap}
            aria-label={name}
            className={`relative flex-shrink-0 overflow-hidden rounded-[24px] transition-transform duration-150 ease-v2 active:scale-[0.97] ${locked ? 'bg-v2-tint' : 'bg-white'} ${V2_STATE_RING[state]}`}
            style={{ width: size, height: size }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={name}
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
              style={locked ? { filter: 'grayscale(70%) saturate(0.8)', opacity: 0.72 } : undefined}
              onError={() => setImgFailed(true)}
            />

            {/* On-photo level badge (top corner) */}
            <span
              className={`absolute top-1.5 ${align === 'start' ? 'right-1.5' : 'left-1.5'} flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-black tabular-nums shadow-v2-ring ${
                isTarget ? 'bg-v2-gold text-v2-on-gold' : isCurrent ? 'bg-v2-accent text-white' : locked ? 'bg-white text-v2-muted' : 'bg-white text-v2-deep'
              }`}
            >
              {level}
            </span>

            {locked && (
              <div className="absolute bottom-1.5 left-1/2 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full bg-white/95 text-v2-muted shadow-v2-ring">
                <Lock size={13} strokeWidth={2.5} />
              </div>
            )}
          </button>

          {isDone && (
            <div className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-v2-accent text-white shadow-v2-card ring-2 ring-white">
              <Check size={13} strokeWidth={3} />
            </div>
          )}
          {isTarget && (
            <div className="absolute -top-3 left-1/2 grid h-7 w-7 -translate-x-1/2 place-items-center rounded-full bg-v2-gold text-v2-on-gold shadow-v2-card ring-2 ring-white">
              <Crown size={14} strokeWidth={2.5} />
            </div>
          )}
        </div>

        {/* Name — always visible, one line, pill for legibility over the scenery */}
        <span
          dir="rtl"
          className={`max-w-full truncate whitespace-nowrap rounded-full bg-white/90 px-2.5 py-0.5 text-[12px] font-extrabold leading-[18px] shadow-v2-ring ${
            isTarget ? 'text-v2-on-gold' : locked ? 'text-v2-muted' : 'text-v2-ink'
          }`}
          title={name}
        >
          {isTarget ? t('skillTree.node.targetName', { name }) : name}
        </span>

        {siblingCount > 0 && onSwapTap && (
          <SwapPill count={siblingCount} onTap={onSwapTap} v2 />
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-${align === 'start' ? 'start' : 'end'} gap-1 max-w-[120px]`}>
      <div className="relative">
        {/* Soft halo — keeps the photo legible over the park background */}
        <div className="absolute rounded-full bg-white/65 blur-xl pointer-events-none" style={{ inset: -14 }} />

        {/* "אתה כאן" — visual label only, not a button, no tap action */}
        {isCurrent && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-none">
            <span className="bg-[#2AA3E8] text-white text-[10px] font-black px-2.5 py-1 rounded-full whitespace-nowrap shadow-sm">
              {/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}אתה כאן
            </span>
            <div className="w-2 h-2 bg-[#2AA3E8] rotate-45 -mt-1" />
          </div>
        )}

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
            onError={() => setImgFailed(true)}
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
        <span className="text-[10px] font-black text-amber-500">{/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}היעד</span>
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

// Phase 4c-2: memoized to stop an unrelated user-doc write (any Firestore
// write to users/{uid} re-delivers the FULL doc via onSnapshot, which
// produces a brand-new `profile` object reference even when nothing this
// screen cares about changed) from re-rendering all ~20 tree nodes and
// re-running resolveTreeNodeImage's per-node diagnostic on every one of
// them. onTap/onSwapTap are deliberately excluded from the comparator —
// both are recreated on every parent render regardless of whether anything
// meaningful changed, so comparing them would defeat the memo entirely;
// they're referenced only inside onClick handlers, never read during
// render, so a retained "stale" closure from a skipped re-render is
// behaviorally identical to a fresh one (both close over nothing but
// React's own stable setters plus the same rung/state values already
// compared below).
function treeNodePropsEqual(prev: TreeNodeProps, next: TreeNodeProps): boolean {
  return (
    prev.exercise === next.exercise &&
    prev.level === next.level &&
    prev.state === next.state &&
    prev.siblingCount === next.siblingCount &&
    prev.align === next.align &&
    prev.v2 === next.v2
  );
}

export const TreeNode = memo(TreeNodeImpl, treeNodePropsEqual);
