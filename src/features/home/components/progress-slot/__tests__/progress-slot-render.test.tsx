// @vitest-environment jsdom
/**
 * Home progress slot (enable_home_progress_slot_v1, boards PG-1) — render + behaviour:
 *  - no running / walking plan → the strength card alone (no rail, no dots);
 *  - a running plan → strength ↔ running pair with two dots; dot tap + swipe move the page;
 *    the running card: plan ring, forecast, "שבוע N מתוך M", trend, green; tap → /progress/run;
 *  - a walking plan → the walking card in the shared orange;
 *  - strength tap → its progression map (or the hub strength page);
 *  - the active-minutes ring: minutes, change vs last week, split colours; tap → /progress;
 *  - the home page swaps all three surfaces on ONE flag and keeps the flag-off JSX.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  program: null as Record<string, unknown> | null,
  week: { current: null, previous: null, loading: true, error: false } as Record<string, unknown>,
  push: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } }, app: {}, storage: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: h.push, replace: () => {} }) }));
vi.mock('@/features/user', () => {
  const useUserStore = (sel?: (s: unknown) => unknown) => {
    const s = { profile: h.profile };
    return sel ? sel(s) : s;
  };
  return { useUserStore };
});
vi.mock('@/features/home/hooks/useProgramProgress', () => ({ useProgramProgress: () => h.program }));
vi.mock('@/features/home/hooks/useWeekActivitySummary', () => ({ useWeekActivitySummary: () => h.week }));
vi.mock('@/features/home/components/widgets/ProgramProgressCard', () => ({
  ProgramProgressCard: ({ programName }: { programName: string }) => <div data-program-card="">{programName}</div>,
}));
vi.mock('@/features/home/components/rows/ProgramProgressRow', () => ({
  ProgramProgressRow: () => <div data-program-row-ghost="" />,
}));

import { act } from 'react';
import { mount, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';
import HomeProgressSlotRow from '../HomeProgressSlotRow';
import ActivityMinutesRingCard from '../ActivityMinutesRingCard';

const kinds = (strength: number, run: number, walk: number) => ({
  strength: { count: 1, minutes: strength, km: 0, sets: 0 },
  run: { count: 1, minutes: run, km: 0, sets: 0 },
  walk: { count: 1, minutes: walk, km: 0, sets: 0 },
  other: { count: 0, minutes: 0, km: 0, sets: 0 },
});
const summary = (s: number, r: number, w: number) => ({
  workouts: 3, minutes: s + r + w, km: 0, steps: 0, activeDays: 3, byKind: kinds(s, r, w),
});

const RUNNING = {
  activeProgram: {
    currentWeek: 3,
    schedule: Array.from({ length: 24 }, (_, i) => ({ week: Math.floor(i / 3) + 1, status: i < 7 ? 'completed' : 'pending' })),
  },
  generatedProgramTemplate: { targetDistance: '5k', canonicalWeeks: 8 },
  paceProfile: {
    basePace: 360,
    qualityWorkoutsHistory: [{ date: new Date('2026-10-10T08:00:00'), impactOnBasePaceSeconds: -8 }],
  },
};

let m: Mounted | null = null;
const aside = <div data-consistency="" />;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-23T08:40:00'));
  h.profile = { running: null, lifestyle: {} };
  h.program = { programName: 'כל הגוף', programNameLoading: false, iconKey: 'muscle', currentLevel: 12, maxLevel: 15, progressPercent: 22, programCount: 1, programId: 'full_body' };
  h.week = { current: summary(96, 60, 28), previous: summary(80, 50, 32), loading: false, error: false };
  h.push.mockReset();
});
afterEach(() => {
  m?.unmount();
  m = null;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

describe('HomeProgressSlotRow', () => {
  it('no running / walking plan → the strength card alone, beside the bars, no dots', async () => {
    m = await mount(<HomeProgressSlotRow aside={aside} />);
    expect(q('[data-home-progress-slot]')?.getAttribute('data-home-progress-slot')).toBe('strength');
    expect(q('[data-v2-paged-carousel]')).toBeNull();
    expect(q('[data-program-card]')?.textContent).toBe('כל הגוף');
    expect(q('[data-home-plan-card]')).toBeNull();
    expect(q('[data-consistency]')).not.toBeNull();
    expect(document.querySelectorAll('[aria-current]').length).toBe(0);
  });

  it('strength card tap → the hub strength page (no map) / its progression map', async () => {
    m = await mount(<HomeProgressSlotRow aside={aside} />);
    await m.click('[data-home-strength-card]');
    expect(h.push).toHaveBeenLastCalledWith('/progress/strength');
    m.unmount();
    h.program = { ...h.program, programId: 'mFcuYlNgKXLqWVUFo0zt' };
    m = await mount(<HomeProgressSlotRow aside={aside} />);
    await m.click('[data-home-strength-card]');
    expect(h.push).toHaveBeenLastCalledWith('/progression-map/mFcuYlNgKXLqWVUFo0zt');
  });

  it('before the strength survey → the existing ghost row', async () => {
    h.program = null;
    m = await mount(<HomeProgressSlotRow aside={aside} />);
    expect(q('[data-program-row-ghost]')).not.toBeNull();
    expect(q('[data-home-strength-card]')).toBeNull();
  });

  it('a running plan → strength ↔ running with two dots; the running card in green', async () => {
    h.profile = { running: RUNNING, lifestyle: {} };
    m = await mount(<HomeProgressSlotRow aside={aside} />);
    expect(q('[data-home-progress-slot]')?.getAttribute('data-home-progress-slot')).toBe('run');
    const dots = Array.from(document.querySelectorAll('[data-v2-paged-carousel] > div:last-child button'));
    expect(dots.map((d) => d.getAttribute('aria-label'))).toEqual(['כרטיס 1 מתוך 2', 'כרטיס 2 מתוך 2']);
    expect(dots[0].getAttribute('aria-current')).toBe('true');

    const card = q('[data-home-plan-card="run"]')!;
    const text = card.textContent ?? '';
    expect(text).toContain('29%'); // 7 of 24 sessions
    expect(text).toContain('תחזית 5 ק״מ');
    expect(text).toContain('שבוע 3 מתוך 8');
    expect(text).toMatch(/מהיר ב-\d+:\d\d ב-30 יום/);
    expect(card.querySelector('circle[stroke="#84cc16"]')).not.toBeNull();

    await m.click(dots[1]);
    expect(dots[1].getAttribute('aria-current')).toBe('true');
    expect(dots[0].getAttribute('aria-current')).toBeNull();

    await m.click(card);
    expect(h.push).toHaveBeenLastCalledWith('/progress/run');
  });

  it('a swipe settles the dots on the resting page', async () => {
    h.profile = { running: RUNNING, lifestyle: {} };
    m = await mount(<HomeProgressSlotRow aside={aside} />);
    const rail = q('[data-v2-paged-carousel] > div:first-child')!;
    Object.defineProperty(rail, 'clientWidth', { configurable: true, value: 230 });
    rail.scrollLeft = -230;
    await act(async () => {
      rail.dispatchEvent(new Event('scroll'));
    });
    const dots = document.querySelectorAll('[data-v2-paged-carousel] > div:last-child button');
    expect(dots[1].getAttribute('aria-current')).toBe('true');
  });

  it('no basePace yet → the sessions count instead of a forecast', async () => {
    h.profile = { running: { ...RUNNING, paceProfile: undefined }, lifestyle: {} };
    m = await mount(<HomeProgressSlotRow aside={aside} />);
    const text = q('[data-home-plan-card="run"]')?.textContent ?? '';
    expect(text).toContain('תוכנית הריצה');
    expect(text).toContain('7/24 אימונים');
    expect(text).not.toContain('תחזית');
  });

  it('a walking plan → the walking card in the shared orange', async () => {
    h.profile = { running: null, lifestyle: { walkingGoal: { goal: 'health', targetWeeklyMinutes: 150 } } };
    m = await mount(<HomeProgressSlotRow aside={aside} />);
    const card = q('[data-home-plan-card="walk"]')!;
    expect(card.textContent).toContain('תוכנית ההליכה');
    expect(card.textContent).toContain('28 דק׳');
    expect(card.textContent).toContain('מתוך 150 דק׳ השבוע');
    expect(card.textContent).toContain('19%');
    expect(card.querySelector('circle[stroke="#f97316"]')).not.toBeNull();
    await m.click(card);
    expect(h.push).toHaveBeenLastCalledWith('/progress/run');
  });
});

describe('ActivityMinutesRingCard', () => {
  it('the week minutes, the change vs last week, split colours; tap → Progress', async () => {
    m = await mount(<ActivityMinutesRingCard />);
    const card = q('[data-home-minutes-ring="ready"]')!;
    expect(card.textContent).toContain('184');
    expect(card.textContent).toContain('דק׳ פעילות השבוע');
    expect(card.textContent).toMatch(/\+22\s*מול שבוע שעבר/);
    const strokes = Array.from(card.querySelectorAll('circle')).map((c) => c.getAttribute('stroke'));
    expect(strokes).toEqual(expect.arrayContaining(['#00baf7', '#84cc16', '#f97316']));
    await m.click(card);
    expect(h.push).toHaveBeenLastCalledWith('/progression');
  });

  it('loading → a quiet placeholder; error → a short message', async () => {
    h.week = { current: null, previous: null, loading: true, error: false };
    m = await mount(<ActivityMinutesRingCard />);
    expect(q('[data-home-minutes-ring="loading"]')).not.toBeNull();
    m.unmount();
    h.week = { current: null, previous: null, loading: false, error: true };
    m = await mount(<ActivityMinutesRingCard />);
    expect(q('[data-home-minutes-ring="error"]')?.textContent).toBe('לא הצלחנו לטעון את הדקות');
  });
});

describe('home page wiring (flag off = today)', () => {
  const page = readFileSync(join(process.cwd(), 'src/app/home/page.tsx'), 'utf8');
  it('one flag gates the three swaps, on v2 only', () => {
    expect(page).toContain('const progressSlotOn = featureFlags.enableHomeV2 && featureFlags.enableHomeProgressSlotV1;');
    expect(page).toContain("effectiveTab === 'strength' && progressSlotOn ? (");
    expect(page).toContain('{progressSlotOn ? <ActivityMinutesRingCard /> : <StepsSummaryCard variant="compact" />}');
    expect(page).toContain('{featureFlags.enableHomeV2 && !progressSlotOn && (');
  });
  it('the flag-off branch keeps today\'s program row + bars grid', () => {
    expect(page).toMatch(/\) : effectiveTab === 'strength' \? \([\s\S]{0,600}<ProgramProgressRow \/>\s*<ConsistencyWidget \/>/);
  });
});
