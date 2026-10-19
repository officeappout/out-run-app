/** Deterministic composed-session fixtures for the overview parity snapshots. */

const ex = (id: string, name: string, role?: string) => ({
  exercise: { id, name, exerciseRole: role, execution_methods: [] },
  exerciseRole: role,
  sets: 3,
  reps: 10,
});

const station = (i: number, domainFocus: string, opts: { locked?: boolean } = {}) => ({
  index: i,
  kind: 'strength' as const,
  domainFocus,
  activityType: 'strength',
  estCalories: 40,
  durationSec: 600,
  content: opts.locked
    ? { needsAssessment: { assessmentDomains: ['push'] }, exercises: [] }
    : {
        estimatedDurationSec: 600,
        exercises: [ex(`w${i}`, 'סיבובי ידיים', 'warmup'), ex(`m${i}a`, 'שכיבות סמיכה'), ex(`m${i}b`, 'מתח'), ex(`c${i}`, 'מתיחת חזה', 'cooldown')],
      },
});

const leg = (i: number, km: number, sec: number, aerobicType = 'walking') => ({
  index: i, kind: 'aerobic' as const, aerobicType, zone: 'walk', distanceKm: km, durationSec: sec,
  targetPaceSecPerKm: { min: 590, max: 610 }, estCalories: 60,
});

const totals = (aerobicMin: number, strengthMin: number, distanceKm: number) => ({
  aerobicMin, strengthMin, distanceKm, estCalories: 220, stations: 1,
});
const meta = { emphasisResolved: 'balanced', whoGapNote: null, usedFieldFallback: false, insufficientHomeContent: false, skippedFieldFallback: false, log: [] };

export function routeStopsFixture() {
  const plan = { segments: [leg(0, 1.2, 900), station(1, 'push'), leg(2, 1.4, 1000), station(3, 'pull', { locked: true }), leg(4, 0.8, 600)], totals: totals(41, 20, 3.4), meta };
  return {
    plan,
    routePath: [[34.78, 32.08], [34.79, 32.09]],
    aerobicKind: 'walking',
    station: { lat: 32.08, lng: 34.78, name: 'גינת כושר רוקח' },
    bolts: { plans: [plan, plan, plan], selectedIndex: 1, labels: ['קליל', 'מאוזן', 'עוצמתי'] },
    fullParkRun: false,
    roundTrip: { walkThereMin: 4, walkBackMin: 5, there: null, back: null },
  };
}

export function fullParkFixture() {
  const mk = (m: number) => ({ segments: [leg(0, 1, 600 + m, 'running'), station(1, 'legs'), leg(2, 1, 600, 'running')], totals: totals(20 + m / 60, 15, 2), meta });
  const plans = [mk(0), mk(120), mk(240)];
  return {
    plan: plans[1],
    routePath: [],
    aerobicKind: 'running',
    station: { lat: 32.08, lng: 34.78, name: 'פארק הירקון' },
    bolts: { plans, selectedIndex: 1, labels: ['קליל', 'מאוזן', 'עוצמתי'] },
  };
}

export function budgetSplitFixture() {
  return {
    plan: { segments: [leg(0, 1.5, 1100), station(1, 'core'), leg(2, 1.5, 1100)], totals: totals(37, 10, 3), meta },
    routePath: [],
    aerobicKind: 'walking',
    fallbackHint: 'אימון כוח מהבית במקום תחנה',
  };
}
