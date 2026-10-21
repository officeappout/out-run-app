'use client';

/**
 * /ai-coach — "קלי AI", the AI coach chat. Entry points: the pinned row at the top of the
 * chat inbox and the button on home, both shown only when useAiCoachAccess() allows.
 * Opening the URL directly without access shows a short notice (the API refuses anyway).
 *
 * Unified Kelly (kelly_unified_v1 ON): this is THE Kelly conversation for every signed-in
 * user — with AI when useAiCoachAccess allows, otherwise in team-only mode (no notice).
 */
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user';
import AiCoachChat from '@/features/ai-coach/components/AiCoachChat';
import { useKellyChatConfig } from '@/features/ai-coach/hooks/useKellyChatConfig';
import { starterChipsFor } from '@/features/user/onboarding/services/entry-whatnow';
import { useT } from '@/hooks/useT';
import { coach } from '@/messages/ns/coach';

export default function AiCoachPage() {
  const router = useRouter();
  const t = useT(coach);
  const { profile } = useUserStore();
  // Flags (real values, no super-admin override — the server reads the same) + AI access:
  // unified Kelly, phase 2 / 3 / round 4, weather, program run by slot type (useKellyChatConfig).
  const { canUseAi, loading, unified, phase2, proactive, memory, round4, weatherOn, runsByType } = useKellyChatConfig();

  // Entry step 2 (enable_entry_whatnow_v1): /ai-coach?starter=entry opens with ready chips. Only
  // that flag's drawer links here with the param, so without it this is null (unchanged).
  const starterChips =
    typeof window === 'undefined' ? null : starterChipsFor(new URLSearchParams(window.location.search).get('starter'));

  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.replace('/home');
  };

  if (!profile || loading) {
    return <div className="fixed inset-0 z-[56] grid place-items-center bg-[#F8FAFC] text-sm text-gray-400" style={{ colorScheme: 'light' }} dir="rtl">{t('page.loading')}</div>;
  }

  if (unified) return <AiCoachChat profile={profile} onClose={close} unified teamOnly={!canUseAi} phase2={phase2} weatherOn={weatherOn} proactive={proactive} memory={memory} round4={round4} runsByType={runsByType} starterChips={starterChips} />;

  if (!canUseAi) {
    return (
      <div className="fixed inset-0 z-[56] flex flex-col items-center justify-center gap-3 bg-[#F8FAFC] px-8 text-center text-gray-900" style={{ colorScheme: 'light' }} dir="rtl">
        <p className="text-base font-black text-gray-900">{t('page.noAccess.title')}</p>
        <p className="text-sm text-gray-500">{t('page.noAccess.body')}</p>
        <button type="button" onClick={() => router.replace('/home')} className="mt-2 rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-black text-white">
          {t('page.noAccess.back')}
        </button>
      </div>
    );
  }

  return <AiCoachChat profile={profile} onClose={close} phase2={phase2} weatherOn={weatherOn} memory={memory} round4={round4} runsByType={runsByType} starterChips={starterChips} />;
}
