/**
 * Workout structure sheet words (enable_feature_info_sheets_v1). PURE: takes the caller's
 * `library` translator. One step per part the workout really has; the "i per block" line only
 * when the method sheets are on.
 */

import type { LibraryT } from '@/messages/ns/library';
import { structureChips, type StructureInfoModel } from './structure-info.model';

const CHIP_KEY = {
  warmup: 'featureInfo.structure.chipWarmup',
  swap: 'featureInfo.structure.chipSwap',
  cooldown: 'featureInfo.structure.chipCooldown',
  rest: 'featureInfo.structure.chipRest',
} as const;

export function structureCopy(m: StructureInfoModel, t: LibraryT, opts: { methodInfo: boolean }) {
  const lead = [t('featureInfo.structure.lead', { parts: m.parts.length }), ...(opts.methodInfo ? [t('featureInfo.structure.leadMethod')] : [])].join(' ');
  const steps = m.parts.map((p) => {
    if (p.kind === 'warmup') return t('featureInfo.structure.stepWarmup', { title: p.title, active: t('preview.section.warmup.active') });
    if (p.kind === 'cooldown') return t('featureInfo.structure.stepCooldown', { title: p.title });
    const main = t('featureInfo.structure.stepMain', { blocks: m.mainBlocks });
    return opts.methodInfo ? `${main} ${t('featureInfo.structure.stepMainMethod')}` : main;
  });
  return {
    title: t('featureInfo.structure.title'),
    lead,
    steps,
    chips: structureChips(m).map((c) => t(CHIP_KEY[c])),
  };
}
