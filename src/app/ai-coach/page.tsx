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
import { useAiCoachAccess } from '@/features/ai-coach/hooks/useAiCoachAccess';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { isWeatherOnFor } from '@/features/weather/core/weather-access';
import { starterChipsFor } from '@/features/user/onboarding/services/entry-whatnow';
import { runsByTypeFor } from '@/features/schedule/utils/runsByTypeGate';

export default function AiCoachPage() {
  const router = useRouter();
  const { profile } = useUserStore();
  const { canUseAi, loading } = useAiCoachAccess();
  // Real value (no super-admin override): the server reads the same.
  const { flags, rawFlags, loading: flagsLoading } = useFeatureFlags();
  const unified = flags.kellyUnifiedV1 === true;
  // Kelly phase 2 (ai_coach_phase2, real value): quick replies, hints, schedule proposal cards.
  const phase2 = flags.aiCoachPhase2 === true;
  // Kelly phase 3 (real values): "איך היה?" answer chips, the "מה קלי זוכר" screen.
  const proactive = flags.aiCoachProactive === true;
  const memory = flags.aiCoachMemory === true;
  // Kelly round 4 (real value): walk / run cards, nearby parks, tour + questionnaire chips.
  const round4 = flags.aiCoachRound4 === true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- core.isSuperAdmin is not on the profile type
  const weatherOn = isWeatherOnFor(rawFlags, !!(profile?.core as any)?.isSuperAdmin);
  // enable_home_v2 the way home reads it (live value, or super admin): program run by slot type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- core.isSuperAdmin is not on the profile type
  const runsByType = runsByTypeFor(rawFlags, !!(profile?.core as any)?.isSuperAdmin);

  // Entry step 2 (enable_entry_whatnow_v1): /ai-coach?starter=entry opens with ready chips. Only
  // that flag's drawer links here with the param, so without it this is null (unchanged).
  const starterChips =
    typeof window === 'undefined' ? null : starterChipsFor(new URLSearchParams(window.location.search).get('starter'));

  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.replace('/home');
  };

  if (!profile || loading || flagsLoading) {
    return <div className="fixed inset-0 z-[56] grid place-items-center bg-[#F8FAFC] text-sm text-gray-400" style={{ colorScheme: 'light' }} dir="rtl">טוען...</div>;
  }

  if (unified) return <AiCoachChat profile={profile} onClose={close} unified teamOnly={!canUseAi} phase2={phase2} weatherOn={weatherOn} proactive={proactive} memory={memory} round4={round4} runsByType={runsByType} starterChips={starterChips} />;

  if (!canUseAi) {
    return (
      <div className="fixed inset-0 z-[56] flex flex-col items-center justify-center gap-3 bg-[#F8FAFC] px-8 text-center text-gray-900" style={{ colorScheme: 'light' }} dir="rtl">
        <p className="text-base font-black text-gray-900">קלי AI עוד לא פתוח כאן</p>
        <p className="text-sm text-gray-500">כשקלי AI ייפתח לחשבון הזה, הוא יופיע בהודעות ובמסך הבית.</p>
        <button type="button" onClick={() => router.replace('/home')} className="mt-2 rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-black text-white">
          חזרה לבית
        </button>
      </div>
    );
  }

  return <AiCoachChat profile={profile} onClose={close} phase2={phase2} weatherOn={weatherOn} memory={memory} round4={round4} runsByType={runsByType} starterChips={starterChips} />;
}
