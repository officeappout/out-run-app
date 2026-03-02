/**
 * UTS Phase 1 — Universal Training Scheduler Types
 *
 * Authoritative naming conventions (from audit):
 *  - Recovery exercises: exerciseRole === 'cooldown'  (NOT 'mobility'/'recovery'/'stretching')
 *  - Maintenance ring:  exerciseRole === 'cooldown'   (the purple ring in ConcentricRings)
 *  - Week standard:     Sunday = 0 = 'א' (matches all Hebrew day arrays in the codebase)
 */

// ── Hebrew Day ─────────────────────────────────────────────────────────────
// Index 0='א'(Sun) … 6='ש'(Sat) — matches JS Date.getDay() directly.
export type HebrewDayLetter = 'א' | 'ב' | 'ג' | 'ד' | 'ה' | 'ו' | 'ש';

// ── Recurring Template ─────────────────────────────────────────────────────
// Stored in users/{uid}.lifestyle.recurringTemplate
// Keys   = Hebrew day letters
// Values = array of Firestore program document IDs for that day
//
// Example: { 'א': ['H2279XsRGDg9G370J7S9'], 'ג': ['pull_id', 'core_id'] }
// Rest days are expressed by OMITTING the day from the template, or by
// setting type: 'rest' on the concrete UserScheduleEntry.
export type RecurringTemplate = Partial<Record<HebrewDayLetter, string[]>>;

// ── Schedule Entry Types ───────────────────────────────────────────────────
// 'training'   → standard strength/run/hybrid workout
// 'rest'       → active recovery (exerciseRole:'cooldown', difficulty:1)
// 'assessment' → reserved for future visual-assessment days
export type ScheduleEntryType = 'training' | 'rest' | 'assessment';

// 'recurring'      → hydrated from recurringTemplate (auto-generated)
// 'manual'         → user explicitly placed/moved this workout
// 'auto'           → system placed this (e.g., first-workout flow)
// 'google_calendar'→ synced from external calendar (Phase 4)
export type ScheduleEntrySource =
  | 'recurring'
  | 'manual'
  | 'auto'
  | 'google_calendar';

// ── Activity category (mirrors activity.types but avoids circular import) ──
export type ScheduleActivityCategory = 'strength' | 'cardio' | 'maintenance';

// ── Firestore Document: userSchedule/{userId}_{dateISO} ───────────────────
export interface UserScheduleEntry {
  userId: string;
  date: string;               // 'YYYY-MM-DD'
  programIds: string[];       // Firestore program doc IDs; empty for rest days
  type: ScheduleEntryType;
  source: ScheduleEntrySource;
  completed: boolean;
  completedWorkoutId?: string; // set when the workout session is finished
  /** Which ring categories are scheduled for this day (e.g. ['strength','cardio']) */
  scheduledCategories?: ScheduleActivityCategory[];
  /** Time-based scheduling — 'HH:MM' (24h) within the day */
  startTime?: string;
  /** Reserved for Google Calendar Phase 4 */
  externalId?: string;
  createdAt?: any;             // Firebase serverTimestamp()
  updatedAt?: any;
}
