'use client';

/**
 * /ai-coach — "קלי AI", the AI coach chat. Entry points: the pinned row at the top of the
 * chat inbox and the button on home, both shown only when useAiCoachAccess() allows.
 * Opening the URL directly without access shows a short notice (the API refuses anyway).
 */
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user';
import AiCoachChat from '@/features/ai-coach/components/AiCoachChat';
import { useAiCoachAccess } from '@/features/ai-coach/hooks/useAiCoachAccess';

export default function AiCoachPage() {
  const router = useRouter();
  const { profile } = useUserStore();
  const { canUseAi, loading } = useAiCoachAccess();

  const close = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.replace('/home');
  };

  if (!profile || loading) {
    return <div className="fixed inset-0 z-[56] grid place-items-center bg-[#F8FAFC] text-sm text-gray-400" style={{ colorScheme: 'light' }} dir="rtl">טוענת...</div>;
  }

  if (!canUseAi) {
    return (
      <div className="fixed inset-0 z-[56] flex flex-col items-center justify-center gap-3 bg-[#F8FAFC] px-8 text-center text-gray-900" style={{ colorScheme: 'light' }} dir="rtl">
        <p className="text-base font-black text-gray-900">קלי AI עוד לא פתוחה כאן</p>
        <p className="text-sm text-gray-500">כשהיא תיפתח לחשבון הזה, היא תופיע בהודעות ובמסך הבית.</p>
        <button type="button" onClick={() => router.replace('/home')} className="mt-2 rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-black text-white">
          חזרה לבית
        </button>
      </div>
    );
  }

  return <AiCoachChat profile={profile} onClose={close} />;
}
