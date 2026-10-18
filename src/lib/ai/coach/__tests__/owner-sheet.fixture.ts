/** The owner's week from the 18.10.2026 review: FOUR planned workouts (Sun 18:00, Mon, Wed 07:30, Fri). */
import type { UserContextSheet } from '../context-sheet';

export const OWNER_SHEET: UserContextSheet = {
  firstName: 'דוד',
  gender: 'male',
  ageBand: '30-44',
  goals: { mainGoal: null, selected: [] },
  primaryTrack: null,
  programs: [
    { id: 'calisthenics_upper', name: 'קליסטניקס פלג גוף עליון', level: 13, percentToNext: 20 },
    { id: 'full_body', name: 'גוף מלא', level: 15, percentToNext: 40 },
  ],
  injuries: [],
  streakDays: 2,
  lastWorkouts: [{ date: '2026-10-16', type: 'strength', minutes: 32 }],
  today: [{ date: '2026-10-18', type: 'training', programs: ['גוף מלא'], startTime: '18:00', completed: false, title: null }],
  thisWeek: [
    { date: '2026-10-18', type: 'training', programs: ['גוף מלא'], startTime: '18:00', completed: false, title: null },
    { date: '2026-10-19', type: 'training', programs: ['גוף מלא'], startTime: null, completed: false, title: null },
    { date: '2026-10-21', type: 'training', programs: ['גוף מלא'], startTime: '07:30', completed: false, title: null },
    { date: '2026-10-23', type: 'training', programs: ['גוף מלא'], startTime: null, completed: false, title: null },
  ],
  preferredTrainingTime: '18:00',
  equipment: { home: ['5Rkhxawxj8EwC4spTXVM', 'I1K30JehaxSx8dlBOZyd'], office: [], outdoor: [] },
  area: null,
};

