// @vitest-environment jsdom
/**
 * i18n wave 2B (namespace `schedule`, keys `drawer.*`): Hebrew markup parity of ScheduleBuilderDrawer (+ its V2 sheet shell).
 * Snapshots recorded BEFORE the extraction, from unmodified origin/main. jsdom + the shared harness
 * (src/features/user/onboarding/components/steps/__tests__/i18n-dom-harness.tsx): the advisor, the save service,
 * the profile and the heavy children are driven by hand; `<!-- -->` is stripped.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, motionStub, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';

const S = vi.hoisted(() => ({
  v2: false,
  saveEnabled: false,
  profile: { id: 'u1', core: {} } as Record<string, unknown> | null,
  locks: { strength: false, running: false, mixed: false },
  controls: { mode: 'mixed', focus: 50, availableDayCount: 3 } as { mode: string; focus: number; availableDayCount: number },
  advice: null as unknown,
  outcome: { ok: true } as Record<string, unknown>,
  savePending: null as null | Promise<Record<string, unknown>>,
  runningTime: undefined as string | undefined,
}));

vi.mock('framer-motion', () => ({
  ...motionStub,
  useMotionValue: (v: number) => ({ get: () => v, set: () => {}, on: () => () => {} }),
  useTransform: () => ({ get: () => 1, on: () => () => {} }),
  useDragControls: () => ({ start: () => {} }),
  animate: () => {},
}));
vi.mock('lucide-react', () => {
  const icon = () => null;
  return { X: icon, Lock: icon, Sunrise: icon, Sun: icon, Sunset: icon, Clock: icon };
});
vi.mock('@/lib/haptics', () => ({ hapticTap: () => {} }));
vi.mock('@/components/ui/DrumTimePicker', () => ({ DrumTimePicker: ({ value }: { value: string }) => <div data-drum={value} /> }));
vi.mock('@/hooks/useSheetScrollChain', () => ({ useSheetScrollChain: () => ({ scrollRef: { current: null } }) }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: { enableHomeV2: S.v2 } }) }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel: (s: { profile: unknown }) => unknown) =>
    sel({
      profile: S.profile
        ? { ...S.profile, lifestyle: S.runningTime ? { reminders: { runningTime: S.runningTime } } : undefined }
        : null,
    }),
}));
vi.mock('@/lib/resolveTabLocks', () => ({ resolveTabLocks: () => S.locks }));
vi.mock('@/lib/who-strength-target', () => ({ WHO_STRENGTH_TARGET_DAYS: 2 }));
vi.mock('@/features/home/components/agenda/AgendaDayCard', () => ({
  default: (p: { date: string; runningOverride?: { name: string; category: string } | null; scheduleMap?: Record<string, unknown[]> }) => (
    <div data-agenda-day={p.date} data-strength={String(Object.values(p.scheduleMap ?? {}).flat().length)}>
      {p.runningOverride ? `${p.runningOverride.name}|${p.runningOverride.category}` : ''}
    </div>
  ),
}));
vi.mock('@/features/parks/core/components/hybrid/AerobicStrengthSlider', () => ({ default: () => <div data-slider /> }));
vi.mock('@/features/schedule/engine/weaverInput', () => ({ defaultWeaveControls: () => S.controls }));
vi.mock('@/features/schedule/engine/strengthVocabulary', () => ({ scheduleIdNameHe: (id: string) => `שם-${id}` }));
vi.mock('@/features/schedule/advisor/advisor', () => ({ adviseWeek: () => S.advice }));
vi.mock('@/features/schedule/advisor/adapters/client', () => ({ toAdvisorInputFromClient: () => ({}), localDateKey: () => '2026-10-19' }));
vi.mock('@/features/schedule/services/scheduleBuilderSave.plan', () => ({ planScheduleSave: () => ({}) }));
vi.mock('@/features/schedule/services/scheduleBuilderSave', () => ({
  isScheduleBuilderSaveEnabled: () => S.saveEnabled,
  saveScheduleProposal: () => S.savePending ?? Promise.resolve(S.outcome),
}));
vi.mock('@/features/workout-engine/services/program-hierarchy.utils', () => ({ resolveToSlug: (s: string) => s }));

import ScheduleBuilderDrawer from '../ScheduleBuilderDrawer';

const snap = (name: string) => `./__snapshots__/schedule-drawer-i18n/${name}.html`;
let mounted: Mounted | null = null;

const strengthDay = (dayOfWeek: number, ids: string[]) => ({
  dayOfWeek,
  sessions: ids.map((skillId) => ({ skillId, volumePercent: 100, sessionType: 'FULL' })),
  isRestDay: ids.length === 0,
  warnings: [],
});
const runDay = (dayOfWeek: number, category: string | null) => ({ dayOfWeek, category });

const advice = (over: Record<string, unknown> = {}) => ({
  controls: { mode: 'mixed', focus: 50, availableDayCount: 3 },
  week: {
    strength: [strengthDay(0, ['FULL_BODY']), strengthDay(2, ['UPPER_BODY', 'PLANCHE']), strengthDay(4, [])],
    running: [runDay(1, 'easy_run'), runDay(2, 'long_run'), runDay(3, 'tempo'), runDay(5, null)],
  },
  days: [],
  sharedDays: [
    { dayOfWeek: 2, order: 'running-first' },
    { dayOfWeek: 4, order: 'strength-first' },
  ],
  reductions: [],
  periodization: {},
  reasons: [],
  notes: ['הערה ראשונה.', 'הערה שנייה.'],
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T10:00:00'));
  S.v2 = false;
  S.saveEnabled = false;
  S.profile = { id: 'u1', core: {} };
  S.locks = { strength: false, running: false, mixed: false };
  S.controls = { mode: 'mixed', focus: 50, availableDayCount: 3 };
  S.advice = advice();
  S.outcome = { ok: true };
  S.savePending = null;
  S.runningTime = undefined;
});
afterEach(() => {
  mounted?.unmount();
  mounted = null;
  vi.useRealTimers();
});

const open = async (entry?: 'planner' | 'second_track') => {
  const m = (mounted = await mount(<ScheduleBuilderDrawer isOpen onClose={() => {}} entry={entry} />));
  return m;
};

describe('ScheduleBuilderDrawer — preview (save flag off)', () => {
  it.each([false, true])('mixed week, v2=%s', async (v2) => {
    S.v2 = v2;
    await expect((await open()).html()).toMatchFileSnapshot(snap(`mixed-v${v2 ? 2 : 1}`));
  });

  it.each(['strength', 'running'])('mode %s', async (mode) => {
    S.controls = { mode, focus: 50, availableDayCount: 5 };
    await expect((await open()).html()).toMatchFileSnapshot(snap(`mode-${mode}`));
  });

  it.each([0, 1])('every running category label (batch %s)', async (batch) => {
    const cats = ['quality_primary', 'tempo', 'short_intervals', 'long_intervals', 'hill_sprints', 'hill_short', 'hill_long', 'fartlek_structured', 'long_run', 'easy_run', 'fartlek_easy', 'strides', 'something_else', 'x'];
    S.advice = advice({
      week: { strength: [], running: cats.slice(batch * 7, batch * 7 + 7).map((c, i) => runDay(i, c)) },
      sharedDays: [],
      notes: [],
    });
    S.controls = { mode: 'running', focus: 50, availableDayCount: 7 };
    await expect((await open()).html()).toMatchFileSnapshot(snap(`running-categories-${batch}`));
  });

  it('no advice (not enough data)', async () => {
    S.advice = null;
    await expect((await open()).html()).toMatchFileSnapshot(snap('no-advice'));
  });

  it('locked chips', async () => {
    S.locks = { strength: true, running: true, mixed: true };
    await expect((await open()).html()).toMatchFileSnapshot(snap('locked'));
  });

  it('day-count stepper after taps', async () => {
    const m = await open();
    await m.clickText('+');
    await m.clickText('+');
    await expect(m.html()).toMatchFileSnapshot(snap('stepper-5'));
  });
});

describe('ScheduleBuilderDrawer — save flow (flag on)', () => {
  beforeEach(() => {
    S.saveEnabled = true;
  });

  it.each([false, true])('idle with the running-time picker, v2=%s', async (v2) => {
    S.v2 = v2;
    await expect((await open()).html()).toMatchFileSnapshot(snap(`save-idle-v${v2 ? 2 : 1}`));
  });

  it('running time presets, a saved profile time and the custom picker', async () => {
    S.runningTime = '12:30';
    const m = await open();
    const noon = m.html();
    await m.clickText('אחר');
    const custom = m.html();
    await m.clickText('ערב');
    const evening = m.html();
    await expect([noon, custom, evening].join('\n=====\n')).toMatchFileSnapshot(snap('time-picker'));
  });

  it('strength mode hides the time picker', async () => {
    S.controls = { mode: 'strength', focus: 50, availableDayCount: 3 };
    await expect((await open()).html()).toMatchFileSnapshot(snap('save-strength'));
  });

  it('planner: choose scope', async () => {
    const m = await open();
    await m.clickText('זה מתאים לי');
    await expect(m.html()).toMatchFileSnapshot(snap('save-choose'));
  });

  it.each([
    ['plain', { ok: true }],
    ['this-week-scope', { ok: true, runningSkipped: 'this_week_scope' }],
    ['single-run', { ok: true, runningSkipped: 'single_run' }],
    ['plan-failed', { ok: true, running: { ok: false } }],
    ['failed', { ok: false }],
  ])('saving, then outcome %s', async (name, outcome) => {
    let resolve!: (v: Record<string, unknown>) => void;
    S.savePending = new Promise((r) => (resolve = r));
    S.outcome = outcome;
    const m = await open();
    await m.clickText('זה מתאים לי');
    await m.clickText('מכאן והלאה');
    const saving = m.html();
    resolve(outcome);
    S.savePending = null;
    await m.advance(0);
    await expect(`${saving}\n=====\n${m.html()}`).toMatchFileSnapshot(snap(`save-${name}`));
  });

  it('failed, then the retry button is back', async () => {
    S.outcome = { ok: false };
    const m = await open();
    await m.clickText('זה מתאים לי');
    await m.clickText('רק השבוע');
    await m.advance(0);
    await expect(m.html()).toMatchFileSnapshot(snap('save-failed-retry'));
  });

  it('second_track saves directly', async () => {
    const m = await open('second_track');
    await m.clickText('זה מתאים לי');
    await m.advance(0);
    await expect(m.html()).toMatchFileSnapshot(snap('save-second-track'));
  });
});
