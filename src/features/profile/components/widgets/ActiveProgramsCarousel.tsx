'use client';

import { useRouter } from 'next/navigation';
import { ProgramProgressCard } from '@/features/home/components/widgets/ProgramProgressCard';
import { useProgramProgress } from '@/features/home/hooks/useProgramProgress';

/**
 * Active Programs section on the Profile page.
 *
 * Delegates all data resolution (master-derive, CMS fetch, fallbacks) to
 * `useProgramProgress` — the same hook used by `ProgramProgressRow` on the
 * Home page — so all three screens show identical, consistent values.
 */
export default function ActiveProgramsCarousel() {
  const router = useRouter();
  const data = useProgramProgress();

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-black text-gray-800">התוכניות שלי</h3>
        <button
          type="button"
          onClick={() => router.push('/home')}
          className="text-xs font-semibold text-[#00C9F2] active:opacity-70"
        >
          ניהול
        </button>
      </div>

      {data ? (
        <ProgramProgressCard
          programName={data.programName}
          iconKey={data.iconKey}
          currentLevel={data.currentLevel}
          maxLevel={data.maxLevel}
          progressPercent={data.progressPercent}
          programCount={data.programCount}
          className="!max-w-none"
        />
      ) : (
        <div className="flex flex-col items-center justify-center py-6 gap-3">
          <span className="text-3xl">📋</span>
          <p className="text-sm font-bold text-gray-500 text-center leading-snug">
            עדיין לא בחרת תוכנית אימון.
          </p>
          <button
            type="button"
            onClick={() => router.push('/home')}
            className="mt-1 px-5 py-2 bg-[#00C9F2] text-white text-sm font-bold rounded-full active:scale-95 transition-transform"
          >
            בחר תוכנית
          </button>
        </div>
      )}
    </div>
  );
}
