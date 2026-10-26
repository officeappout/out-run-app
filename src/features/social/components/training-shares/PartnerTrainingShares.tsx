'use client';

/**
 * PartnerTrainingShares — the feed's activity items for partners' training-here shares
 * (enable_where_to_train_v1). Partners = mutual follows; the list comes from
 * /api/training-here/partners (server-side canSeePost). "מצטרף/ת" opens the SAME TrainingHereSheet,
 * prefilled with that place and time. Renders nothing when there are no shares.
 */
import { useMemo, useState } from 'react';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import TrainingHereSheet from '@/features/parks/client/components/training-here/TrainingHereSheet';
import { activityFromType } from '@/features/parks/client/components/training-here/training-here.logic';
import type { TrainingShareJson } from '@/features/social/services/training-share-visibility';
import PartnerTrainingShareRow from './PartnerTrainingShareRow';
import { sharePlace } from './training-share-item.logic';
import { usePartnerTrainingShares } from './usePartnerTrainingShares';

export function PartnerTrainingSharesList({ shares, now, onJoin }: {
  shares: readonly TrainingShareJson[];
  now: Date;
  onJoin: (share: TrainingShareJson) => void;
}) {
  const t = useT(community);
  if (shares.length === 0) return null;
  return (
    <section className="space-y-2 px-4" dir="rtl" aria-label={t('trainingShares.title')}>
      <h3 className="px-1 text-[15px] font-black text-v2-ink">{t('trainingShares.title')}</h3>
      {shares.map((s) => <PartnerTrainingShareRow key={s.id} share={s} now={now} onJoin={onJoin} />)}
    </section>
  );
}

export default function PartnerTrainingShares({ userId }: { userId: string | undefined }) {
  const { shares, refresh } = usePartnerTrainingShares(true, userId);
  const [joining, setJoining] = useState<TrainingShareJson | null>(null);
  const [open, setOpen] = useState(false);
  const now = useMemo(() => new Date(), [shares]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PartnerTrainingSharesList shares={shares} now={now} onJoin={(s) => { setJoining(s); setOpen(true); }} />
      {joining && (
        <TrainingHereSheet
          open={open}
          onClose={() => setOpen(false)}
          activity={activityFromType(joining.activityType)}
          workoutLabel={joining.workoutTitle ?? null}
          workoutTitle={joining.workoutTitle ?? null}
          place={sharePlace(joining)}
          initialStart={new Date(joining.startTime)}
          onPublished={() => { void refresh(); }}
        />
      )}
    </>
  );
}
