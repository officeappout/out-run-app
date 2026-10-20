'use client';

/** P-5 top: back + title bar, the exercise image (dumbbell thumb when none), name and the goal pill. */
import { ChevronRight, Target } from 'lucide-react';
import { ExerciseThumb } from '@/components/ui/v2';

export interface ExerciseHeroV2Props {
  name: string;
  imageUrl: string | null;
  goal: number | null;
  onBack: () => void;
  onEditGoal: () => void;
}

export default function ExerciseHeroV2({ name, imageUrl, goal, onBack, onEditGoal }: ExerciseHeroV2Props) {
  return (
    <>
      <div className="v2-glass-bar sticky top-0 z-10 flex items-center gap-2 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onBack}
          aria-label="חזרה"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <ChevronRight className="h-5 w-5 text-v2-ink" aria-hidden />
        </button>
        <div className="min-w-0">
          <p className="whitespace-nowrap text-[12px] font-extrabold text-v2-deep">התקדמות בתרגיל</p>
          <h1 className="truncate whitespace-nowrap text-[17px] font-black text-v2-ink">{name}</h1>
        </div>
      </div>
      <div className="flex items-center gap-3.5 px-4 pt-3">
        <div className="overflow-hidden rounded-[20px] shadow-v2-ring">
          <ExerciseThumb imageUrl={imageUrl ?? undefined} size={84} />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate whitespace-nowrap text-[22px] font-black !tracking-[-0.02em] text-v2-ink">{name}</h2>
          <button
            type="button"
            onClick={onEditGoal}
            className="mt-1.5 inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-full bg-v2-tint px-3 text-[13px] font-extrabold text-v2-deep ring-1 ring-inset ring-v2-accent/40 transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <Target className="h-3.5 w-3.5" aria-hidden />
            {goal != null ? `יעד ${goal} חזרות` : 'הגדרת יעד'}
          </button>
        </div>
      </div>
    </>
  );
}
