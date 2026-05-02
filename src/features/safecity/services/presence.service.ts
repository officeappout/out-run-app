/**
 * Presence Service — Safe-City Map heartbeat + Workout-Aware presence.
 *
 * Firestore collection: `presence/{uid}`
 *
 * Document schema:
 * {
 *   uid:         string,
 *   name:        string,
 *   ageGroup:    'minor' | 'adult',
 *   isVerified:  boolean,
 *   schoolName:  string | null,
 *   mode:        'ghost' | 'squad' | 'verified_global',
 *   lat:         number,          // fuzzed for minors
 *   lng:         number,          // fuzzed for minors
 *   updatedAt:   serverTimestamp,
 *   authorityId: string | null,   // city id for heatmap aggregation
 *   activity?:   PresenceActivity, // workout-aware fields (Pillar 1)
 *   lemurStage?: number,          // 1–10 Lemur evolution stage
 *   level?:      number,          // user progression level
 *   programId?:  string,          // active program template ID
 * }
 *
 * Two heartbeat channels:
 *   - Map heartbeat:    2 min interval (existing Safe-City)
 *   - Workout heartbeat: 30s (moving) / 60s (stationary)
 */

import {
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { PrivacyMode } from '../store/usePrivacyStore';

// ────────────────────────────────────────────────────────────────────────────
// Fuzz location — adds a random offset within a ~100 m radius.
// Uses a uniform random angle + radius so the resulting point sits inside
// a circle around the real location. Earth radius ≈ 6 371 000 m.
// ────────────────────────────────────────────────────────────────────────────

const EARTH_RADIUS_M = 6_371_000;
const FUZZ_RADIUS_M = 100;

export function fuzzLocation(
  lat: number,
  lng: number,
): { lat: number; lng: number } {
  const angle = Math.random() * 2 * Math.PI;
  const r = Math.sqrt(Math.random()) * FUZZ_RADIUS_M;

  const dLat = (r * Math.cos(angle)) / EARTH_RADIUS_M;
  const dLng =
    (r * Math.sin(angle)) /
    (EARTH_RADIUS_M * Math.cos((lat * Math.PI) / 180));

  return {
    lat: lat + (dLat * 180) / Math.PI,
    lng: lng + (dLng * 180) / Math.PI,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Heartbeat write
// ────────────────────────────────────────────────────────────────────────────

// ────────────────────────────────────────────────────────────────────────────
// Workout-aware types
// ────────────────────────────────────────────────────────────────────────────

export type WorkoutActivityStatus = 'strength' | 'running' | 'walking' | 'cycling';

export interface PresenceActivity {
  status: WorkoutActivityStatus;
  workoutTitle?: string;
  startedAt: number; // Unix ms
}

export interface PresencePayload {
  uid: string;
  name: string;
  ageGroup: 'minor' | 'adult';
  isVerified: boolean;
  schoolName: string | null;
  mode: PrivacyMode;
  lat: number;
  lng: number;
  authorityId: string | null;
  activity?: PresenceActivity;
  lemurStage?: number;
  level?: number;
  programId?: string;
  personaId?: string;
  photoURL?: string;
  runningLevel?: number;
  currentStreak?: number;
  /** Hebrew display name of the user's primary active strength program (e.g. "כל הגוף"). */
  programName?: string;
  /** Numeric level inside that program (from `progression.tracks.{templateId}.currentLevel`). */
  programLevel?: number;
  /**
   * Mock pace for running/walking partners (e.g. "5:30") — derived deterministically
   * from lemurStage at presence-write time. Temporary stand-in until a real pace
   * field is wired through `paceProfile.basePace`. Only set when activity is
   * running or walking; absent otherwise.
   */
  mockPace?: string;
  /**
   * User's stored gender from `profile.core.gender`. Powers the partner-finder
   * gender filter on `LivePartner`. Privacy contract: callers MUST omit this
   * field for minor accounts (`ageGroup === 'minor'`) — minors' gender is
   * never broadcast to other users. Enforced at the heartbeat layer
   * (`useWorkoutPresence`), not here, so this writer simply respects whatever
   * the caller sent (or didn't send).
   */
  gender?: 'male' | 'female' | 'other';
}

export async function updatePresence(payload: PresencePayload): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (payload.mode === 'ghost') {
    await clearPresence(payload.uid);
    return;
  }

  // Last-line-of-defense coord validation. Upstream callers
  // (`useWorkoutPresence`, `usePresenceLayer`, `ShareAsLiveToggle`)
  // already guard against non-finite values, but anything that goes
  // through this writer — including future mock/seeder paths and
  // dev-tools — must not be able to corrupt `presence/{uid}` with
  // null/NaN coords. A bad doc here breaks the Mapbox GeoJSON source
  // for every other client subscribed to the collection.
  if (
    typeof payload.lat !== 'number' ||
    typeof payload.lng !== 'number' ||
    !Number.isFinite(payload.lat) ||
    !Number.isFinite(payload.lng)
  ) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        '[presence.service] Skipped updatePresence — non-finite coords:',
        { lat: payload.lat, lng: payload.lng, uid: payload.uid },
      );
    }
    return;
  }

  const shouldFuzz = payload.ageGroup === 'minor';
  const coords = shouldFuzz
    ? fuzzLocation(payload.lat, payload.lng)
    : { lat: payload.lat, lng: payload.lng };

  const data: Record<string, unknown> = {
    uid: payload.uid,
    name: payload.name,
    ageGroup: payload.ageGroup,
    isVerified: payload.isVerified,
    schoolName: payload.schoolName,
    mode: payload.mode,
    lat: coords.lat,
    lng: coords.lng,
    authorityId: payload.authorityId,
    updatedAt: serverTimestamp(),
  };

  if (payload.activity) {
    // Strip any undefined values from the activity sub-object before writing to Firestore.
    // Firestore throws INTERNAL ASSERTION FAILED when any nested field is undefined.
    const safeActivity: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload.activity)) {
      if (v !== undefined) safeActivity[k] = v;
    }
    data.activity = safeActivity;
  }
  if (payload.lemurStage != null) data.lemurStage = payload.lemurStage;
  if (payload.level != null) data.level = payload.level;
  if (payload.programId) data.programId = payload.programId;
  if (payload.personaId) data.personaId = payload.personaId;
  if (payload.photoURL) data.photoURL = payload.photoURL;
  if (payload.runningLevel != null) data.runningLevel = payload.runningLevel;
  if (payload.currentStreak != null) data.currentStreak = payload.currentStreak;
  if (payload.programName) data.programName = payload.programName;
  if (payload.programLevel != null) data.programLevel = payload.programLevel;
  if (payload.mockPace) data.mockPace = payload.mockPace;
  if (payload.gender) data.gender = payload.gender;

  await setDoc(doc(db, 'presence', payload.uid), data, { merge: true });
}

export async function clearPresence(uid: string): Promise<void> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  try {
    await deleteDoc(doc(db, 'presence', uid));
  } catch {
    // Ignore — doc may not exist
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Heartbeat manager — starts/stops an interval.
// Call `startHeartbeat` when the map mounts, `stopHeartbeat` on unmount.
// ────────────────────────────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

let _intervalId: ReturnType<typeof setInterval> | null = null;

export function startHeartbeat(getPayload: () => PresencePayload | null): void {
  stopHeartbeat();

  const tick = () => {
    const payload = getPayload();
    if (payload) {
      updatePresence(payload).catch((err) =>
        console.warn('[Presence] heartbeat failed:', err),
      );
    }
  };

  tick(); // fire immediately
  _intervalId = setInterval(tick, HEARTBEAT_INTERVAL_MS);
}

export function stopHeartbeat(): void {
  if (_intervalId) {
    clearInterval(_intervalId);
    _intervalId = null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Workout heartbeat — separate channel with activity-based frequency.
// 30s for moving activities (running/walking/cycling), 60s for stationary.
// ────────────────────────────────────────────────────────────────────────────

const WORKOUT_INTERVAL_MOVING_MS = 30_000;
const WORKOUT_INTERVAL_STATIC_MS = 60_000;

let _workoutIntervalId: ReturnType<typeof setInterval> | null = null;

export function startWorkoutHeartbeat(
  getPayload: () => PresencePayload | null,
  activityStatus: WorkoutActivityStatus = 'strength',
): void {
  stopWorkoutHeartbeat();

  const interval = activityStatus === 'strength'
    ? WORKOUT_INTERVAL_STATIC_MS
    : WORKOUT_INTERVAL_MOVING_MS;

  const tick = () => {
    const payload = getPayload();
    if (payload) {
      updatePresence(payload).catch((err) =>
        console.warn('[WorkoutPresence] heartbeat failed:', err),
      );
    }
  };

  tick();
  _workoutIntervalId = setInterval(tick, interval);
}

export function stopWorkoutHeartbeat(): void {
  if (_workoutIntervalId) {
    clearInterval(_workoutIntervalId);
    _workoutIntervalId = null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// DEBUG: Seed mock Lemurs into the presence collection for visual testing.
// Call from a dev button — generates `count` fake users near `center`.
// ────────────────────────────────────────────────────────────────────────────

const MOCK_NAMES = ['אריאל', 'נועה', 'איתי', 'מאיה', 'עידו', 'שירה', 'אדם', 'ליאור'];
const MOCK_ACTIVITIES: WorkoutActivityStatus[] = ['strength', 'running', 'strength', 'running', 'strength'];
const MOCK_PERSONAS = ['athlete', 'parent', 'office_worker', 'student', 'senior', 'athlete', 'parent', 'office_worker'];

// ─── Mock filter-data pools (used by seedMockLemurs + writePartnerPresence) ──
// Each helper returns one randomly-picked value matching the shape that
// `LivePartner` consumers (`PartnerOverlay` filters) expect. Kept exported so
// dev tools / Storybook stories can reuse them without redefining ranges.

const MOCK_PROGRAM_NAMES = ['full_body', 'push', 'pull'] as const;
const MOCK_GENDERS = ['male', 'female'] as const;
const MOCK_TARGET_DISTANCES_KM = [3, 5, 10] as const;

/** Random pace string between "5:30" and "8:00" inclusive (per-second resolution). */
export function randomMockPace(): string {
  const minSec = 5 * 60 + 30;
  const maxSec = 8 * 60;
  const sec = minSec + Math.floor(Math.random() * (maxSec - minSec + 1));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** Random integer 1..10 — matches `programLevel` range (LemurStage scale). */
export function randomProgramLevel(): number {
  return 1 + Math.floor(Math.random() * 10);
}

export function randomProgramName(): (typeof MOCK_PROGRAM_NAMES)[number] {
  return MOCK_PROGRAM_NAMES[Math.floor(Math.random() * MOCK_PROGRAM_NAMES.length)];
}

export function randomGender(): (typeof MOCK_GENDERS)[number] {
  return MOCK_GENDERS[Math.floor(Math.random() * MOCK_GENDERS.length)];
}

export function randomTargetDistanceKm(): (typeof MOCK_TARGET_DISTANCES_KM)[number] {
  return MOCK_TARGET_DISTANCES_KM[Math.floor(Math.random() * MOCK_TARGET_DISTANCES_KM.length)];
}

/** Random integer 1..30 — typical streak range visible in LivePartner cards. */
export function randomCurrentStreak(): number {
  return 1 + Math.floor(Math.random() * 30);
}

export async function seedMockLemurs(
  center: { lat: number; lng: number },
  userLevel: number = 3,
  count: number = 5,
): Promise<string[]> {
  const ids: string[] = [];

  const ts = Date.now();
  for (let i = 0; i < count; i++) {
    const uid = `mock_lemur_${ts}_${i}`;

    // True random radial scatter: uniform angle + sqrt-distributed radius
    // keeps points inside a circle (not clustered at center), max offset ±0.01 (~1.1km)
    const angle = Math.random() * 2 * Math.PI;
    const radius = Math.sqrt(Math.random()) * 0.01;
    const offsetLat = Math.sin(angle) * radius;
    const offsetLng = Math.cos(angle) * radius;

    const level = userLevel;
    const activityStatus = MOCK_ACTIVITIES[i % MOCK_ACTIVITIES.length];
    const isMover = activityStatus === 'running' || activityStatus === 'walking';

    const data: Record<string, unknown> = {
      uid,
      name: MOCK_NAMES[i % MOCK_NAMES.length],
      ageGroup: 'adult',
      isVerified: true,
      schoolName: null,
      mode: 'verified_global',
      lat: center.lat + offsetLat,
      lng: center.lng + offsetLng,
      authorityId: null,
      updatedAt: serverTimestamp(),
      activity: {
        status: activityStatus,
        workoutTitle: i % 2 === 0 ? 'אימון חזה + גב' : 'ריצת בוקר',
        startedAt: ts - Math.floor(Math.random() * 20 * 60_000),
      },
      lemurStage: level,
      level,
      programId: 'mock_program',
      personaId: MOCK_PERSONAS[i % MOCK_PERSONAS.length],
      // Filter-driving fields — random per mock user so PartnerOverlay
      // filters (level, program, pace, gender, distance, streak) all
      // have realistic data to bucket against.
      programLevel: randomProgramLevel(),
      programName: randomProgramName(),
      gender: randomGender(),
      targetDistanceKm: randomTargetDistanceKm(),
      currentStreak: randomCurrentStreak(),
      // Pace only for moving activities — mirrors `useWorkoutPresence` which
      // omits `mockPace` when the user is doing strength.
      ...(isMover ? { mockPace: randomMockPace() } : {}),
    };

    await setDoc(doc(db, 'presence', uid), data);
    ids.push(uid);
    console.log(`[SeedMock] 🐒 Created mock lemur: ${MOCK_NAMES[i % MOCK_NAMES.length]} (${uid}) at [${(center.lat + offsetLat).toFixed(5)}, ${(center.lng + offsetLng).toFixed(5)}] angle=${(angle * 180 / Math.PI).toFixed(0)}°`);
  }

  console.log(`[SeedMock] ✅ Seeded ${count} mock lemurs near [${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}]`);
  return ids;
}

export async function clearMockLemurs(ids: string[]): Promise<void> {
  for (const uid of ids) {
    await deleteDoc(doc(db, 'presence', uid)).catch(() => {});
  }
  console.log(`[SeedMock] 🧹 Cleared ${ids.length} mock lemurs`);
}
