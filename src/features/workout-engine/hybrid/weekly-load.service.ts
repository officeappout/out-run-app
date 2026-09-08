/**
 * weekly-load.service — WeeklyLoadSnapshot for the hybrid engine
 * (HYBRID_ENGINE_DESIGN.md §2, build item 1).
 *
 * COMPOSITION-LAYER LAW: this service COMBINES existing sources, it does not
 * invent tracking:
 *   • Aerobic minutes  → the `workouts` collection (server truth; Phase-0
 *     `segments[]` carry per-unit `aerobicType`, so hybrid sessions split
 *     walking/running correctly).
 *   • Week boundary    → `getCurrentWeekStart()` from useWeeklyVolumeStore
 *     (same Sunday-local boundary as the rest of the app).
 *   • Domain sets      → useWeeklyVolumeStore.getDomainSetsCompleted()
 *     (the only place per-domain sets exist today — localStorage-scoped;
 *     see caveat below).
 *
 * WHO weekly targets (approved 08.07.2026): aerobic 150 min moderate with
 * running counted 1:2 (vigorous equivalence) + strength ≥ 2 days/week.
 *
 * CAVEAT (documented, accepted for MVP): domainSetsThisWeek is device-local
 * (Zustand persist → localStorage). aerobic minutes + strengthDays are
 * server-derived and survive device changes.
 */
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { WorkoutHistoryEntry, SessionSegmentRecord } from '@/features/workout-engine/core/services/storage.service';
import { useWeeklyVolumeStore, getCurrentWeekStart } from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { WHO_STRENGTH_TARGET_DAYS } from '@/lib/who-strength-target';

// WHO weekly targets — hard anchors for the weekly_smart resolver.
export const WHO_AEROBIC_TARGET_MIN = 150;
// WHO_STRENGTH_TARGET_DAYS now lives in src/lib/who-strength-target.ts (pure,
// no Firebase) — imported above, re-exported here for existing importers of
// this constant from this file. Pure relocation, zero behavior change.
export { WHO_STRENGTH_TARGET_DAYS };
/** 1 vigorous (running) minute ≡ 2 moderate minutes (WHO equivalence, approved). */
export const RUNNING_MODERATE_EQUIV_FACTOR = 2;

export type StrengthDomain = 'push' | 'pull' | 'legs' | 'core';

export interface WeeklyLoadSnapshot {
  weekStartDate: string; // YYYY-MM-DD (local Sunday)
  /** walking×1 + running×2 (+cycling×1), minutes */
  aerobicModerateEquivMin: number;
  aerobicRawMin: { walking: number; running: number; cycling: number };
  /** Distinct local days with a non-recovery strength contribution (incl. hybrid stations). */
  strengthDays: number;
  /** Device-local (useWeeklyVolumeStore) — see caveat in the header. */
  domainSetsThisWeek: Record<StrengthDomain, number>;
  gaps: {
    aerobicGapMin: number;     // max(0, 150 − equivMin)
    strengthGapDays: number;   // max(0, 2 − strengthDays)
    /** Domains with zero sets this week, in fixed priority order. */
    neglectedDomains: StrengthDomain[];
  };
}

const DOMAINS: StrengthDomain[] = ['push', 'pull', 'legs', 'core'];

/** Local YYYY-MM-DD for "distinct day" bucketing (same convention as the week boundary). */
function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Sum aerobic minutes per kind from one workout doc (hybrid-aware via segments[]). */
function aerobicMinutesOf(w: WorkoutHistoryEntry): { walking: number; running: number; cycling: number } {
  const out = { walking: 0, running: 0, cycling: 0 };
  const segments = (w.segments ?? []) as SessionSegmentRecord[];
  const aerobicSegments = segments.filter((s) => s.kind === 'aerobic' && s.actual?.durationSec);

  if (aerobicSegments.length > 0) {
    // Per-unit truth (Phase 0): hybrid + modern solo docs both land here.
    for (const s of aerobicSegments) {
      const min = (s.actual!.durationSec ?? 0) / 60;
      if (s.aerobicType === 'walking') out.walking += min;
      else out.running += min;
    }
    return out;
  }

  // Legacy docs (pre-segments): whole-doc duration by workoutType.
  const min = (w.duration ?? 0) / 60;
  if (w.workoutType === 'walking') out.walking += min;
  else if (w.workoutType === 'cycling') out.cycling += min;
  else if (w.workoutType === 'running') out.running += min;
  return out;
}

/** True when the doc contributes a strength day (standalone or hybrid station), excluding recovery. */
function hasStrengthContribution(w: WorkoutHistoryEntry): boolean {
  if (w.isRecovery) return false;
  const wt = String(w.workoutType ?? '').toLowerCase();
  if (wt === 'strength' || w.category === 'strength') return true;
  const segments = (w.segments ?? []) as SessionSegmentRecord[];
  return segments.some((s) => s.kind === 'strength' && (s.actual?.sets ?? 0) > 0);
}

/**
 * Build the weekly snapshot for the current calendar week.
 * Firestore query shape (userId == + date >= + orderBy date) matches the
 * existing history-index shape used by storage.service reads.
 */
export async function getWeeklyLoadSnapshot(userId: string): Promise<WeeklyLoadSnapshot> {
  const weekStartDate = getCurrentWeekStart();
  const [y, m, d] = weekStartDate.split('-').map(Number);
  const weekStart = new Date(y, m - 1, d, 0, 0, 0, 0); // local Sunday 00:00

  const snap = await getDocs(query(
    collection(db, 'workouts'),
    where('userId', '==', userId),
    where('date', '>=', weekStart),
    orderBy('date', 'desc'),
  ));

  const aerobicRawMin = { walking: 0, running: 0, cycling: 0 };
  const strengthDayKeys = new Set<string>();

  for (const doc of snap.docs) {
    const w = doc.data() as WorkoutHistoryEntry & { date?: { toDate?: () => Date } };
    const aer = aerobicMinutesOf(w as WorkoutHistoryEntry);
    aerobicRawMin.walking += aer.walking;
    aerobicRawMin.running += aer.running;
    aerobicRawMin.cycling += aer.cycling;

    if (hasStrengthContribution(w as WorkoutHistoryEntry)) {
      const docDate = w.date?.toDate?.();
      if (docDate) strengthDayKeys.add(localDateKey(docDate));
    }
  }

  const aerobicModerateEquivMin = Math.round(
    aerobicRawMin.walking
    + aerobicRawMin.running * RUNNING_MODERATE_EQUIV_FACTOR
    + aerobicRawMin.cycling,
  );

  // Domain sets — device-local store (only existing per-domain source).
  // checkAndResetWeek is the store's own responsibility; read as-is.
  const rawDomainSets = useWeeklyVolumeStore.getState().getDomainSetsCompleted();
  const domainSetsThisWeek = DOMAINS.reduce((acc, dom) => {
    acc[dom] = rawDomainSets[dom] ?? 0;
    return acc;
  }, {} as Record<StrengthDomain, number>);

  const strengthDays = strengthDayKeys.size;

  return {
    weekStartDate,
    aerobicModerateEquivMin,
    aerobicRawMin: {
      walking: Math.round(aerobicRawMin.walking),
      running: Math.round(aerobicRawMin.running),
      cycling: Math.round(aerobicRawMin.cycling),
    },
    strengthDays,
    domainSetsThisWeek,
    gaps: {
      aerobicGapMin: Math.max(0, WHO_AEROBIC_TARGET_MIN - aerobicModerateEquivMin),
      strengthGapDays: Math.max(0, WHO_STRENGTH_TARGET_DAYS - strengthDays),
      neglectedDomains: DOMAINS.filter((dom) => domainSetsThisWeek[dom] === 0),
    },
  };
}
