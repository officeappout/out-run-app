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
import { g, type AppGender } from '@/lib/utils/gendered-text';

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
    ? g(gender,
        'שאלון כוח קצר יפתח את תחנות הכוח במסלול — למלא עכשיו',
        'שאלון כוח קצר יפתח את תחנות הכוח במסלול — למלא עכשיו',
      )
    : g(gender,
        'רוצה אימון מותאם יותר? מלא שאלון כוח קצר',
        'רוצה אימון מותאם יותר? מלאי שאלון כוח קצר',
        'אימון מותאם יותר? שאלון כוח קצר',
      );
  return { domains, hasLocked, text };
}
