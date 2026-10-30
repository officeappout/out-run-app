'use client';

/**
 * MethodInfoButton — the "i" next to a strength block's title and the sheet
 * it opens (enable_method_info_sheet_v1, owner-approved boards Method*):
 * title, one-line lead, the looping demo from the block's own cards, 3 steps,
 * and "יש שאלה? קלי עונה" with 2 chips that open Kelly with the question in
 * the composer (never auto-sent). The shell is the shared InfoSheetButton.
 *
 * Callers render it only when the flag is on and they have a model.
 */

import React from 'react';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import InfoSheetButton from '@/features/info-sheets/InfoSheetButton';
import type { MethodInfoModel } from '../../core/methods/method-info/method-info.model';
import { methodCopy } from './method-info.copy';
import MethodDemo from './MethodDemo';

export default function MethodInfoButton({ model }: { model: MethodInfoModel }) {
  const t = useT(player);
  const copy = methodCopy(model, t);
  return (
    <InfoSheetButton
      title={copy.title}
      openLabel={t('methodInfo.open', { name: copy.title })}
      lead={copy.lead}
      demoLabel={t('methodInfo.fromToday')}
      demoHeadline={model.label}
      demo={<MethodDemo model={model} t={t} />}
      tail={copy.tail}
      steps={copy.steps}
      chips={copy.chips}
      kellyContext={(q) => t('methodInfo.kellyContext', { method: copy.title, q })}
    />
  );
}
