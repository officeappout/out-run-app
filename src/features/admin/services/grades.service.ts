/**
 * PE Grades Service
 *
 * Manages physical-education grading for educational tenants.
 *
 * Firestore doc schema — pe_grades/{uid}_{term}:
 * {
 *   uid:            string,
 *   term:           string,       // e.g. "2026_A" (year + semester)
 *   unitId:         string,       // class/unit the student belongs to
 *   tenantId:       string,
 *   autoScore:      number,       // 0-100, derived from activity data
 *   manualGrade:    number | null, // 0-100, teacher override
 *   finalGrade:     number,       // weighted: 70% auto + 30% manual (or 100% auto if no manual)
 *   updatedAt:      Timestamp,
 *   updatedBy:      string,       // teacher uid
 * }
 */

import {
  doc, getDoc, setDoc, collection, query, where,
  getDocs, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Types ─────────────────────────────────────────────────────────────

export interface PEGrade {
  uid: string;
  term: string;
  unitId: string;
  tenantId: string;
  autoScore: number;
  manualGrade: number | null;
  finalGrade: number;
  updatedAt?: any;
  updatedBy?: string;
}

export interface StudentGradeRow {
  uid: string;
  name: string;
  autoScore: number;
  manualGrade: number | null;
  finalGrade: number;
  totalXP: number;
  totalWorkouts: number;
  totalMinutes: number;
}

// ── Auto-Score Calculation ────────────────────────────────────────────

const AUTO_WEIGHT = 0.7;
const MANUAL_WEIGHT = 0.3;

/**
 * Compute an auto-score (0-100) for a student relative to the class.
 * Uses a combination of XP, workout count, and active minutes.
 * Normalized against the class maximum to produce a percentile-like score.
 */
function computeAutoScore(
  xp: number,
  workouts: number,
  minutes: number,
  classMaxXP: number,
  classMaxWorkouts: number,
  classMaxMinutes: number,
): number {
  if (classMaxXP === 0 && classMaxWorkouts === 0 && classMaxMinutes === 0) return 0;

  const normXP = classMaxXP > 0 ? Math.min(xp / classMaxXP, 1) : 0;
  const normWorkouts = classMaxWorkouts > 0 ? Math.min(workouts / classMaxWorkouts, 1) : 0;
  const normMinutes = classMaxMinutes > 0 ? Math.min(minutes / classMaxMinutes, 1) : 0;

  // Weighted: 50% XP, 30% workouts, 20% minutes
  const raw = normXP * 0.5 + normWorkouts * 0.3 + normMinutes * 0.2;
  return Math.round(raw * 100);
}

function computeFinalGrade(autoScore: number, manualGrade: number | null): number {
  if (manualGrade === null || manualGrade === undefined) return autoScore;
  return Math.round(autoScore * AUTO_WEIGHT + manualGrade * MANUAL_WEIGHT);
}

// ── Data Fetching ─────────────────────────────────────────────────────

/**
 * Load all students in a unit and compute their grades for a given term.
 * Reads existing pe_grades docs for manual overrides, then computes
 * auto-scores from user progression data.
 */
export async function getClassGrades(
  unitId: string,
  tenantId: string,
  term: string,
): Promise<StudentGradeRow[]> {
  // 1. Load students in this unit
  const usersSnap = await getDocs(query(
    collection(db, 'users'),
    where('core.unitId', '==', unitId),
  ));

  if (usersSnap.empty) return [];

  // 2. Load existing grade docs for this term
  const existingGrades = new Map<string, PEGrade>();
  const gradesSnap = await getDocs(query(
    collection(db, 'pe_grades'),
    where('unitId', '==', unitId),
    where('term', '==', term),
  ));
  for (const gDoc of gradesSnap.docs) {
    const data = gDoc.data() as PEGrade;
    existingGrades.set(data.uid, data);
  }

  // 3. Gather activity metrics per student
  interface StudentMetrics {
    uid: string;
    name: string;
    xp: number;
    workouts: number;
    minutes: number;
  }

  const metrics: StudentMetrics[] = [];

  for (const userDoc of usersSnap.docs) {
    const userData = userDoc.data();
    const core = (userData.core ?? {}) as Record<string, any>;
    const progression = (userData.progression ?? {}) as Record<string, any>;

    const xp = typeof progression.globalXP === 'number' ? progression.globalXP : 0;

    // Count workouts for this term
    const wSnap = await getDocs(query(
      collection(db, 'workouts'),
      where('userId', '==', userDoc.id),
    ));

    let totalMinutes = 0;
    let workoutCount = 0;
    for (const wDoc of wSnap.docs) {
      const w = wDoc.data();
      workoutCount++;
      if (typeof w.durationMinutes === 'number') {
        totalMinutes += w.durationMinutes;
      }
    }

    metrics.push({
      uid: userDoc.id,
      name: core.name ?? 'ללא שם',
      xp,
      workouts: workoutCount,
      minutes: totalMinutes,
    });
  }

  // 4. Compute class maximums for normalization
  const classMaxXP = Math.max(...metrics.map(m => m.xp), 1);
  const classMaxWorkouts = Math.max(...metrics.map(m => m.workouts), 1);
  const classMaxMinutes = Math.max(...metrics.map(m => m.minutes), 1);

  // 5. Build grade rows
  return metrics.map(m => {
    const autoScore = computeAutoScore(
      m.xp, m.workouts, m.minutes,
      classMaxXP, classMaxWorkouts, classMaxMinutes,
    );
    const existing = existingGrades.get(m.uid);
    const manualGrade = existing?.manualGrade ?? null;
    const finalGrade = computeFinalGrade(autoScore, manualGrade);

    return {
      uid: m.uid,
      name: m.name,
      autoScore,
      manualGrade,
      finalGrade,
      totalXP: m.xp,
      totalWorkouts: m.workouts,
      totalMinutes: Math.round(m.minutes),
    };
  });
}

// ── Save Grades ───────────────────────────────────────────────────────

/**
 * Save manual grade overrides for a batch of students.
 * Re-computes the finalGrade on save.
 */
export async function saveManualGrades(
  grades: { uid: string; autoScore: number; manualGrade: number | null }[],
  unitId: string,
  tenantId: string,
  term: string,
  teacherUid: string,
): Promise<void> {
  const batch = writeBatch(db);

  for (const g of grades) {
    const docId = `${g.uid}_${term}`;
    const finalGrade = computeFinalGrade(g.autoScore, g.manualGrade);

    batch.set(doc(db, 'pe_grades', docId), {
      uid: g.uid,
      term,
      unitId,
      tenantId,
      autoScore: g.autoScore,
      manualGrade: g.manualGrade,
      finalGrade,
      updatedAt: serverTimestamp(),
      updatedBy: teacherUid,
    }, { merge: true });
  }

  await batch.commit();
}

// ── Helpers ───────────────────────────────────────────────────────────

export function getCurrentTerm(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  // Sep-Jan = semester A, Feb-Jun = semester B
  const semester = month >= 8 || month <= 0 ? 'A' : 'B';
  return `${year}_${semester}`;
}

export function getTermLabel(term: string): string {
  const [year, sem] = term.split('_');
  return `${sem === 'A' ? 'סמסטר א׳' : 'סמסטר ב׳'} ${year}`;
}
