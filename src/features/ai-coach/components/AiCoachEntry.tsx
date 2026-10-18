'use client';

/**
 * Entry points to "קלי AI" (rendered only when useAiCoachAccess().canUseAi):
 *   AiCoachInboxRow  — pinned at the top of the chat inbox, above the human threads
 *   AiCoachHomeEntry — a small button on home (v2 look when enable_home_v2)
 */
import React from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ChevronLeft } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { coachGenderOf, type CoachGender } from '@/lib/ai/coach/persona';
import { useAiCoachAccess } from '../hooks/useAiCoachAccess';

export const AI_COACH_PATH = '/ai-coach';

const ASK: Record<CoachGender, string> = {
  male: 'שאל את קלי',
  female: 'שאלי את קלי',
  other: 'שאלו את קלי',
};

export function AiCoachInboxRow({ onNavigate }: { onNavigate?: () => void }) {
  const router = useRouter();
  const { canUseAi } = useAiCoachAccess();
  if (!canUseAi) return null;
  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.();
        router.push(AI_COACH_PATH);
      }}
      className="mb-1 flex w-full items-center gap-3 rounded-2xl border border-cyan-100 bg-cyan-50/60 px-3 py-3 text-right transition-colors hover:bg-cyan-50"
    >
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-sky-600 text-white shadow-sm">
        <Sparkles className="h-5 w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-black text-gray-900">קלי AI</span>
          <span className="rounded bg-cyan-100 px-1.5 py-0.5 text-[9px] font-black text-cyan-700">AI</span>
        </div>
        <p className="truncate text-xs text-gray-500">מאמנת דיגיטלית. אימון, התקדמות ותוכנית השבוע</p>
      </div>
      <ChevronLeft className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
    </button>
  );
}

export function AiCoachHomeEntry({ v2 }: { v2: boolean }) {
  const router = useRouter();
  const { profile } = useUserStore();
  const { canUseAi } = useAiCoachAccess();
  if (!canUseAi) return null;
  const label = ASK[coachGenderOf(profile?.core?.gender)];
  return (
    <button
      type="button"
      onClick={() => router.push(AI_COACH_PATH)}
      className={
        v2
          ? 'flex w-full items-center gap-2.5 rounded-[18px] bg-white/80 px-3 py-2.5 text-right shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.99]'
          : 'flex w-full items-center gap-2.5 rounded-2xl border border-cyan-100 bg-white px-3 py-2.5 text-right shadow-sm active:scale-[0.99]'
      }
      aria-label="פתח את קלי AI"
    >
      <span className={v2 ? 'grid h-8 w-8 place-items-center rounded-[11px] bg-v2-tint text-v2-deep' : 'grid h-8 w-8 place-items-center rounded-xl bg-cyan-50 text-cyan-600'}>
        <Sparkles className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={v2 ? 'block text-[13.5px] font-black text-v2-ink' : 'block text-[13.5px] font-black text-gray-900'}>
          {label} <span className="text-[10px] font-black text-cyan-600">AI</span>
        </span>
        <span className={v2 ? 'block text-[12px] font-bold text-v2-muted' : 'block text-[12px] text-gray-500'}>
          אימון להיום, התקדמות ותוכנית השבוע
        </span>
      </span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-gray-300" aria-hidden />
    </button>
  );
}
