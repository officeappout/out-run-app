/**
 * The template sets, per activity, in carousel order. A new set (e.g. the
 * transparent stickers) is added here — the sheet and the renderer read
 * only this list.
 */
import type { ShareFormat, ShareKind } from '../types';
import { runDarkRoute } from './run-dark-route';
import { runMinimal } from './run-minimal';
import { runPhotoRoute } from './run-photo-route';
import { strengthCard } from './strength-card';
import { strengthMinimal } from './strength-minimal';
import { strengthPhoto } from './strength-photo';
import type { ShareTemplateDef } from './template';

export const SHARE_TEMPLATES_V2: Record<ShareKind, ShareTemplateDef[]> = {
  strength: [strengthPhoto, strengthCard, strengthMinimal],
  cardio: [runPhotoRoute, runDarkRoute, runMinimal],
};

export function templatesFor(kind: ShareKind, format: ShareFormat): ShareTemplateDef[] {
  return SHARE_TEMPLATES_V2[kind].filter((t) => t.formats.includes(format));
}

export function templateById(kind: ShareKind, id: string): ShareTemplateDef {
  return SHARE_TEMPLATES_V2[kind].find((t) => t.id === id) ?? SHARE_TEMPLATES_V2[kind][0];
}

/** The carousel's first card: the photo template when there's a photo, else the card / big route. */
export function defaultTemplateId(kind: ShareKind, hasPhoto: boolean): string {
  const list = SHARE_TEMPLATES_V2[kind];
  return hasPhoto ? list[0].id : list[1].id;
}
