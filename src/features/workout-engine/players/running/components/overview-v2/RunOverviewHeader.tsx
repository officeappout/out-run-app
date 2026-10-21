'use client';

/**
 * The run overview's sticky header — #462's run header (kind tile, type
 * pill, title, "42 דק׳ · ~6.6 ק״מ · מסיים ~09:26", week line), plus the
 * chosen route's line on the map (board M-6b).
 */

import { MapPin } from 'lucide-react';
import { WorkoutOverviewHeader } from '@/components/ui/v2';
import type { RunPreviewModel } from '../../utils/run-preview/run-preview-model';
import RunKindTile from '../preview-v2/RunKindIcon';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

export interface RunOverviewHeaderProps {
  model: RunPreviewModel;
  /** "מסיים ~09:26". */
  finishText?: string | null;
  /** "על לולאת הירקון · 1.5 סיבובים · 600 מ׳ ממך". */
  routeLine?: string | null;
  /** The runner swapped the main set / edited a pace (board M-7c): "· מותאם". */
  customized?: boolean;
}

export default function RunOverviewHeader({ model, finishText, routeLine, customized = false }: RunOverviewHeaderProps) {
  const t = useT(player);
  // Board M-6a: time · km · finish (the reps live in the title and the strip).
  const meta = model.meta.slice(0, 2).map((text, i) => ({ key: `m${i}`, text }));
  if (finishText) meta.push({ key: 'finish', text: finishText });
  return (
    <div className="flex min-w-0 items-start gap-3">
      <RunKindTile kind={model.kind} size={44} />
      <div className="min-w-0">
        <span className="inline-flex h-[26px] items-center whitespace-nowrap rounded-full px-2.5 text-[12px] font-extrabold"
          style={{ background: model.tint, color: model.textColor }}>
          {customized ? t('run.overview.header.typeCustomized', { type: model.typeLabel }) : model.typeLabel}
        </span>
        <div className="mt-1">
          <WorkoutOverviewHeader v2 title={model.title} meta={meta} />
        </div>
        {model.weekLabel && <p className="truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{model.weekLabel}</p>}
        {routeLine && (
          <p className="mt-0.5 flex items-center gap-1 truncate whitespace-nowrap text-[12.5px] font-extrabold text-v2-deep">
            <MapPin size={13} className="shrink-0" aria-hidden />
            <span className="truncate">{routeLine}</span>
          </p>
        )}
      </div>
    </div>
  );
}
