'use client';

/** The leading tile of a week-builder session: run (quality = bolt), walk, or the strength program's own icon. */
import { Footprints, Zap } from 'lucide-react';
import { IconTile } from '@/components/ui/v2';
import { getProgramIcon, resolveIconKey } from '@/features/content/programs/core/program-icon.util';
import { isQualitySlot } from '../../engine-v2/config';
import type { WbSession } from '../types';

export default function SessionIcon({ s }: { s: Pick<WbSession, 'track' | 'slot' | 'slug'> }) {
  if (s.track === 'run') return <IconTile icon={isQualitySlot(s.slot) ? Zap : Footprints} tone="run" size="sm" />;
  if (s.track === 'walk') return <IconTile icon={Footprints} tone="steps" size="sm" />;
  return (
    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-v2-tint text-v2-deep">
      {getProgramIcon(resolveIconKey(undefined, s.slug ?? null), 'w-5 h-5')}
    </span>
  );
}
