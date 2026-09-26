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

export function SwapPill({ count, onTap }: { count: number; onTap: () => void }) {
  return (
    <div className="flex items-center gap-1 bg-white shadow-sm border border-slate-200 rounded-full pl-2 pr-0.5 py-0.5">
      <SwapIcon size={16} onClick={onTap} />
      <span className="text-[11px] font-bold text-slate-600">+{count}</span>
    </div>
  );
}
