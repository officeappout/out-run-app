/**
 * Unified 5-phase onboarding model.
 *
 * Both Strength and Running tracks use exactly 5 segments.
 * Each track has its own labels, but the numeric phase IDs are shared.
 *
 *  #   Strength                        Running
 *  1   הכרות        (Profile)          הכרות        (Profile — auto-green)
 *  2   בחירת מסלול  (Program Path)     אבחון ריצה   (Dynamic Questions)
 *  3   מבדק רמה    (Visual Sliders)    הגדרת לו"ז   (Schedule)
 *  4   סיכום התוכנית (Summary/Result)  סיכום התוכנית (Plan Length + Summary)
 *  5   הצהרת בריאות (Health)           הצהרת בריאות (Health)
 */

import onboardingHe from '@/messages/he/onboarding.json';
import type { onboarding } from '@/messages/ns/onboarding';
import type { NamespaceKey } from '@/lib/i18n/catalogs';

export const TOTAL_PHASES = 5;

export const PHASE = {
  PROFILE:   1,
  TRACK_2:   2,
  TRACK_3:   3,
  SUMMARY:   4,
  HEALTH:    5,
} as const;

// ── Track-specific labels ──────────────────────────────────────────

// i18n (namespace `onboarding`, keys `phases.strength.*`): the strength labels live in
// src/messages/he/onboarding.json. Migrated screens render `t(STRENGTH_LABEL_KEYS[phase])`.
// STRENGTH_LABELS (and STRENGTH_PHASES.labels) stay for the screens that are not migrated yet
// (program-path, dynamic, health, health-connect, ResultLoading, ProgramResult,
// IdentityProfileScreen, the visual-assessment components): they read the HEBREW catalog
// directly — same text as before, but Hebrew in every locale until each caller moves to the keys.
export const STRENGTH_LABEL_KEYS = {
  1: 'phases.strength.profile',
  2: 'phases.strength.programPath',
  3: 'phases.strength.assessment',
  4: 'phases.strength.summary',
  5: 'phases.strength.health',
} as const satisfies Record<number, NamespaceKey<typeof onboarding>>;

export const STRENGTH_LABELS: Record<number, string> = Object.fromEntries(
  Object.entries(STRENGTH_LABEL_KEYS).map(([phase, key]) => [phase, onboardingHe[key]]),
);

export const RUNNING_LABELS: Record<number, string> = {
  1: 'שלב 1: הכרות',
  2: 'שלב 2: אבחון ריצה',
  3: 'שלב 3: הגדרת לו״ז',
  4: 'שלב 4: סיכום התוכנית',
  5: 'שלב 5: הצהרת בריאות',
};

// ── Screen → Phase mapping ─────────────────────────────────────────

export type OnboardingScreenId =
  | 'profile'
  | 'dynamic'
  | 'program-path'
  | 'assessment-visual'
  | 'assessment-result'
  | 'running-schedule'
  | 'running-plan-length'
  | 'running-summary'
  | 'health';

const STRENGTH_SCREEN_MAP: Partial<Record<OnboardingScreenId, number>> = {
  'profile':           PHASE.PROFILE,
  'program-path':      PHASE.TRACK_2,
  'assessment-visual': PHASE.TRACK_3,
  'assessment-result': PHASE.SUMMARY,
  'health':            PHASE.HEALTH,
};

const RUNNING_SCREEN_MAP: Partial<Record<OnboardingScreenId, number>> = {
  'profile':              PHASE.PROFILE,
  'dynamic':              PHASE.TRACK_2,
  'running-schedule':     PHASE.TRACK_3,
  'running-plan-length':  PHASE.SUMMARY,
  'running-summary':      PHASE.SUMMARY,
  'health':               PHASE.HEALTH,
};

export function getPhaseForScreen(
  screen: OnboardingScreenId,
  track: 'strength' | 'running' = 'strength',
): number {
  const map = track === 'running' ? RUNNING_SCREEN_MAP : STRENGTH_SCREEN_MAP;
  return map[screen] ?? PHASE.PROFILE;
}

export function getLabelForScreen(
  screen: OnboardingScreenId,
  track: 'strength' | 'running' = 'strength',
): string {
  const phase = getPhaseForScreen(screen, track);
  const labels = track === 'running' ? RUNNING_LABELS : STRENGTH_LABELS;
  return labels[phase] ?? '';
}

// ── Legacy convenience aliases ─────────────────────────────────────
// Used by existing pages that import STRENGTH_PHASES / RUNNING_PHASES.

export const STRENGTH_PHASES = {
  TOTAL: TOTAL_PHASES,
  PROFILE:       PHASE.PROFILE,    // 1
  QUESTIONNAIRE: PHASE.PROFILE,    // 1  (dynamic Qs fold into Phase 1 if visited)
  PROGRAM_PATH:  PHASE.TRACK_2,    // 2
  ASSESSMENT:    PHASE.TRACK_3,    // 3
  RESULT:        PHASE.SUMMARY,    // 4
  HEALTH:        PHASE.HEALTH,     // 5
  labels: STRENGTH_LABELS,
} as const;

export const RUNNING_PHASES = {
  TOTAL: TOTAL_PHASES,
  PROFILE:       PHASE.PROFILE,   // 1  (auto-green for running)
  QUESTIONNAIRE: PHASE.TRACK_2,   // 2
  SCHEDULE:      PHASE.TRACK_3,   // 3
  PLAN_LENGTH:   PHASE.SUMMARY,   // 4
  SUMMARY:       PHASE.SUMMARY,   // 4  (same phase as plan-length)
  HEALTH:        PHASE.HEALTH,    // 5
  labels: RUNNING_LABELS,
} as const;
