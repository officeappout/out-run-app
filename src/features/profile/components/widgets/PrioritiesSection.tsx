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

export default function PrioritiesSection() {
  const profile = useUserStore((s) => s.profile);
  const groups = buildPriorityGroups(profile?.progression);

  if (groups.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-5" dir="rtl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black text-gray-800">מה בחרת, לפי עדיפות</h3>
      </div>
      {groups.map((group) => (
        <PriorityGroupRow key={group.key} group={group} />
      ))}
    </div>
  );
}
