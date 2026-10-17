'use client';

/**
 * InviteBonusCard — the design lab's "invite a friend" card with five slots
 * (leagues, 17.10.2026). A friend who joins through your link adds +50 to
 * your neighborhood and city leagues (onReferralCreateLeagueBonus, at most 5 a
 * week). Filled slots = friends who joined (core.referralCount, capped at 5 —
 * the client can't read the weekly tally, which is server-only).
 */
import { Check, UserPlus } from 'lucide-react';
import Button from '@/components/ui/v2/Button';
import { useUserStore } from '@/features/user';
import { APP_CONFIG_LINKS } from '@/lib/config/app-urls';

const BONUS = 50;
const SLOTS = 5;

export default function InviteBonusCard({ scopeName }: { scopeName?: string | null }) {
  const profile = useUserStore((s) => s.profile);
  const joined = Math.min(SLOTS, Math.max(0, Number((profile?.core as { referralCount?: number } | undefined)?.referralCount ?? 0)));

  const invite = () => {
    if (!profile?.id) return;
    const link = `${APP_CONFIG_LINKS.GENERAL_INVITE_ONELINK}?ref=${profile.id}`;
    const text = `בוא/י להתאמן איתי${scopeName ? ` ב${scopeName}` : ''} ב-OUT 💪 ${link}`;
    if (navigator.share) navigator.share({ text }).catch(() => {});
    else if (navigator.clipboard) void navigator.clipboard.writeText(text);
  };

  return (
    <div className="rounded-v2-card border border-v2-hairline-cool bg-gradient-to-br from-[#e8f9fe] to-[#e9fdfb] p-4 text-right" dir="rtl">
      <div className="flex items-start gap-3">
        <span className="grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[14px] bg-white text-v2-deep">
          <UserPlus size={20} strokeWidth={2.4} aria-hidden />
        </span>
        <div className="flex-1">
          <div className="text-[16px] font-black text-v2-ink">חבר שמצטרף = +{BONUS} נק׳</div>
          <p className="mt-0.5 text-[13.5px] leading-snug text-v2-ink-2">
            הנקודות נכנסות לליגת {scopeName ? `${scopeName} ול` : 'השכונה ו'}עיר שלך, עד {SLOTS} חברים בשבוע.
          </p>
        </div>
      </div>
      <ol className="mt-3 flex gap-1.5" aria-label={`${joined} מתוך ${SLOTS} חברים הצטרפו`}>
        {Array.from({ length: SLOTS }, (_, n) => (
          <li
            key={n}
            className={`grid h-9 flex-1 place-items-center rounded-full text-[12px] font-extrabold ${
              n < joined ? 'bg-v2-cta text-v2-on-cta' : 'bg-white/70 text-v2-muted'
            }`}
          >
            {n < joined ? <Check size={15} strokeWidth={3} aria-hidden /> : `+${BONUS}`}
          </li>
        ))}
      </ol>
      <Button variant="primary" block className="mt-3" onClick={invite}>
        <UserPlus size={17} strokeWidth={2.6} aria-hidden />
        הזמנת חבר
      </Button>
    </div>
  );
}
