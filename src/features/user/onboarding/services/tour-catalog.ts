/**
 * The tours list ("סיורים באפליקציה") — every replayable tour with a name and one line, in the
 * order a new user meets them. Shown by the help hub and the search Help tab (ai_coach_round4);
 * Kelly's tour chips name the same tours. Pure data; every replayable tour is listed exactly once
 * (unit-tested).
 */
import type { ReplayableTour } from './tour-replay';

export interface TourCatalogEntry {
  id: ReplayableTour;
  name: string;
  /** One line under the name. */
  line: string;
}

export const TOUR_CATALOG: readonly TourCatalogEntry[] = [
  { id: 'home', name: 'מסך הבית', line: 'האימון של היום, הכפתור + והשבוע שלך' },
  { id: 'plan', name: 'בחירת תוכנית', line: 'איך בוחרים תוכנית כוח או ריצה' },
  { id: 'map', name: 'המפה', line: 'חיפוש, מה רואים במפה ופארקים' },
  { id: 'route', name: 'מסלול עם עצירות כוח', line: 'כרטיס המסלול, עצירות הכוח ויציאה לדרך' },
  { id: 'route-player', name: 'במהלך מסלול', line: 'איך מסיימים בלי לעצור בטעות' },
  { id: 'player', name: 'נגן האימון', line: 'הפסים למעלה, הסבר התרגיל ו״סיימתי״' },
  { id: 'station', name: 'תחנת כוח', line: 'מתחילים, זמן או חזרות, עצירה ודילוג' },
  { id: 'community', name: 'הליגה', line: 'הליגה של השכונה והזמנת חבר' },
];

export function tourCatalogEntry(id: ReplayableTour): TourCatalogEntry {
  return TOUR_CATALOG.find((t) => t.id === id) ?? { id, name: id, line: '' };
}
