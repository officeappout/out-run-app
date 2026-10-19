/**
 * resolveSmartSlots — enable_hybrid_cards_v2's slot list for the "מה עושים היום?" carousel.
 * PURE. The flag-off path never reaches this file (DiscoverLayer keeps calling resolveSlots).
 *
 * Takes the ranked cards (rankHybridCards) and turns them into the SAME HybridSlot shapes the
 * carousel already renders:
 *   • walk_strength — NEW slot (mode 'smart_walk_strength'), replaces the old one-station
 *     'recommended' card. Sized by the situation (steps → km, weekly sets → strength minutes).
 *   • full_park / assessment_prompt and route_stops — the existing resolveSlots slots, kept
 *     only when ranked visible, with the reason line (and, for route_stops, the route id so
 *     the compose uses the route the card talks about).
 *   • aerobic_quick — always last, unchanged.
 * The top-ranked hybrid card carries the "מומלץ" badge.
 */

import { resolveSlots, type HybridPreset, type HybridSlot, type SlotEnv } from '../hybrid-slots';
import { shareToEmphasis } from '../build-hybrid-input';
import { routeStopsSubtitle, walkStrengthSubtitle, walkStrengthTitle } from './hybrid-card-copy';
import type { RankedHybridCard } from './situation.types';

const BRAND = '#00ADEF';

export function buildWalkStrengthSlot(card: RankedHybridCard, aerobicKind: 'walking' | 'running'): HybridSlot | null {
  const sizing = card.sizing;
  if (!sizing || !card.park) return null;
  const preset: HybridPreset = {
    id: 'walk_strength',
    aerobicKind,
    emphasis: shareToEmphasis(sizing.aerobicShare),
    shape: 'sandwich',
    bolts: 2,
    defaultTimeBudgetMin: sizing.timeBudgetMin,
    mode: 'smart_walk_strength',
    aerobicShare: sizing.aerobicShare,
    smart: {
      targetKm: sizing.walkKm,
      parkId: card.park.id,
      strengthSets: sizing.strengthSets,
      strengthMin: sizing.strengthMin,
    },
  };
  return {
    kind: 'hybrid',
    id: 'walk_strength',
    preset,
    timeBudgetMin: sizing.timeBudgetMin,
    title: walkStrengthTitle(aerobicKind),
    subtitle: walkStrengthSubtitle(sizing, card.park),
    bolts: 2,
    recommended: false,
    accent: BRAND,
    reason: card.reason,
    cacheKeySuffix: `|p:${card.park.id}|km:${sizing.walkKm}|s:${sizing.strengthSets}`,
  };
}

export function resolveSmartSlots(env: SlotEnv, ranked: RankedHybridCard[]): HybridSlot[] {
  if (!env.enableHybridSlots) return [];
  // The old one-station 'recommended' card is retired here — walk_strength replaces it.
  const legacy = resolveSlots({ ...env, enableRecommendedHybrid: false });
  const byId = new Map(legacy.map((s) => [s.id, s] as const));

  const cards: HybridSlot[] = [];
  for (const card of ranked) {
    if (card.id === 'walk_strength') {
      const slot = buildWalkStrengthSlot(card, env.aerobicKind);
      if (slot) cards.push(slot);
    } else if (card.id === 'full_park') {
      const fp = byId.get('full_park');
      const prompt = byId.get('assessment_prompt');
      if (fp) cards.push({ ...fp, reason: card.reason });
      else if (prompt) cards.push(prompt);
    } else if (card.id === 'route_stops') {
      const rs = byId.get('route_stops');
      if (rs && rs.kind === 'hybrid' && card.route) {
        cards.push({
          ...rs,
          subtitle: routeStopsSubtitle(card.route),
          reason: card.reason,
          preset: { ...rs.preset, smart: { routeId: card.route.routeId } },
          cacheKeySuffix: `|r:${card.route.routeId}`,
        });
      }
    }
  }

  const topHybridId = cards[0]?.kind === 'hybrid' ? cards[0].id : null;
  const out: HybridSlot[] = cards.map((s) => ({ ...s, recommended: s.id === topHybridId }));
  const quick = byId.get('aerobic_quick');
  if (quick) out.push(quick);
  return out;
}
