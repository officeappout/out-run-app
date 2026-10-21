/**
 * Kelly round 4 — what the aerobic card shows. Pure (unit-tested), like workout-card-view.
 */
import type { AerobicCardView } from '@/lib/ai/coach/round4/types';
import type { NamespaceKey } from '@/lib/i18n/catalogs';
import type { coach } from '@/messages/ns/coach';
import type { CoachT } from './workout-card-view.pure';

export interface AerobicCardFace {
  title: string;
  chips: Array<{ key: 'amount' | 'kind' | 'route' | 'stops'; label: string }>;
  cue: string;
  cta: string;
  ariaLabel: string;
}

const KIND_KEYS: Record<AerobicCardView['kind'], NamespaceKey<typeof coach>> = {
  walk: 'aerobic.kind.walk',
  easy_run: 'aerobic.kind.easyRun',
  program_run: 'aerobic.kind.programRun',
};

export function aerobicCardFace(card: AerobicCardView, t: CoachT): AerobicCardFace {
  const chips: AerobicCardFace['chips'] = [];
  if (card.distanceKm) chips.push({ key: 'amount', label: t('aerobic.km', { km: String(card.distanceKm) }) });
  else if (card.minutes) chips.push({ key: 'amount', label: t('aerobic.minutes', { minutes: String(card.minutes) }) });
  chips.push({ key: 'kind', label: t(KIND_KEYS[card.kind]) });
  if (card.strengthStops) chips.push({ key: 'stops', label: t('aerobic.stops') });
  chips.push({
    key: 'route',
    label: card.route.status === 'found' && card.route.distanceKm ? t('aerobic.route.found', { km: String(card.route.distanceKm) }) : t('aerobic.route.map'),
  });
  const cta = card.kind === 'walk' ? t('aerobic.cta.walk') : t('aerobic.cta.run');
  return { title: card.title, chips: chips.slice(0, 3), cue: card.cue, cta, ariaLabel: [cta, card.title, ...chips.map((c) => c.label), card.cue].join(', ') };
}
