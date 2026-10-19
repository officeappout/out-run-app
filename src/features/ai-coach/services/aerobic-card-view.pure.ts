/**
 * Kelly round 4 — what the aerobic card shows. Pure (unit-tested), like workout-card-view.
 */
import type { AerobicCardView } from '@/lib/ai/coach/round4/types';

export interface AerobicCardFace {
  title: string;
  chips: Array<{ key: 'amount' | 'kind' | 'route' | 'stops'; label: string }>;
  cue: string;
  cta: string;
  ariaLabel: string;
}

const KIND_HE: Record<AerobicCardView['kind'], string> = { walk: 'הליכה', easy_run: 'לפי תחושה', program_run: 'מהתוכנית' };

export function aerobicCardFace(card: AerobicCardView): AerobicCardFace {
  const chips: AerobicCardFace['chips'] = [];
  if (card.distanceKm) chips.push({ key: 'amount', label: `${card.distanceKm} ק״מ` });
  else if (card.minutes) chips.push({ key: 'amount', label: `${card.minutes} דק׳` });
  chips.push({ key: 'kind', label: KIND_HE[card.kind] });
  if (card.strengthStops) chips.push({ key: 'stops', label: 'תחנות כוח' });
  chips.push({ key: 'route', label: card.route.status === 'found' && card.route.distanceKm ? `מסלול ${card.route.distanceKm} ק״מ` : 'מסלול במפה' });
  const cta = card.kind === 'walk' ? 'פתח הליכה במפה' : 'פתח ריצה במפה';
  return { title: card.title, chips: chips.slice(0, 3), cue: card.cue, cta, ariaLabel: [cta, card.title, ...chips.map((c) => c.label), card.cue].join(', ') };
}
