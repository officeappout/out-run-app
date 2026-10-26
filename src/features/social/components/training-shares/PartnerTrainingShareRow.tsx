'use client';

/**
 * One partner share as a feed activity item: "<name> מתאמנת עכשיו ב<park>" / "<name> מגיע ב-18:00
 * ל<park>" (the author's gender, neutral when unknown) + a "מצטרף/ת" action (the viewer's gender).
 * Render-only (enable_where_to_train_v1).
 */
import Button from '@/components/ui/v2/Button';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import { useLocaleStore } from '@/store/useLocaleStore';
import { formatTime } from '@/lib/i18n/core/fmt';
import type { TrainingShareJson } from '@/features/social/services/training-share-visibility';
import { sharePlace, shareTiming } from './training-share-item.logic';

export default function PartnerTrainingShareRow({ share, now, onJoin }: {
  share: TrainingShareJson;
  now: Date;
  onJoin: (share: TrainingShareJson) => void;
}) {
  const t = useT(community);
  const locale = useLocaleStore((s) => s.locale);
  const place = sharePlace(share).name;
  const line = shareTiming(share, now) === 'now'
    ? t('trainingShares.now', { name: share.displayName, place, gender: share.gender })
    : t('trainingShares.later', { name: share.displayName, place, time: formatTime(new Date(share.startTime), locale), gender: share.gender });

  return (
    <div className="flex items-center gap-3 rounded-[18px] bg-white px-3 py-2.5 shadow-v2-ring" dir="rtl" data-training-share={share.id}>
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-v2-tint text-[15px] font-black text-v2-deep">
        {share.photoURL
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={share.photoURL} alt="" className="h-full w-full object-cover" loading="lazy" />
          : Array.from(share.displayName)[0] ?? ''}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-extrabold leading-snug text-v2-ink">{line}</span>
        {share.workoutTitle && <span className="block truncate text-[12.5px] font-bold text-v2-muted">{share.workoutTitle}</span>}
      </span>
      <Button variant="ghost" size="sm" onClick={() => onJoin(share)}>{t('trainingShares.join')}</Button>
    </div>
  );
}
