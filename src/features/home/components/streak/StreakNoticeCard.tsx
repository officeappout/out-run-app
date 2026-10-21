'use client';

/**
 * StreakNoticeCard (home v2) — the ONE streak message of the day, inline in the home flow:
 * the streak stopped (the record stays), a shield kept it, a milestone, a new shield.
 * Renders nothing when there is nothing to say. Which card + copy: ./streak-notice.ts.
 * Mounted by the home page only under enable_home_v2, for today.
 *
 * Seen = shown: a milestone is stamped on streaks/{uid}.milestoneSeen the first time it
 * renders, so the 20:00 milestone push (streakRescueScheduler) skips it.
 */
import { useEffect, useMemo, useState } from 'react';
import { Shield, X } from 'lucide-react';
import Card from '@/components/ui/v2/Card';
import IconTile from '@/components/ui/v2/IconTile';
import StreakFlame from '@/components/ui/v2/StreakFlame';
import { useActivityStore, getTodayString } from '@/features/activity/store/useActivityStore';
import { addSeenKey, pickStreakCard, readSeenKeys, type StreakCardModel } from './streak-notice';

export function StreakNoticeView({ card, onDismiss }: { card: StreakCardModel; onDismiss: () => void }) {
  const icon =
    card.kind === 'shield_used' || card.kind === 'shield_earned' ? (
      <IconTile icon={Shield} tone="accent" size="md" />
    ) : (
      <StreakFlame tones={['strength']} size={40} live={card.kind === 'milestone'} />
    );
  return (
    <Card padding="md" className="relative flex items-center gap-3" dir="rtl" role="status" data-streak-card={card.kind}>
      {icon}
      <div className="min-w-0 flex-1 pl-8">
        <p className="text-[15px] font-black text-v2-ink whitespace-nowrap truncate">{card.title}</p>
        <p className="mt-0.5 text-[13px] font-bold leading-snug text-v2-muted">{card.body}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="סגירה"
        className="absolute top-3 left-3 grid h-9 w-9 place-items-center rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline text-v2-ink-2 active:scale-[0.97] transition-transform duration-150 ease-v2"
      >
        <X size={16} aria-hidden />
      </button>
    </Card>
  );
}

export default function StreakNoticeCard() {
  const notice = useActivityStore((s) => s.streakNotice);
  const currentStreak = useActivityStore((s) => s.currentStreak);
  const lastStreakDate = useActivityStore((s) => s.lastStreakDate);
  const dismissNotice = useActivityStore((s) => s.dismissStreakNotice);
  const markMilestoneSeen = useActivityStore((s) => s.markStreakMilestoneSeen);
  const [seenVersion, setSeenVersion] = useState(0);

  const card = useMemo(
    () => pickStreakCard({ notice, currentStreak, lastStreakDate, todayKey: getTodayString(), seen: readSeenKeys() }),
    // seenVersion: re-read the device's seen keys after a dismiss.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notice, currentStreak, lastStreakDate, seenVersion],
  );

  useEffect(() => {
    if (card?.kind === 'milestone' && card.milestone) void markMilestoneSeen(card.milestone);
  }, [card?.key, card?.kind, card?.milestone, markMilestoneSeen]);

  if (!card) return null;
  return (
    <StreakNoticeView
      card={card}
      onDismiss={() => {
        addSeenKey(card.key);
        if (card.kind !== 'milestone') dismissNotice();
        setSeenVersion((v) => v + 1);
      }}
    />
  );
}
