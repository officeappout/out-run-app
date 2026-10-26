/**
 * Place workouts UI (enable_place_workouts_v1, boards RP-13 phones 1–3):
 *  - key parity: every placeWorkouts.* key the folder uses exists in the Hebrew map catalog,
 *    and every placeWorkouts.* catalog key is used (no orphans), with no hard-coded Hebrew left;
 *  - the card copy (eyebrow / title / meta) and the sticky label, numbers through Intl;
 *  - "מה יש בדרך": start → points → climb → finish, with gaps; nothing known → no axis;
 *  - the rail renders the cards (dark plan card first, one start pill each) and at most one banner;
 *  - the hybrid card's intent is the map composer's own shape.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import he from '@/messages/he/map.json';
import { makeT } from '@/lib/i18n/t';
import { map } from '@/messages/ns/map';
import type { PlaceWorkoutSuggestion } from '@/features/workout-engine/place-fit';
import { placeWorkoutCopy, styleStrip, type MapT } from '../place-workout-copy';
import { routeAxisNodes } from '../route-axis';
import { hybridIntentFor } from '../place-hybrid-intent';
import PlaceWorkoutRail from '../PlaceWorkoutRail';
import { makeRoute, profileWithClimb, squareLoop } from '@/features/workout-engine/players/running/lib/route-fit/__tests__/fixtures';

vi.mock('@/hooks/useT', async () => {
  const { makeT: mk } = await import('@/lib/i18n/t');
  return { useT: (ns: Parameters<typeof mk>[1]) => mk('he', ns) };
});

const t = makeT('he', map) as unknown as MapT;
const DIR = join(__dirname, '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f === '__tests__') return [];
    return statSync(p).isDirectory() ? sources(p) : /\.tsx?$/.test(f) ? [p] : [];
  });
}

const sug = (over: Partial<PlaceWorkoutSuggestion>): PlaceWorkoutSuggestion => ({
  id: 'x', style: 'strength', isFromPlan: false, planTitle: null, durationMin: 20,
  meta: { kind: 'park_workout' }, reason: 'equipment',
  start: { kind: 'park_strength', parkId: 'p', difficulty: 'medium', minutes: 20 }, ...over,
});

describe('place workouts — catalog keys', () => {
  const catalog = he as Record<string, string>;
  const files = sources(DIR);
  const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  const used = new Set(Array.from(text.matchAll(/'(placeWorkouts\.[A-Za-z.]+)'/g)).map((m) => m[1]));

  it('every key used exists in he/map.json', () => {
    expect(used.size).toBeGreaterThan(30);
    Array.from(used).forEach((k) => expect(catalog[k], k).toBeTypeOf('string'));
  });

  it('every placeWorkouts.* catalog key is used', () => {
    const orphans = Object.keys(catalog).filter((k) => k.startsWith('placeWorkouts.') && !used.has(k));
    expect(orphans).toEqual([]);
  });

  it('no hard-coded Hebrew in the folder', () => {
    for (const f of files) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      expect(/[֐-׿]/.test(code), f).toBe(false);
    }
  });
});

describe('placeWorkoutCopy', () => {
  it('the plan card: "מהתוכנית שלך", the plan title, the generated workout on the meta line', () => {
    const c = placeWorkoutCopy(sug({ isFromPlan: true, planTitle: 'גוף מלא' }), t, { durationMin: 35, exerciseCount: 6 });
    expect(c).toMatchObject({ eyebrow: 'מהתוכנית שלך', title: 'גוף מלא', meta: '35 דק׳ · 6 תרגילים', minutes: 35 });
    expect(t('placeWorkouts.cta.sticky', { title: c.shortTitle, min: String(c.minutes) })).toBe('התחל · גוף מלא 35׳');
    expect(placeWorkoutCopy(sug({}), t, 'loading').meta).toBe('מכינים את האימון…');
  });

  it('alternatives: style eyebrow, style title, meta by kind', () => {
    const hybrid = placeWorkoutCopy(sug({ style: 'hybrid', meta: { kind: 'stop_at', km: 1.1 }, durationMin: 40, start: { kind: 'hybrid', aerobicKind: 'running', minutes: 40, routeId: 'r' } }), t);
    expect(hybrid).toMatchObject({ eyebrow: 'משולב · ריצה וכוח', title: 'ריצה + תחנת כוח', meta: '40 דק׳ · עצירה בק״מ 1.1' });
    const walkHybrid = placeWorkoutCopy(sug({ style: 'hybrid', meta: { kind: 'loop', minutes: 40 }, start: { kind: 'hybrid', aerobicKind: 'walking', minutes: 40, parkId: 'p' } }), t);
    expect(walkHybrid).toMatchObject({ eyebrow: 'משולב · הליכה וכוח', title: 'הליכה + תחנות כוח' });
    const short = placeWorkoutCopy(sug({ style: 'strength_short', durationMin: 15, meta: { kind: 'equipment', names: ['מתח', 'מקבילים'] } }), t);
    expect(short).toMatchObject({ eyebrow: 'כוח קצר', title: 'אימון קצר · 15 דק׳', meta: 'מתח · מקבילים' });
    const easy = placeWorkoutCopy(sug({ style: 'run_easy', durationMin: 30, meta: { kind: 'distance', km: 4.6, laps: null } }), t);
    expect(easy).toMatchObject({ eyebrow: 'ריצה', title: 'ריצה רציפה קלה', meta: '30 דק׳ · ~4.6 ק״מ' });
    const hills = placeWorkoutCopy(sug({ style: 'run_hills', isFromPlan: true, durationMin: 28, meta: { kind: 'hill_reps', reps: 5, climbAtKm: 2.3 } }), t);
    expect(hills).toMatchObject({ eyebrow: 'מהתוכנית שלך', title: '5 × עלייה', meta: '28 דק׳ · עלייה בק״מ 2.3' });
    const walk = placeWorkoutCopy(sug({ style: 'walk', isFromPlan: true, durationMin: 40, meta: { kind: 'distance', km: 4, laps: null } }), t);
    expect(walk.eyebrow).toBe('מתוכנית ההליכה');
    expect(styleStrip('hybrid').length).toBe(6);
  });
});

describe('routeAxisNodes', () => {
  it('start → water / park → climb → finish, km from the start and the gaps', () => {
    const path = squareLoop(4000);
    const r = makeRoute({
      id: 'r', distance: 4, path, routeShape: 'loop',
      elevationProfile: profileWithClimb(4000, 40, 2300, 400, 6),
      facilityStops: [{ id: 's', name: 'גינת רוקח', lat: path[2][1], lng: path[2][0], waypointIndex: 2, priority: 'high' as never, type: 'gym', stopType: 'pit-stop' }],
      nearbyAmenities: [{ amenityId: 'a', category: 'drinking_water', distanceFromPathMeters: 10, location: { lat: path[1][1], lng: path[1][0] } }],
    });
    const samples = { stepM: 40, elevationsM: profileWithClimb(4000, 40, 2300, 400, 6).elevationsM };
    const nodes = routeAxisNodes(r, samples, t);
    const kinds = nodes.map((n) => n.kind);
    expect(kinds[0]).toBe('start');
    expect(kinds[kinds.length - 1]).toBe('finish');
    expect([...kinds].sort()).toEqual(['climb', 'drinking_water', 'finish', 'start', 'stop']);
    // Ordered by km from the start, gaps = the distance from the previous node.
    const kms = nodes.map((n) => n.km);
    expect(kms).toEqual([...kms].sort((x, y) => x - y));
    expect(nodes.find((n) => n.kind === 'drinking_water')).toMatchObject({ km: 1, gapKm: 1 });
    expect(nodes[nodes.length - 1]).toMatchObject({ km: 4, label: 'סיום', note: 'חזרה לנקודת ההתחלה' });
    expect(nodes.find((n) => n.kind === 'climb')!.note).toMatch(/^\d+% · \d+ מ׳$/);
  });

  it('no points and no profile → no axis', () => {
    expect(routeAxisNodes(makeRoute({ id: 'bare', distance: 3, path: squareLoop(3000) }), null, t)).toEqual([]);
  });
});

describe('PlaceWorkoutRail', () => {
  it('renders the cards with a start pill each, the plan card dark, one banner', () => {
    const html = renderToStaticMarkup(
      <PlaceWorkoutRail
        title="מתאים לך כאן"
        subtitle="לפי המתקנים והרמה שלך"
        banner="climb_for_plan"
        suggestions={[
          sug({ id: 'a', isFromPlan: true, planTitle: 'גוף מלא' }),
          sug({ id: 'b', style: 'strength_short', durationMin: 15, meta: { kind: 'equipment', names: ['מתח'] } }),
        ]}
        lead={{ durationMin: 35, exerciseCount: 6 }}
        onStart={() => {}}
      />,
    );
    expect(html).toContain('מתאים לך כאן');
    expect(html).toContain('יש כאן עלייה שמתאימה לאימון העליות של היום');
    expect(html).toContain('35 דק׳ · 6 תרגילים');
    expect(html.match(/<button/g)?.length).toBe(2);
    expect(html).toContain('התחל אימון');
    expect(html).toContain('linear-gradient(160deg, #0e1419, #24323d)');
    expect(html).not.toContain('placeWorkouts.');
  });

  it('nothing to suggest → nothing rendered', () => {
    expect(renderToStaticMarkup(<PlaceWorkoutRail title="x" subtitle="y" banner={null} suggestions={[]} onStart={() => {}} />)).toBe('');
  });
});

describe('hybridIntentFor', () => {
  it('route → route_stops on that route; park → the smart walk through that park', () => {
    expect(hybridIntentFor({ kind: 'hybrid', aerobicKind: 'running', minutes: 40, routeId: 'r1' }, null))
      .toMatchObject({ mode: 'route_stops', smart: { routeId: 'r1' }, timeBudgetMin: 40, aerobicKind: 'running' });
    expect(hybridIntentFor({ kind: 'hybrid', aerobicKind: 'walking', minutes: 40, parkId: 'p1' }, null))
      .toMatchObject({ mode: 'smart_walk_strength', smart: { parkId: 'p1' }, aerobicKind: 'walking' });
  });
});

describe('enable_place_workouts_v1', () => {
  it('off by default, super admins preview it, and it lives inside enable_home_v2', async () => {
    const { FLAG_DEFS } = await import('@/hooks/feature-flag-defs');
    const { isPlaceWorkoutsOn } = await import('../hooks/usePlaceWorkoutsFlag');
    expect(FLAG_DEFS.find((d) => d.firestoreKey === 'enable_place_workouts_v1')).toMatchObject({ key: 'enablePlaceWorkoutsV1', defaultValue: false, superAdminValue: true });
    expect(isPlaceWorkoutsOn({ enableHomeV2: true, enablePlaceWorkoutsV1: true })).toBe(true);
    expect(isPlaceWorkoutsOn({ enableHomeV2: false, enablePlaceWorkoutsV1: true })).toBe(false);
    expect(isPlaceWorkoutsOn({ enableHomeV2: true })).toBe(false);
  });
});
