/**
 * route-questionnaire-line — the ONE questionnaire line for a hybrid route's stop list (G2.1,
 * Sderot pilot). Pure; HybridJourneyAxis renders it once above the stations.
 *
 * Two per-station sources feed it:
 *   • `assessmentNudge` — a station with real (equipment-tabata) content whose domains the user
 *     hasn't assessed: optional upgrade ("want a more tailored workout?").
 *   • `needsAssessment` — a locked station (no equipment alternative): its content needs the
 *     questionnaire.
 * Both used to be able to render per station (the locked card as an amber warning on EVERY
 * locked stop). Now: one neutral, gendered line for the route (union of domains), and each
 * locked station shows only a neutral "locked" state.
 */
import type { AppGender } from '@/lib/utils/gendered-text';
import type { MapT } from '@/messages/ns/map';
import { defaultMapT } from '@/features/parks/core/default-map-t';

interface SegLike {
  kind?: string;
  content?: {
    assessmentNudge?: { assessmentDomains?: string[] } | null;
    needsAssessment?: { assessmentDomains?: string[] } | null;
  } | null;
}

export interface RouteQuestionnaireLine {
  /** Union of every station's unassessed domains — what the questionnaire link opens. */
  domains: string[];
  /** Some station is locked until the questionnaire (vs. only an optional upgrade). */
  hasLocked: boolean;
  text: string;
}

export function routeQuestionnaireLine(
  segments: readonly SegLike[],
  gender: AppGender | null | undefined,
  t: MapT = defaultMapT(),
): RouteQuestionnaireLine | null {
  const locked = segments.filter((s) => s.content?.needsAssessment);
  const nudged = segments.filter((s) => s.content?.assessmentNudge);
  if (locked.length === 0 && nudged.length === 0) return null;
  const domains = Array.from(new Set([
    ...locked.flatMap((s) => s.content?.needsAssessment?.assessmentDomains ?? []),
    ...nudged.flatMap((s) => s.content?.assessmentNudge?.assessmentDomains ?? []),
  ]));
  const hasLocked = locked.length > 0;
  const text = hasLocked
    ? t('hybrid.questionnaire.locked')
    : t('hybrid.questionnaire.nudge', { gender: gender ?? 'other' });
  return { domains, hasLocked, text };
}
