import type { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

/**
 * Human-readable, already-localized activity label for a WorkoutHistoryEntry
 * — DeleteWorkoutConfirmModal's `activityLabel` prop wants exactly this
 * shape (its own doc comment example: "אימון כוח", "ריצה", "הליכה + כוח").
 *
 * Moved here from profile/page.tsx (F2.1, 19.08.2026 — "unified workout
 * summary" plan) when its in-page delete-confirm flow moved to
 * /workouts/[id]/history, which needs the exact same labels.
 */
export function workoutActivityLabel(workoutType: WorkoutHistoryEntry['workoutType']): string {
  switch (workoutType) {
    case 'running':
      return 'ריצה';
    case 'walking':
      return 'הליכה';
    case 'cycling':
      return 'רכיבה';
    case 'hybrid':
      return 'אימון משולב';
    case 'strength':
      return 'אימון כוח';
    case 'recovery':
      return 'אימון התאוששות';
    default:
      return 'אימון';
  }
}

/**
 * DeleteWorkoutConfirmModal's `dateLabel` prop wants an already-formatted,
 * human string (its own doc comment example: "12.08.2026"). dot-separated,
 * zero-padded day/month.
 */
export function workoutDateLabel(date: Date): string {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${day}.${month}.${d.getFullYear()}`;
}
