'use client';

/**
 * PrioritiesSection — profile Block 5.5, between ProgramsSection and Recent
 * Activity.
 *
 * Multi-select program path (Phase 1b, piece d): shows the user's captured
 * priority order (which program-path cards, which muscles, which skills —
 * in tap order) for anyone who made a genuinely multi-item selection.
 * DISPLAY ONLY — buildPriorityGroups reads progression.cardFocusOrder /
 * muscleFocusIds / skillFocusIds and nothing else; this component never
 * reads from or feeds SplitDecisionService or any scoring/volume code.
 *
 * Renders nothing when there's nothing to show (every selection the user
 * made was a single item) — unlike ProgramsSection, this data is optional
 * by nature, so there's no equivalent "you haven't chosen yet" empty state.
 */

import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { buildPriorityGroups, type PriorityGroup } from '@/features/user/onboarding/utils/priority-order';

function PriorityGroupRowV2({ group }: { group: PriorityGroup }) {
  return (
    <div className="space-y-2">
      <p className="text-[13px] font-extrabold text-v2-deep">{group.titleHe}</p>
      <div className="flex flex-col gap-2">
        {group.items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-[20px] bg-white px-3.5 py-3 shadow-v2-ring"
            dir="rtl"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-v2-tint text-[12px] font-black text-v2-deep ring-1 ring-inset ring-v2-accent/40 tabular-nums">
              {item.order}
            </span>
            <span className="truncate text-[14px] font-extrabold text-v2-ink">{item.labelHe}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PriorityGroupRow({ group }: { group: PriorityGroup }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-bold text-gray-400 tracking-wide">{group.titleHe}</p>
      <div className="flex flex-col gap-2">
        {group.items.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2.5 bg-slate-50 rounded-xl px-3 py-2.5"
            dir="rtl"
          >
            <span
              className="w-5 h-5 rounded-full bg-[#182236] text-white flex items-center justify-center font-bold shrink-0"
              style={{ fontSize: 10 }}
            >
              {item.order}
            </span>
            <span className="text-[13px] font-semibold text-gray-800 truncate">{item.labelHe}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PrioritiesSection({ v2 = false }: { v2?: boolean } = {}) {
  const profile = useUserStore((s) => s.profile);
  const groups = buildPriorityGroups(profile?.progression);

  if (groups.length === 0) return null;

  if (v2) {
    return (
      <div className="space-y-5" dir="rtl">
        <h3 className="text-[15px] font-black text-v2-ink">מה בחרת, לפי עדיפות</h3>
        {groups.map((group) => (
          <PriorityGroupRowV2 key={group.key} group={group} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-gray-800">מה בחרת, לפי עדיפות</h3>
      </div>
      {groups.map((group) => (
        <PriorityGroupRow key={group.key} group={group} />
      ))}
    </div>
  );
}
