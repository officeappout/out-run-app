'use client';

/** The personal goal picker as a v2 sheet (replaces the old centred modal on the v2 page). */
import { useEffect, useState } from 'react';
import { Sheet, SheetHeader, SHEET_Z } from '@/components/ui/v2';
import VerticalWheelPicker from '@/features/workout-engine/players/strength/playlist/VerticalWheelPicker';

const GOAL_RANGE = Array.from({ length: 100 }, (_, i) => i + 1);

export interface ExerciseGoalSheetV2Props {
  open: boolean;
  currentGoal: number | null;
  initialValue: number;
  saving: boolean;
  onClose: () => void;
  onSave: (value: number) => void;
}

export default function ExerciseGoalSheetV2({ open, currentGoal, initialValue, saving, onClose, onSave }: ExerciseGoalSheetV2Props) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);
  const title = currentGoal != null ? 'עדכון יעד' : 'הגדרת יעד אישי';
  return (
    <Sheet
      open={open}
      onClose={onClose}
      zIndex={SHEET_Z.overlay}
      ariaLabel={title}
      header={<SheetHeader title={title} onClose={onClose} className="flex items-center justify-between px-5 pb-1 pt-2" />}
    >
      <div className="px-5 pb-[max(20px,env(safe-area-inset-bottom))]" dir="rtl">
        <p className="text-[13px] font-bold text-v2-muted">
          {currentGoal != null ? `יעד נוכחי: ${currentGoal} חזרות` : 'כמה חזרות בסט תרצו להגיע?'}
        </p>
        <div className="flex justify-center py-5">
          <VerticalWheelPicker values={GOAL_RANGE} selectedValue={value} onChange={setValue} label="חזרות" />
        </div>
        <button
          type="button"
          onClick={() => onSave(value)}
          disabled={saving}
          className="h-12 w-full rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97] disabled:opacity-60"
        >
          {saving ? 'שומר…' : 'שמירה'}
        </button>
      </div>
    </Sheet>
  );
}
