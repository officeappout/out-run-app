'use client';

/**
 * Home progress slot — the strength program card (boards PG-1, slot 1): the same
 * ProgramProgressCard as today, now a tap target → the program's progression map when it
 * has one, else the progress hub's strength page. Before the strength survey it is the
 * existing ProgramProgressRow (its ghost upsell keeps its own tap).
 */
import { useRouter } from 'next/navigation';
import { ProgramProgressCard } from '@/features/home/components/widgets/ProgramProgressCard';
import { ProgramProgressRow } from '@/features/home/components/rows/ProgramProgressRow';
import { useProgramProgress } from '@/features/home/hooks/useProgramProgress';
import { strengthCardHref } from '@/features/home/utils/progress-slot';

export default function StrengthSlide() {
  const router = useRouter();
  const data = useProgramProgress();
  if (!data) return <ProgramProgressRow />;
  return (
    <button
      type="button"
      onClick={() => router.push(strengthCardHref(data.programId))}
      data-home-strength-card
      className="flex h-full w-full text-start transition-transform duration-150 ease-v2 active:scale-[0.97] [&>*]:h-full"
    >
      <ProgramProgressCard
        programName={data.programName}
        programNameLoading={data.programNameLoading}
        iconKey={data.iconKey}
        currentLevel={data.currentLevel}
        maxLevel={data.maxLevel}
        progressPercent={data.progressPercent}
        programCount={data.programCount}
      />
    </button>
  );
}
