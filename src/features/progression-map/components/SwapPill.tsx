'use client';

/**
 * SwapPill — the "🔄 +N" control on a Tree node.
 *
 * Caller (TreeNode) only renders this when siblingCount > 0, per the
 * founder's decision: hide the pill entirely when a level has no siblings —
 * don't render "🔄 +0" or an empty affordance.
 */
export function SwapPill({ count, onTap }: { count: number; onTap: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
      className="flex items-center gap-1 bg-white shadow-sm border border-slate-200 rounded-full px-2 py-0.5 active:scale-95 transition-transform"
    >
      <span className="text-[12px]">🔄</span>
      <span className="text-[11px] font-bold text-slate-600">+{count}</span>
    </button>
  );
}
