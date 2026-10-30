'use client';

/**
 * "מה משתנה בפעם הבאה" — one line per exercise the double progression changed this session
 * (owner 30.10.2026). Presentational; lines come from utils/adaptive-change-lines.
 */
import React from 'react';
import { ArrowDown, ArrowUp, Plus, Rocket, Sparkles } from 'lucide-react';
import { Card, IconTile } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import type { AdaptiveChange } from '@/features/workout-engine/logic/adaptive/adaptive-change';
import { adaptiveChangeLine } from '../../utils/adaptive-change-lines';

const ICON: Record<AdaptiveChange['kind'], typeof ArrowUp> = {
  harder_variation: Rocket,
  jump_top: Rocket,
  up: ArrowUp,
  extra_set: Plus,
  down: ArrowDown,
  easier_variation: ArrowDown,
};

export default function AdaptiveChangesCardV2({ changes }: { changes: AdaptiveChange[] }) {
  const t = useT(player);
  if (changes.length === 0) return null;
  return (
    <Card padding="none" className="px-3.5 pb-3.5 pt-4" data-testid="adaptive-changes">
      <div className="mb-3 flex items-center gap-2.5">
        <IconTile icon={Sparkles} tone="accent" size="sm" />
        <h3 className="min-w-0 flex-1 truncate text-[17px] font-black text-v2-ink">{t('adaptiveChanges.title')}</h3>
      </div>
      <ul className="space-y-2">
        {changes.map((c) => {
          const Icon = ICON[c.kind];
          return (
            <li key={c.exerciseId} className="flex items-start gap-2.5 rounded-v2-tile bg-v2-tint px-3 py-2.5">
              <Icon size={16} className="mt-0.5 shrink-0 text-v2-deep" aria-hidden />
              <p className="min-w-0 text-[14px] font-bold leading-5 text-v2-ink">
                <b className="font-black">{c.exerciseName}:</b> {adaptiveChangeLine(t, c)}
              </p>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
