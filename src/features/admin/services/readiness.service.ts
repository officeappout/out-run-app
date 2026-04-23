/**
 * Military Readiness Service
 *
 * Reads threshold configs per unit, queries workout data,
 * and computes Green/Yellow/Red readiness status per soldier & unit.
 */
import {
  doc, getDoc, setDoc, collection, query, where,
  getDocs, serverTimestamp, orderBy, limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Types ─────────────────────────────────────────────────────────────

export interface ReadinessTest {
  id: string;
  label: string;
  metric: string;
  passThreshold: number;
  yellowThreshold: number;
  unit: 'minutes' | 'reps' | 'meters' | 'seconds';
  lowerIsBetter: boolean;
}

export interface ReadinessConfig {
  unitId: string;
  tenantId: string;
  tests: ReadinessTest[];
  updatedAt?: any;
  updatedBy?: string;
}

export type ReadinessStatus = 'green' | 'yellow' | 'red';

export interface SoldierReadiness {
  uid: string;
  name: string;
  status: ReadinessStatus;
  testResults: {
    testId: string;
    value: number | null;
    status: ReadinessStatus;
  }[];
  lastActivityDate: string | null;
}

export interface UnitReadinessSummary {
  unitId: string;
  green: number;
  yellow: number;
  red: number;
  total: number;
  soldiers: SoldierReadiness[];
}

// ── Config CRUD ───────────────────────────────────────────────────────

export async function getReadinessConfig(unitId: string): Promise<ReadinessConfig | null> {
  const snap = await getDoc(doc(db, 'readiness_configs', unitId));
  if (!snap.exists()) return null;
  return snap.data() as ReadinessConfig;
}

export async function saveReadinessConfig(
  config: ReadinessConfig,
  adminUid: string,
): Promise<void> {
  await setDoc(doc(db, 'readiness_configs', config.unitId), {
    ...config,
    updatedAt: serverTimestamp(),
    updatedBy: adminUid,
  });
}

// ── Readiness Calculation ─────────────────────────────────────────────

function evaluateTest(
  value: number | null,
  test: ReadinessTest,
): ReadinessStatus {
  if (value === null || value === undefined) return 'red';

  if (test.lowerIsBetter) {
    if (value <= test.passThreshold) return 'green';
    if (value <= test.yellowThreshold) return 'yellow';
    return 'red';
  } else {
    if (value >= test.passThreshold) return 'green';
    if (value >= test.yellowThreshold) return 'yellow';
    return 'red';
  }
}

function worstStatus(statuses: ReadinessStatus[]): ReadinessStatus {
  if (statuses.includes('red')) return 'red';
  if (statuses.includes('yellow')) return 'yellow';
  return 'green';
}

/**
 * Compute readiness for all soldiers in a unit.
 * Reads users where core.unitId == unitId, then cross-references
 * their workout data from the last 30 days.
 */
export async function getUnitReadiness(unitId: string): Promise<UnitReadinessSummary> {
  const config = await getReadinessConfig(unitId);

  // Load soldiers in this unit
  const usersSnap = await getDocs(query(
    collection(db, 'users'),
    where('core.unitId', '==', unitId),
  ));

  if (!config || config.tests.length === 0) {
    const soldiers: SoldierReadiness[] = usersSnap.docs.map(d => {
      const core = d.data().core as Record<string, any> ?? {};
      return {
        uid: d.id,
        name: core.name ?? 'ללא שם',
        status: 'red' as ReadinessStatus,
        testResults: [],
        lastActivityDate: null,
      };
    });
    return { unitId, green: 0, yellow: 0, red: soldiers.length, total: soldiers.length, soldiers };
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const soldiers: SoldierReadiness[] = [];

  for (const userDoc of usersSnap.docs) {
    const core = userDoc.data().core as Record<string, any> ?? {};
    const soldierName = core.name ?? 'ללא שם';

    // Fetch this soldier's recent workouts
    const workoutsSnap = await getDocs(query(
      collection(db, 'workouts'),
      where('userId', '==', userDoc.id),
      orderBy('completedAt', 'desc'),
      limit(50),
    ));

    const metricBests = new Map<string, number>();
    let lastDate: string | null = null;

    for (const wDoc of workoutsSnap.docs) {
      const w = wDoc.data();
      const completedAt = w.completedAt?.toDate?.() ?? (w.completedAt ? new Date(w.completedAt) : null);
      if (!completedAt || completedAt < thirtyDaysAgo) continue;

      if (!lastDate) {
        lastDate = completedAt.toISOString().split('T')[0];
      }

      // Extract metrics from workout data
      if (w.durationMinutes) {
        const current = metricBests.get('cardio_minutes');
        if (!current || w.durationMinutes < current) {
          metricBests.set('cardio_minutes', w.durationMinutes);
        }
      }
      if (w.totalReps) {
        const current = metricBests.get('strength_reps');
        if (!current || w.totalReps > current) {
          metricBests.set('strength_reps', w.totalReps);
        }
      }
      if (w.distanceMeters) {
        const current = metricBests.get('distance_meters');
        if (!current || w.distanceMeters > current) {
          metricBests.set('distance_meters', w.distanceMeters);
        }
      }
    }

    const testResults = config.tests.map(test => {
      const value = metricBests.get(test.metric) ?? null;
      return {
        testId: test.id,
        value,
        status: evaluateTest(value, test),
      };
    });

    const overallStatus = worstStatus(testResults.map(r => r.status));

    soldiers.push({
      uid: userDoc.id,
      name: soldierName,
      status: overallStatus,
      testResults,
      lastActivityDate: lastDate,
    });
  }

  const green = soldiers.filter(s => s.status === 'green').length;
  const yellow = soldiers.filter(s => s.status === 'yellow').length;
  const red = soldiers.filter(s => s.status === 'red').length;

  return { unitId, green, yellow, red, total: soldiers.length, soldiers };
}
