/**
 * Trio Labels — Dynamic label resolution and logic cue helpers.
 *
 * Fetches trio option labels from Firestore (app_config/workout_trio)
 * and provides per-variant logic cue tag overrides for workout metadata.
 *
 * Extracted from home-workout.service.ts to reduce the orchestrator
 * to pure orchestration (~1,000 lines).
 *
 * ISOMORPHIC: Pure TypeScript, no React hooks, no browser APIs.
 */

import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { TrioLabelsConfig } from './home-workout.types';
import type { TrioVariant } from './workout-metadata.service';
import type { GeneratedWorkout } from '../logic/WorkoutGenerator';

// ============================================================================
// LABEL DEFAULTS (fallback when Firestore doc is missing)
// ============================================================================

const DEFAULT_TRIO_LABELS: TrioLabelsConfig = {
  trainingLabels: { option1Label: 'מאוזן', option2Label: 'עצים ומהיר', option3Label: 'אימון פארק קליל' },
  restDayLabels:  { option1Label: 'שגרתי', option2Label: 'זרימה',      option3Label: 'שחרור' },
};

let _cachedTrioLabels: TrioLabelsConfig | null = { ...DEFAULT_TRIO_LABELS };

// ============================================================================
// FIRESTORE FETCH
// ============================================================================

/**
 * Fetch trio option labels from Firestore: app_config/workout_trio.
 *
 * Admin defines 3 keys per mode: option1Label, option2Label, option3Label.
 * The cache is pre-seeded with DEFAULT_TRIO_LABELS so callers always get
 * valid Hebrew labels — even on the very first call when Firestore is slow.
 */
export async function fetchTrioLabels(): Promise<{ labels: TrioLabelsConfig; source: 'firestore' | 'fallback' }> {
  try {
    const snap = await getDoc(doc(db, 'app_config', 'workout_trio'));
    if (!snap.exists()) {
      console.log('[WorkoutTrio] No app_config/workout_trio doc → using pre-seeded Hebrew labels');
      return { labels: _cachedTrioLabels!, source: 'fallback' };
    }

    const data = snap.data() as Partial<TrioLabelsConfig>;
    const merged: TrioLabelsConfig = {
      trainingLabels: {
        option1Label: data.trainingLabels?.option1Label || DEFAULT_TRIO_LABELS.trainingLabels.option1Label,
        option2Label: data.trainingLabels?.option2Label || DEFAULT_TRIO_LABELS.trainingLabels.option2Label,
        option3Label: data.trainingLabels?.option3Label || DEFAULT_TRIO_LABELS.trainingLabels.option3Label,
      },
      restDayLabels: {
        option1Label: data.restDayLabels?.option1Label || DEFAULT_TRIO_LABELS.restDayLabels.option1Label,
        option2Label: data.restDayLabels?.option2Label || DEFAULT_TRIO_LABELS.restDayLabels.option2Label,
        option3Label: data.restDayLabels?.option3Label || DEFAULT_TRIO_LABELS.restDayLabels.option3Label,
      },
    };

    // Sanitize: reject labels containing persona-specific keywords
    const LABEL_BLOCKLIST = ['אמא', 'אבא', 'סבא', 'סבתא', 'הורים', 'ללא ציוד'];
    const sanitizeLabel = (label: string, defaultLabel: string): string => {
      if (LABEL_BLOCKLIST.some(kw => label.includes(kw))) {
        console.warn(`[WorkoutTrio] Label "${label}" contains blocked keyword → reverting to "${defaultLabel}"`);
        return defaultLabel;
      }
      return label;
    };

    merged.trainingLabels.option1Label = sanitizeLabel(merged.trainingLabels.option1Label, DEFAULT_TRIO_LABELS.trainingLabels.option1Label);
    merged.trainingLabels.option2Label = sanitizeLabel(merged.trainingLabels.option2Label, DEFAULT_TRIO_LABELS.trainingLabels.option2Label);
    merged.trainingLabels.option3Label = sanitizeLabel(merged.trainingLabels.option3Label, DEFAULT_TRIO_LABELS.trainingLabels.option3Label);

    _cachedTrioLabels = merged;
    console.log(`[WorkoutTrio] Labels loaded from Firestore:`, merged);
    return { labels: merged, source: 'firestore' };
  } catch (e) {
    console.warn('[WorkoutTrio] Label fetch failed → using pre-seeded Hebrew labels:', e);
    return { labels: _cachedTrioLabels!, source: 'fallback' };
  }
}

// ============================================================================
// LOGIC CUE HELPERS
// ============================================================================

export interface TrioOptionConfig {
  key: 'option1Label' | 'option2Label' | 'option3Label';
  difficulty: 1 | 2 | 3;
  postProcess?: 'intense' | 'flow_regression' | 'mobility_tag' | 'flexibility_tag';
}

export function computeLogicTagOverrides(
  variant: TrioVariant,
  _workout: GeneratedWorkout,
  _cfg: TrioOptionConfig,
): { intensityReason?: string; challengeType?: string; equipmentAdaptation?: string } {
  switch (variant) {
    case 'intense':
      return {
        intensityReason: 'מנוחות ארוכות יותר לתרגילים ברמה גבוהה',
        challengeType: 'תרגיל ברמה +1 עד +3 הוזרק לאתגר כוח',
      };
    case 'easy':
      return {
        intensityReason: 'עצימות מופחתת להתאוששות',
        challengeType: 'תרגילים ברמה -1 עד -3 ליום קליל',
        equipmentAdaptation: 'חלופות משקל גוף + מתח/מקבילים בלבד',
      };
    case 'naked':
      return {
        equipmentAdaptation: 'חלופות משקל גוף + מתח/מקבילים בלבד',
      };
    default:
      return {};
  }
}

export function computeFallbackLogicCue(variant: TrioVariant): string {
  switch (variant) {
    case 'intense':
      return 'אימון עם אתגר רמה +1 עד +3 ומנוחות ארוכות – לדחיפת גבולות.';
    case 'easy':
      return 'אימון קליל עם ציוד בסיסי, עם תרגילים ברמה נמוכה יותר – ליום זרימה.';
    case 'naked':
      return 'אימון פארק קליל – משקל גוף + מתח ומקבילים.';
    default:
      return 'אימון מאוזן המותאם לפרופיל שלך.';
  }
}

// ============================================================================
// LEVEL-AWARE COACHING CUE
// ============================================================================

const DOMAIN_HEBREW: Record<string, string> = {
  push: 'דחיפה',
  pull: 'משיכה',
  legs: 'רגליים',
  core: 'מרכז',
  planche: 'פלאנש',
  front_lever: 'פרונט לבר',
  handstand: 'עמידת ידיים',
  oap: 'מתח יד אחת',
};

/**
 * Generate a level-aware coaching cue that references the user's actual
 * resolved domain levels. When Pull is L19, the coach says:
 * "מנצלים את רמת המשיכה הגבוהה שלך (L19)"
 */
export function computeLevelAwareLogicCue(
  variant: TrioVariant,
  userProgramLevels: Map<string, number>,
  requiredDomains?: string[],
): string {
  const domains = requiredDomains ?? Array.from(userProgramLevels.keys());
  if (domains.length === 0) return computeFallbackLogicCue(variant);

  // Find the strongest and weakest domain
  let strongest = { domain: '', level: 0 };
  let weakest = { domain: '', level: Infinity };
  for (const d of domains) {
    const lvl = userProgramLevels.get(d) ?? 0;
    if (lvl <= 0) continue;
    if (lvl > strongest.level) strongest = { domain: d, level: lvl };
    if (lvl < weakest.level) weakest = { domain: d, level: lvl };
  }

  if (strongest.level === 0) return computeFallbackLogicCue(variant);

  const strongName = DOMAIN_HEBREW[strongest.domain] || strongest.domain;
  const weakName = DOMAIN_HEBREW[weakest.domain] || weakest.domain;

  const levelSummary = domains
    .map(d => `${DOMAIN_HEBREW[d] || d} L${userProgramLevels.get(d) ?? '?'}`)
    .join(' | ');

  switch (variant) {
    case 'intense':
      return `מנצלים את רמת ה${strongName} הגבוהה שלך (L${strongest.level}) – אתגר כוח מותאם. [${levelSummary}]`;
    case 'easy':
      return `אימון קליל שנותן ל${weakName} (L${weakest.level}) להתחזק בהדרגה. [${levelSummary}]`;
    case 'balanced':
    default:
      if (strongest.level - weakest.level > 5) {
        return `${strongName} (L${strongest.level}) מוביל/ה – מתאזנים עם ${weakName} (L${weakest.level}). [${levelSummary}]`;
      }
      return `איזון בין הדומיינים שלך. [${levelSummary}]`;
  }
}
