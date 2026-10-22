'use client';

import React from 'react';
import { Users } from 'lucide-react';
import { IconTile } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { summary } from '@/messages/ns/summary';

interface Props {
  collectiveDistanceKm: number;
  participantCount: number;
}

export default function TogetherBlock({ collectiveDistanceKm, participantCount }: Props) {
  const t = useT(summary);
  if (collectiveDistanceKm <= 0 && participantCount <= 0) return null;

  const distanceStr =
    collectiveDistanceKm > 0 ? collectiveDistanceKm.toFixed(1) : '--';

  return (
    <div className="flex items-center justify-between gap-3 rounded-v2-card bg-v2-tint px-4 py-3">
      <div className="flex items-center gap-2.5">
        <IconTile icon={Users} tone="accent" size="sm" className="!bg-white" />
        <span className="text-[14px] font-bold text-v2-ink">
          {t('together.people', { n: participantCount, count: String(participantCount) })}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-[20px] font-black tabular-nums tracking-[-0.03em] text-v2-deep">{distanceStr}</span>
        <span className="text-[12px] font-bold text-v2-deep">{t('together.unit')}</span>
      </div>
    </div>
  );
}
