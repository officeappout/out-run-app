/**
 * The template sets, per activity, in carousel order. A new set (e.g. the
 * transparent stickers) is added here — the sheet and the renderer read
 * only this list.
 */
import type { ShareFormat, ShareKind, ShareModel } from '../types';
import { runDarkRoute } from './run-dark-route';
import { runMinimal } from './run-minimal';
import { runPhotoRoute } from './run-photo-route';
import { runTogether } from './run-together';
import { runSticker, runStickerStats } from './sticker-run';
import { strengthSticker } from './sticker-strength';
import { strengthCard } from './strength-card';
import { strengthMinimal } from './strength-minimal';
import { strengthPhoto } from './strength-photo';
import type { ShareTemplateDef } from './template';

export const SHARE_TEMPLATES_V2: Record<ShareKind, ShareTemplateDef[]> = {
  strength: [strengthPhoto, strengthCard, strengthMinimal, strengthSticker],
  cardio: [runPhotoRoute, runDarkRoute, runMinimal, runTogether, runSticker, runStickerStats],
};

/** The carousel for a format; templates that need data the workout lacks are left out. */
export function templatesFor(kind: ShareKind, format: ShareFormat, model?: ShareModel | null): ShareTemplateDef[] {
  return SHARE_TEMPLATES_V2[kind].filter((t) => t.formats.includes(format) && (!t.available || (!!model && t.available(model))));
}

export function templateById(kind: ShareKind, id: string): ShareTemplateDef {
  return SHARE_TEMPLATES_V2[kind].find((t) => t.id === id) ?? SHARE_TEMPLATES_V2[kind][0];
}

/** The carousel's first card: the photo template when there's a photo, else the card / big route. */
export function defaultTemplateId(kind: ShareKind, hasPhoto: boolean, format: ShareFormat = 'story'): string {
  if (format === 'sticker') return templatesFor(kind, 'sticker')[0]?.id ?? SHARE_TEMPLATES_V2[kind][0].id;
  const list = SHARE_TEMPLATES_V2[kind];
  return hasPhoto ? list[0].id : list[1].id;
}
