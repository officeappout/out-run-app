'use client';

/**
 * SwapPill — the "🔄 +N" control on a Tree node.
 *
 * Uses the app's existing SwapIcon (src/features/workout-engine/components/
 * SwapIcon.tsx — /assets/icons/ui/swap.svg, the same icon that triggers
 * ExerciseReplacementModal from a workout exercise row) — not a generic
 * emoji/glyph, per the founder's explicit correction.
 *
 * Caller (TreeNode) only renders this when siblingCount > 0 — hide the pill
 * entirely when a level has no siblings, per the founder's decision.
 */
import SwapIcon from '@/features/workout-engine/components/SwapIcon';

export function SwapPill({ count, onTap, v2 = false }: { count: number; onTap: () => void; v2?: boolean }) {
  return (
    <div
      className={
        v2
          ? 'flex items-center gap-1 rounded-full bg-white py-0.5 pl-2 pr-0.5 shadow-v2-ring'
          : 'flex items-center gap-1 bg-white shadow-sm border border-slate-200 rounded-full pl-2 pr-0.5 py-0.5'
      }
    >
      <SwapIcon size={16} onClick={onTap} />
      <span className={v2 ? 'text-[11px] font-extrabold text-v2-ink-2' : 'text-[11px] font-bold text-slate-600'}>+{count}</span>
    </div>
  );
}
