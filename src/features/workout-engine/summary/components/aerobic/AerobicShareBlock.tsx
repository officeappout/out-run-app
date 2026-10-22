'use client';

import React from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/v2';
import type { GroupSummaryCtx } from '@/features/workout-engine/summary/hooks/useGroupSummaryCtx';
import { useT } from '@/hooks/useT';
import { summary } from '@/messages/ns/summary';

interface Props {
  distanceKm: number;
  groupCtx: GroupSummaryCtx | null;
  /** False when the workout was below the minimum threshold and was not saved */
  wasSaved?: boolean;
}

/**
 * Share row for the aerobic summary. The finish/save action used to live here
 * too; it moved to the drawer's pinned footer (one explicit action).
 */
export default function AerobicShareBlock({ distanceKm, groupCtx, wasSaved = true }: Props) {
  const t = useT(summary);
  const handleShare = async () => {
    const distanceStr = distanceKm > 0 ? t('share.distance', { km: distanceKm.toFixed(2) }) : '';
    const groupPart =
      groupCtx && groupCtx.participantCount > 1
        ? t('share.group', {
            count: String(groupCtx.participantCount),
            km: groupCtx.collectiveDistanceKm.toFixed(1),
          })
        : '';
    const text = t('share.text', { distance: distanceStr, group: groupPart });

    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ text });
      } catch {
        // user cancelled or not supported
      }
    }
  };

  return (
    <div>
      {!wasSaved && (
        <div className="mb-2 py-1.5 text-center text-[12px] font-semibold text-v2-muted">
          {t('share.tooShort')}
        </div>
      )}
      <Button variant="ghost" size="md" block onClick={handleShare}>
        <Share2 size={17} strokeWidth={2.4} aria-hidden />
        {t('share.cta')}
      </Button>
    </div>
  );
}
