'use client';

/**
 * Walking signup · "מה המטרה בהליכה?" (enable_home_v2; board wr/WR-3a). The goal,
 * how long a walk feels comfortable, and the optional light core add-on (shown only
 * when the recommendation policy offers one). One CTA. Presentational.
 */
import { Flame, Footprints, HeartPulse, Target, type LucideIcon } from 'lucide-react';
import StickyActionButton from '@/components/ui/StickyActionButton';
import { IconTile } from '@/components/ui/v2';
import type { PolicyAddOn } from '@/features/schedule/recommendation-policy/types';
import { WALK_GOAL_COPY, type WalkComfort, type WalkGoal } from '@/features/schedule/walking';

const GOALS: ReadonlyArray<{ goal: WalkGoal; icon: LucideIcon }> = [
  { goal: 'weight_loss', icon: Flame },
  { goal: 'health', icon: HeartPulse },
  { goal: 'steps', icon: Footprints },
  { goal: 'belly', icon: Target },
];

const COMFORT: ReadonlyArray<{ value: WalkComfort; label: string }> = [
  { value: 'short', label: 'עד 15 דק׳' },
  { value: 'medium', label: '20–30 דק׳' },
  { value: 'long', label: '45 דק׳ ומעלה' },
];

const chipCls = (on: boolean) =>
  `inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[13.5px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
    on ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'bg-white text-v2-ink-2 shadow-v2-ring'
  }`;

export interface WalkGoalStepProps {
  goal: WalkGoal | null;
  onGoal: (g: WalkGoal) => void;
  comfort: WalkComfort;
  onComfort: (c: WalkComfort) => void;
  /** The user's step goal today (shown under "יעד הצעדים"). */
  stepGoal: number | null;
  addOn: PolicyAddOn | null;
  addOnOn: boolean;
  onAddOn: (on: boolean) => void;
  onNext: () => void;
}

export default function WalkGoalStep(p: WalkGoalStepProps) {
  return (
    <div dir="rtl" className="relative mx-auto flex w-full max-w-md flex-1 flex-col bg-v2-surface font-simpler text-v2-ink">
      <div className="px-4 pb-2 pt-1">
        <h1 className="truncate whitespace-nowrap text-[24px] font-black leading-[1.2] !tracking-[-0.02em]">מה המטרה בהליכה?</h1>
        <p className="mt-0.5 truncate whitespace-nowrap text-[13.5px] font-bold text-v2-muted">אפשר לבחור אחת · נבנה מזה את השבוע</p>

        <div role="radiogroup" aria-label="המטרה בהליכה" className="mt-3.5 flex flex-col gap-2.5">
          {GOALS.map(({ goal, icon }) => {
            const on = p.goal === goal;
            const copy = WALK_GOAL_COPY[goal];
            const sub = goal === 'steps' && p.stepGoal ? `היעד שלך היום: ${p.stepGoal.toLocaleString('he-IL')} צעדים` : copy.sub;
            return (
              <button
                key={goal}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => p.onGoal(goal)}
                className={`flex w-full items-center gap-3 rounded-[22px] bg-white p-3 text-right transition-[transform,box-shadow] duration-150 ease-v2 active:scale-[0.97] ${
                  on ? 'shadow-v2-card ring-2 ring-v2-accent' : 'shadow-v2-ring'
                }`}
              >
                <IconTile icon={icon} tone="steps" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate whitespace-nowrap text-[16px] font-black">{copy.title}</span>
                  <span className="mt-0.5 block truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-5 px-1 text-[15px] font-black">כמה זמן נוח לך ללכת?</p>
        <div role="radiogroup" aria-label="כמה זמן נוח לך ללכת" className="mt-2 flex gap-2 overflow-x-auto px-1 pb-1">
          {COMFORT.map((c) => (
            <button key={c.value} type="button" role="radio" aria-checked={p.comfort === c.value} onClick={() => p.onComfort(c.value)} className={chipCls(p.comfort === c.value)}>
              {c.label}
            </button>
          ))}
        </div>

        {p.addOn && (
          <button
            type="button"
            role="switch"
            aria-checked={p.addOnOn}
            onClick={() => p.onAddOn(!p.addOnOn)}
            className="mt-4 flex w-full items-center gap-3 rounded-[20px] bg-white p-3 text-right shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate whitespace-nowrap text-[15px] font-black">להוסיף חיזוק קל?</span>
              <span className="mt-0.5 block truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">
                {p.addOn.minutes} דק׳ ליבה וגב, {p.addOn.perWeek === 2 ? 'פעמיים' : `${p.addOn.perWeek} פעמים`} בשבוע, בבית
              </span>
            </span>
            <span aria-hidden className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-150 ${p.addOnOn ? 'bg-v2-accent' : 'bg-v2-pill-border'}`}>
              <span className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all duration-150" style={{ insetInlineStart: p.addOnOn ? 22 : 2 }} />
            </span>
          </button>
        )}
      </div>

      <div className="flex-grow" />
      <StickyActionButton variant="v2" label="המשך" disabled={!p.goal} onPress={p.onNext} />
    </div>
  );
}
