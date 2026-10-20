import type { LifePersona } from '../persona';

/** A hybrid persona: strength Sun/Tue/Thu evening, a run Mon/Wed morning, a walk Fri. */
export function persona(over: Partial<LifePersona> = {}): LifePersona {
  return {
    uid: 'demo_t01',
    key: 't01',
    name: 'נועה ל.',
    gender: 'female',
    age: 34,
    tone: 'office_worker',
    adherence: 1,
    shareRate: 1,
    stepGoal: 8000,
    parkUser: true,
    authorityId: 'demo-tlv',
    neighborhoodId: 'demo-tlv-n1',
    tenantId: 'demo-tlv',
    unitId: null,
    groupIds: ['demo-grp-tlv-run'],
    home: { lat: 32.09, lng: 34.78 },
    park: { id: 'realPark1', name: 'פארק הירקון', lat: 32.1, lng: 34.8 },
    runLevel: 'intermediate',
    sessions: [
      { dow: 0, i: 0, kind: 'strength', slug: 'full_body', minutes: 40, title: 'כל הגוף', start: '18:00' },
      { dow: 1, i: 0, kind: 'run', slot: 'easy_run', minutes: 35, title: 'ריצה קלה', start: '07:00' },
      { dow: 2, i: 0, kind: 'strength', slug: 'push', minutes: 45, title: 'דחיפה', start: '18:00' },
      { dow: 2, i: 1, kind: 'mobility', minutes: 15, title: 'גמישות', start: '21:00' },
      { dow: 3, i: 0, kind: 'run', slot: 'long_run', minutes: 70, title: 'ריצה ארוכה', start: '07:00' },
      { dow: 4, i: 0, kind: 'strength', slug: 'pull', minutes: 45, title: 'משיכה', start: '18:00' },
      { dow: 5, i: 0, kind: 'walk', minutes: 40, title: 'הליכה מהירה', start: '08:00' },
    ],
    ...over,
  };
}

/** 2026-10-20 is a Tuesday (Israel, UTC+3 until 25.10). */
export const TUE = '2026-10-20';
export const at = (hhmm: string, date = TUE) => Date.parse(`${date}T${hhmm}:00+03:00`);
