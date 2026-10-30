'use client';

/**
 * ComboStartChip — "off we go · 6 min to the station" (board PlayerTransitionStart, step 3): the
 * shared FloatingStatusChip pattern under the header, shown while the start run is "open".
 * Icon = the first leg's own activity glyph (activity-icons), on the aerobic green.
 */

import React from 'react';
import { useT } from '@/hooks/useT';
import { common } from '@/messages/ns/common';
import { player } from '@/messages/ns/player';
import { withUnit } from '@/lib/i18n/units';
import { ActivityGlyph } from '@/features/parks/core/components/hybrid/activity-icons';
import { HYBRID_AER } from '@/features/parks/core/components/hybrid/hybrid-colors';
import { FloatingStatusChip } from '../../../players/shared/v2';
import { useHybridPlayerV2 } from '../HybridPlayerV2Context';
import { startChipMinutes } from './combo-choreography';
import { useComboFlow } from './ComboFlowContext';

const PILL = 'inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-white py-[9px] ps-2.5 pe-4 text-[14px] font-black text-v2-ink shadow-v2-float ring-1 ring-v2-hairline';

export default function ComboStartChip({ top }: { top: string }) {
  const t = useT(player);
  const tc = useT(common);
  const api = useHybridPlayerV2();
  const combo = useComboFlow();
  const show = combo.kind === 'start' && combo.stage === 'open';
  const first = api?.plan[0];
  const min = startChipMinutes(first);
  return (
    <FloatingStatusChip chipKey={show ? `combo-start-${combo.runId}` : null} top={top} pillClassName={PILL}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-white" style={{ background: HYBRID_AER }} aria-hidden>
        <ActivityGlyph kind="aerobic" subtype={first?.aerobicType} className="h-4 w-4" />
      </span>
      {min ? t('hybrid.v2.combo.startChip', { time: withUnit('min', min, tc) }) : t('hybrid.v2.combo.startChipPlain')}
    </FloatingStatusChip>
  );
}
