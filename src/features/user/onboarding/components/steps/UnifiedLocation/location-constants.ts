/**
 * UnifiedLocation — Static Constants & Configuration
 * All static data arrays, sport classification sets, and training program constants.
 */

import type { LifestyleOption } from './location-types';

// ── Mapbox Config ────────────────────────────────────────

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
export const MAPBOX_STYLE = "mapbox://styles/mapbox/streets-v12";

// ── Lifestyle Persona Options ────────────────────────────

export const LIFESTYLE_OPTIONS: LifestyleOption[] = [
  { id: 'parent', labelHeMale: 'אבא שרוצה לחזור לכושר', labelHeFemale: 'אמא שרוצה לחזור לכושר', labelEn: 'Parent' },
  { id: 'student', labelHeMale: 'סטודנט שצריך הפסקה', labelHeFemale: 'סטודנטית שצריכה הפסקה', labelEn: 'Student' },
  { id: 'pupil', labelHeMale: 'תלמיד שרוצה להשתפר', labelHeFemale: 'תלמידה שרוצה להשתפר', labelEn: 'Pupil' },
  { id: 'office_worker', labelHeMale: 'עובד משרד שרוצה לזוז', labelHeFemale: 'עובדת משרד שרוצה לזוז', labelEn: 'Office Worker' },
  { id: 'reservist', labelHeMale: 'מילואימניק שרוצה לשמור על כושר', labelHeFemale: 'מילואימניקית שרוצה לשמור על כושר', labelEn: 'Reservist' },
  { id: 'athlete', labelHeMale: 'ספורטאי שרוצה להתקדם', labelHeFemale: 'ספורטאית שרוצה להתקדם', labelEn: 'Athlete' },
  { id: 'senior', labelHeMale: 'גמלאי שרוצה לשמור על בריאות', labelHeFemale: 'גמלאית שרוצה לשמור על בריאות', labelEn: 'Senior' },
  { id: 'vatikim', labelHeMale: 'גיל הזהב', labelHeFemale: 'גיל הזהב', labelEn: 'Golden Age' },
  { id: 'pro_athlete', labelHeMale: 'ספורטאי קצה', labelHeFemale: 'ספורטאית קצה', labelEn: 'Pro Athlete' },
  { id: 'soldier', labelHeMale: 'חייל שרוצה לשמור על כושר', labelHeFemale: 'חיילת שרוצה לשמור על כושר', labelEn: 'Soldier' },
  { id: 'young_pro', labelHeMale: 'צעיר שרוצה לזוז', labelHeFemale: 'צעירה שרוצה לזוז', labelEn: 'Young Professional' },
];

// ── Sport Classification Sets ────────────────────────────

export const CARDIO_SPORTS = new Set(['running', 'walking', 'cycling', 'swimming']);
export const STRENGTH_SPORTS = new Set(['calisthenics', 'crossfit', 'functional', 'movement', 'gym']);
export const BODY_MIND_SPORTS = new Set(['yoga', 'pilates', 'stretching']);

/** Spot-based sports MUST NOT see routes as their #1 recommendation. */
export const SPOT_BASED_SPORTS = new Set([
  'yoga', 'pilates', 'stretching',           // Body & Mind
  'climbing',                                  // Extreme (needs wall/boulder)
  'calisthenics', 'crossfit', 'functional',   // Strength (needs equipment)
  'basketball', 'football', 'tennis', 'padel', // Ball games (needs court)
  'boxing', 'mma', 'self_defense',            // Martial arts
]);

export const ROUTE_BASED_SPORTS = new Set([
  'running', 'cycling', 'walking',            // Cardio (needs path)
]);

export const CLIMBING_SPORTS = new Set(['climbing']);

export const STATIC_SPORTS = new Set([
  'basketball', 'football', 'tennis', 'padel', // Ball games
  'boxing', 'mma', 'self_defense',              // Martial arts
  'climbing', 'skateboard',                     // Extreme
]);

// ── Training Program Constants (Smart Bench Filter) ──────

/** Specialized programs that NEVER get bench fallback (Tier 3 → Pioneer) */
export const SPECIALIZED_PROGRAMS = new Set([
  'planche', 'front_lever', 'handstand', 'one_arm_pull', 'muscle_up',
]);

/** Bench-eligible programs & max level thresholds (Tier 2 → Plan B) */
export const BENCH_ELIGIBLE_PROGRAMS: Record<string, number> = {
  push: 10,        // דחיפה
  push_up: 10,     // דחיפה (alt ID)
  lower_body: 8,   // פלג גוף תחתון
  full_body: 10,   // כל הגוף
  upper_body: 10,  // פלג גוף עליון
};

/** Programs where stairs are a valid Plan B (legs-involved training).
 *  Pure Upper Body / Push programs should NEVER see stairs. */
export const STAIRS_ELIGIBLE_PROGRAMS = new Set([
  'lower_body',  // פלג גוף תחתון
  'full_body',   // כל הגוף
]);

// ── Ball Game Sport IDs ──────────────────────────────────

export const BALL_GAME_SPORTS = new Set(['basketball', 'football', 'tennis', 'padel']);

// ── Default Coordinates ──────────────────────────────────

export const DEFAULT_COORDINATES: Record<string, { lat: number; lng: number }> = {
  'tel-aviv': { lat: 32.0853, lng: 34.7818 },
  'jerusalem': { lat: 31.7683, lng: 35.2137 },
  'haifa': { lat: 32.7940, lng: 34.9896 },
  'rishon-lezion': { lat: 31.9730, lng: 34.7925 },
  'petah-tikva': { lat: 32.0892, lng: 34.8880 },
  'ashdod': { lat: 31.8044, lng: 34.6553 },
  'netanya': { lat: 32.3320, lng: 34.8599 },
  'beer-sheva': { lat: 31.2530, lng: 34.7915 },
  'holon': { lat: 32.0103, lng: 34.7792 },
  'ramat-gan': { lat: 32.0820, lng: 34.8130 },
  'bat-yam': { lat: 32.0140, lng: 34.7510 },
  'herzliya': { lat: 32.1636, lng: 34.8443 },
};
