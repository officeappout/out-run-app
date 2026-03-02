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
}

export async function updatePresence(payload: PresencePayload): Promise<void> {
  if (payload.mode === 'ghost') {
    await clearPresence(payload.uid);
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

  if (payload.activity) data.activity = payload.activity;
  if (payload.lemurStage != null) data.lemurStage = payload.lemurStage;
  if (payload.level != null) data.level = payload.level;
  if (payload.programId) data.programId = payload.programId;

  await setDoc(doc(db, 'presence', payload.uid), data);
}

export async function clearPresence(uid: string): Promise<void> {
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
        status: MOCK_ACTIVITIES[i % MOCK_ACTIVITIES.length],
        workoutTitle: i % 2 === 0 ? 'אימון חזה + גב' : 'ריצת בוקר',
        startedAt: ts - Math.floor(Math.random() * 20 * 60_000),
      },
      lemurStage: level,
      level,
      programId: 'mock_program',
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
