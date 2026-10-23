/**
 * Progress hub v2 — static-markup render tests (node env, no jsdom):
 *   - flag gate: ProgressionScreen picks hub / v2 tab / v1
 *   - domain cards: colours (steps orange, running green, walking orange) and
 *     card navigation (the captured onOpen pushes the /progress/* route)
 *   - steps page pieces render real numbers in orange.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const push = vi.fn();
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace, back: vi.fn() }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null } }));

const flagState = { ready: true, flags: { enableHomeV2: true, enableProgressHubV2: true } as Record<string, boolean> };
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ ...flagState, loading: !flagState.ready }) }));

vi.mock('@/features/progression-hub/v2/hub/ProgressHubScreen', () => ({ default: () => h('i', { 'data-screen': 'hub' }) }));
vi.mock('@/features/progression-hub/v2/components/ProgressScreenV2', () => ({ default: () => h('i', { 'data-screen': 'v2' }) }));
vi.mock('@/components/ui/AppHeader', () => ({ default: () => h('i', { 'data-screen': 'v1-header' }) }));
vi.mock('@/features/progression-map/hooks/useProgressHubBuckets', () => ({ useProgressHubBuckets: () => ({ ready: false, buckets: {} }) }));
vi.mock('@/features/user/progression/components/IdentityHeroCard', () => ({ IdentityHeroCard: () => null }));

const programProgress = { current: null as null | Record<string, unknown> };
vi.mock('@/features/home/hooks/useProgramProgress', () => ({ useProgramProgress: () => programProgress.current }));

const walkWeek = { data: null as null | { planned: number; done: number; pct: number } };
vi.mock('@/features/progression-hub/v2/hub/model/useWalkPlanWeek', () => ({ useWalkPlanWeek: () => ({ data: walkWeek.data, loading: false }) }));

import { ProgressionScreen } from '../../../components/ProgressionScreen';
import DomainCard from '../components/DomainCard';
import StrengthDomainCard from '../cards/StrengthDomainCard';
import RunDomainCard from '../cards/RunDomainCard';
import StepsDomainCard from '../cards/StepsDomainCard';
import StepsHeroCard from '../steps/StepsHeroCard';
import StepsLast30Card from '../steps/StepsLast30Card';
import HubPageShell from '../components/HubPageShell';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { periodRanges } from '../../utils/progress-period';
import { lastNDays, stepsHero } from '../steps/steps-hub.model';

const NOW = new Date(2026, 9, 22, 12);
const kind = (over: Partial<{ count: number; minutes: number; km: number; sets: number }> = {}) => ({ count: 0, minutes: 0, km: 0, sets: 0, ...over });

beforeEach(() => {
  push.mockReset();
  flagState.ready = true;
  flagState.flags = { enableHomeV2: true, enableProgressHubV2: true };
  programProgress.current = null;
  walkWeek.data = null;
  useUserStore.setState({ profile: null } as never);
});

describe('flag gate', () => {
  it('hub on (home v2 + hub v2) → the hub screen', () => {
    expect(renderToStaticMarkup(h(ProgressionScreen))).toContain('data-screen="hub"');
  });
  it('hub flag off, home v2 on → exactly today\'s v2 tab', () => {
    flagState.flags = { enableHomeV2: true, enableProgressHubV2: false };
    expect(renderToStaticMarkup(h(ProgressionScreen))).toContain('data-screen="v2"');
  });
  it('home v2 off → v1 even with the hub flag on', () => {
    flagState.flags = { enableHomeV2: false, enableProgressHubV2: true };
    const html = renderToStaticMarkup(h(ProgressionScreen));
    expect(html).toContain('data-screen="v1-header"');
    expect(html).not.toContain('data-screen="hub"');
  });
  it('deeper page shell: hub off → skeleton only, no page', () => {
    flagState.flags = { enableHomeV2: true, enableProgressHubV2: false };
    const off = renderToStaticMarkup(h(HubPageShell, { kind: 'steps', title: 'T' }, h('p', null, 'body')));
    expect(off).not.toContain('body');
    flagState.flags = { enableHomeV2: true, enableProgressHubV2: true };
    const on = renderToStaticMarkup(h(HubPageShell, { kind: 'steps', title: 'T' }, h('p', null, 'body')));
    expect(on).toContain('body');
    expect(on).toContain('aria-label="חזרה"');
    expect(on).toContain('data-hub-page="steps"');
  });
});

describe('domain cards', () => {
  it('ring colour per domain: steps orange, run green', () => {
    const steps = renderToStaticMarkup(h(DomainCard, { kind: 'steps', title: 'S', pct: 78, lines: ['a'], onOpen: () => {}, ariaLabel: 'x', locale: 'he' }));
    expect(steps).toContain('stroke="#f97316"');
    const run = renderToStaticMarkup(h(DomainCard, { kind: 'run', title: 'R', pct: 38, lines: ['a'], onOpen: () => {}, ariaLabel: 'x', locale: 'he' }));
    expect(run).toContain('stroke="#84cc16"');
    expect(run).toContain('38');
  });

  it('strength card: level line and % to next level', () => {
    programProgress.current = { programName: 'כל הגוף', currentLevel: 12, maxLevel: 15, progressPercent: 22 };
    const html = renderToStaticMarkup(h(StrengthDomainCard, { period: 'week', workouts: 3 }));
    expect(html).toContain('כל הגוף · רמה 12 מתוך 15');
    expect(html).toContain('עוד 78% לרמה 13');
    expect(html).toContain('השבוע: 3 אימוני כוח');
    expect(html).toContain('data-hub-card="strength"');
  });

  it('running card: walking variant (orange) when there is no running plan and walks are planned', () => {
    walkWeek.data = { planned: 5, done: 4, pct: 80 };
    const html = renderToStaticMarkup(h(RunDomainCard, { period: 'week', run: kind(), walk: kind({ count: 2, km: 6.4 }) }));
    expect(html).toContain('data-hub-card="walk"');
    expect(html).toContain('stroke="#f97316"');
    expect(html).toContain('הליכות השבוע: 4 מתוך 5');
    expect(html).toContain('6.4 ק״מ');
  });

  it('running card without a plan: the period km, green, no ring', () => {
    const html = renderToStaticMarkup(h(RunDomainCard, { period: 'month', run: kind({ count: 1, km: 5 }), walk: kind() }));
    expect(html).toContain('data-hub-card="run"');
    expect(html).toContain('החודש: 5 ק״מ · ריצה אחת');
    expect(html).toContain('אין תוכנית ריצה פעילה');
  });

  it('steps card: today of goal, the period average, days in goal', () => {
    const r = periodRanges('week', NOW).current;
    const d = (date: string, steps: number) => ({ date, steps, stepsGoal: 8000, distanceMeters: 0, activeMinutes: 0 });
    const html = renderToStaticMarkup(h(StepsDomainCard, { period: 'week', days: [d('2026-10-18', 9000), d('2026-10-22', 6240)], current: r, now: NOW }));
    expect(html).toContain('6,240 מתוך 8,000 היום');
    expect(html).toContain('ממוצע השבוע 7,620');
    expect(html).toContain('1 מתוך 5 ימים ביעד');
  });
});

describe('card navigation', () => {
  it('each card opens its /progress/* page', async () => {
    const captured: Array<() => void> = [];
    vi.resetModules();
    vi.doMock('../components/DomainCard', () => ({
      default: (p: { onOpen: () => void }) => {
        captured.push(p.onOpen);
        return null;
      },
    }));
    const S = (await import('../cards/StrengthDomainCard')).default;
    const R = (await import('../cards/RunDomainCard')).default;
    const St = (await import('../cards/StepsDomainCard')).default;
    renderToStaticMarkup(h(S, { period: 'week', workouts: 0 }));
    renderToStaticMarkup(h(R, { period: 'week', run: kind(), walk: kind() }));
    renderToStaticMarkup(h(St, { period: 'week', days: [], current: periodRanges('week', NOW).current, now: NOW }));
    captured.forEach((open) => open());
    expect(push.mock.calls.map((c) => c[0])).toEqual(['/progress/strength', '/progress/run', '/progress/steps']);
    vi.doUnmock('../components/DomainCard');
  });
});

describe('steps page pieces', () => {
  const snaps = [
    { date: '2026-10-15', steps: 7200, floors: 0, stepsGoalMet: false, floorsGoalMet: false, stepsGoal: 8000, floorsGoal: 0, distanceMeters: 0 },
    { date: '2026-10-22', steps: 6240, floors: 0, stepsGoalMet: false, floorsGoalMet: false, stepsGoal: 8000, floorsGoal: 0, distanceMeters: 4400 },
  ];
  it('hero: orange ring, steps of goal, what is left and the km', () => {
    const html = renderToStaticMarkup(
      h(StepsHeroCard, { hero: stepsHero(snaps, 'week', 0, 8000), isDay: false, dayOffset: 0, snapshots: snaps, onPickDay: () => {} }),
    );
    expect(html).toContain('stroke="#f97316"');
    expect(html).toContain('6,240');
    expect(html).toContain('מתוך 8,000 צעדים');
    expect(html).toContain('עוד 1,760 צעדים');
    expect(html).toContain('4.4 ק״מ');
  });
  it('last 30 days: legend + count in goal', () => {
    const html = renderToStaticMarkup(h(StepsLast30Card, { cells: lastNDays(snaps, NOW, 30) }));
    expect(html).toContain('30 הימים האחרונים');
    expect(html).toContain('אין ימים ביעד');
    expect((html.match(/<li /g) ?? []).length).toBe(30);
  });
});
