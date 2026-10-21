// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `onboarding`, keys `steps.*`): the onboarding / lifestyle-wizard steps —
 * snapshots recorded BEFORE the extraction, from unmodified origin/main. The extraction commit must
 * render the same Hebrew markup.
 *
 * Covers PersonalStatsStep, ProcessingStep, RunningPlanSummary, AccountSecureStep, PersonaStep,
 * PlanLengthStep, RunningScheduleStep and ScheduleStep — v1 and v2 (enable_home_v2), male / female,
 * and the text that only appears after a timer (auto-reveal, message cycle), a tap (persona and goal
 * picks, the access-code modal, the plan-length calendar / slider, day popover, skip warning) or a
 * failed sign-in (error lines). jsdom + react-dom/client; framer-motion is replaced by plain elements
 * and the shared children from other areas (StickyActionButton, WheelPicker, AccessCodeGate,
 * RunningPlanSummaryV2, ...) are stubs that print the props this extraction feeds them.
 * `<!-- -->` is stripped before comparing (react-dom/server's separator between adjacent text
 * nodes; react-dom/client emits none — stripped anyway, same rule as the static parity tests).
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

const S = vi.hoisted(() => ({
  v2: false,
  flags: { enableOrgAccessCodePrompt: true } as Record<string, unknown>,
  profile: null as Record<string, unknown> | null,
  linkResult: { user: null, error: null } as { user: unknown; error: string | null },
}));

vi.mock('framer-motion', async () => (await import('./i18n-dom-harness')).motionStub);
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { uid: 'u1' } }, app: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: S.flags, loading: false }) }));
vi.mock('@/features/user/onboarding/hooks/useOnboardingV2', () => ({
  useOnboardingV2: () => S.v2,
  useOnboardingV2State: () => ({ v2: S.v2, ready: true, quizHintV2: false }),
}));
vi.mock('@/features/user/identity/store/useUserStore', () => {
  const state = () => ({ profile: S.profile, refreshProfile: async () => {}, _hasHydrated: true });
  const useUserStore = (sel: (s: unknown) => unknown) => sel(state());
  (useUserStore as unknown as { getState: () => unknown }).getState = state;
  return { useUserStore };
});
vi.mock('@/features/user/onboarding/services/onboarding-sync.service', () => ({
  syncOnboardingToFirestore: async () => {},
}));
vi.mock('@/features/analytics/AnalyticsService', () => ({
  Analytics: new Proxy({}, { get: () => async () => {} }),
}));
vi.mock('@/lib/onboardingPrefs', () => ({
  setOnboardingPref: () => {},
  getOnboardingPref: () => null,
  getOnboardingPrefAsync: async () => null,
  removeOnboardingPref: () => {},
}));
vi.mock('@/lib/auth.service', () => ({
  linkWithGoogleAccount: async () => S.linkResult,
  linkWithAppleAccount: async () => S.linkResult,
}));
vi.mock('@/features/workout-engine/core/services/running-schedule-write.service', () => ({
  completeRunningScheduleFirstChoice: async () => ({ ok: true }),
}));
vi.mock('@/features/parks/core/hooks/useSuppressBottomNav', () => ({ useSuppressBottomNav: () => {} }));
vi.mock('@/components/ui/StickyActionButton', () => ({
  default: (p: { label: string; successLabel?: string; disabled?: boolean; onPress: () => void }) => (
    <button data-stub="sticky" data-success={p.successLabel ?? ''} disabled={p.disabled} onClick={() => p.onPress()}>
      {p.label}
    </button>
  ),
}));
vi.mock('@/components/ui/WheelPicker', () => ({
  default: (p: { value: number; unit?: string }) => <div data-stub="wheel" data-value={p.value} data-unit={p.unit ?? ''} />,
}));
vi.mock('@/components/ui/AccessCodeGate', () => ({
  default: (p: { orgName?: string; personaLabel?: string; onSuccess: (r: unknown) => void; onSkip: () => void }) => (
    <div data-stub="gate" data-org={p.orgName ?? ''} data-persona={p.personaLabel ?? ''}>
      <button
        data-gate-success
        onClick={() =>
          p.onSuccess({ tenantId: 't', unitId: 'u', unitPath: [], tenantType: 'company', onboardingPath: 'FULL_PROGRAM' })
        }
      />
      <button data-gate-skip onClick={() => p.onSkip()} />
    </div>
  ),
}));
vi.mock('@/components/ui/UnitJoinSuccessBanner', () => ({ default: () => <div data-stub="unit-banner" /> }));
vi.mock('@/features/user/onboarding/components/PersonaQuestionsDrawer', () => ({
  default: (p: { personaId: string }) => <div data-stub="persona-drawer" data-persona={p.personaId} />,
}));
vi.mock('@/features/user/onboarding/components/running-v2/RunningPlanSummaryV2', () => ({
  default: (p: { distLabel: string; weeks: number; frequency: number; endDateShort: string }) => (
    <div data-stub="summary-v2" data-dist={p.distLabel} data-weeks={p.weeks} data-frequency={p.frequency} data-end={p.endDateShort} />
  ),
}));

import { mount, type Mounted } from './i18n-dom-harness';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import PersonalStatsStep from '../PersonalStatsStep';
import ProcessingStep from '../ProcessingStep';
import RunningPlanSummary from '../RunningPlanSummary';
import AccountSecureStep from '../AccountSecureStep';
import PersonaStep from '../PersonaStep';
import PlanLengthStep from '../PlanLengthStep';
import RunningScheduleStep from '../RunningScheduleStep';
import ScheduleStep from '../ScheduleStep';

const snap = (name: string) => `./__snapshots__/steps-i18n/${name}.html`;
const noop = () => {};
const V = (v2: boolean) => `v${v2 ? 2 : 1}`;
const STORE_DEFAULTS = { ...useOnboardingStore.getState() };
let m: Mounted | null = null;

async function render(el: ReactElement): Promise<Mounted> {
  m?.unmount();
  m = await mount(el);
  return m;
}
function session(entries: Record<string, string>) {
  sessionStorage.clear();
  for (const [k, v] of Object.entries(entries)) sessionStorage.setItem(k, v);
}
function storeData(data: Record<string, unknown>) {
  useOnboardingStore.setState({ ...STORE_DEFAULTS, data: { ...(STORE_DEFAULTS.data as object), ...data } as never });
}
const buttons = () => Array.from(document.querySelectorAll('button'));

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T12:00:00'));
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  S.v2 = false;
  S.profile = null;
  S.linkResult = { user: null, error: null };
  sessionStorage.clear();
  useOnboardingStore.setState({ ...STORE_DEFAULTS });
});
afterEach(() => {
  m?.unmount();
  m = null;
});

describe('PersonalStatsStep', () => {
  for (const v2 of [false, true]) {
    it(`default / last / JIT, he + en, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      for (const lang of ['he', 'en']) {
        session({ onboarding_language: lang });
        out.push((await render(<PersonalStatsStep onNext={noop} />)).html());
        out.push((await render(<PersonalStatsStep onNext={noop} isLastStep />)).html());
        out.push((await render(<PersonalStatsStep onNext={noop} isJIT />)).html());
      }
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`personal-stats-${V(v2)}`));
    });
  }
});

describe('ProcessingStep', () => {
  for (const v2 of [false, true]) {
    it(`every message × persona × gender, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      const personas = ['parent', 'student', 'pupil', 'office_worker', 'military', 'vatikim', 'pro_athlete', 'reservist', ''];
      for (const gender of ['male', 'female', 'other', '']) {
        for (const persona of personas) {
          session(gender ? { onboarding_personal_gender: gender } : {});
          storeData({ selectedPersonaId: persona || null });
          const r = await render(<ProcessingStep onNext={noop} />);
          const frames = [r.html()];
          for (let i = 0; i < 4; i++) {
            await r.advance(900);
            frames.push(r.html());
          }
          out.push(`<!-- ${gender || 'none'} / ${persona || 'none'} -->`, ...frames);
        }
      }
      // selectedPersonaIds[0] fallback
      storeData({ selectedPersonaId: null, selectedPersonaIds: ['military'] });
      const r = await render(<ProcessingStep onNext={noop} />);
      await r.advance(900);
      out.push(r.html());
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`processing-${V(v2)}`));
    });
  }
});

describe('RunningPlanSummary', () => {
  for (const v2 of [false, true]) {
    it(`every distance, with / without pace, days, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      for (const targetDistance of ['2k', '3k', '5k', '10k', 'maintenance', 'marathon', undefined]) {
        for (const pace of [0, 1500, 4000]) {
          session({ onboarding_running_answers: JSON.stringify({ targetDistance, paceInputSeconds: pace, runningPlanWeeks: 10 }) });
          storeData({ runningScheduleDays: pace ? ['א', 'ג', 'ה'] : [], runningWeeklyFrequency: pace ? 3 : undefined });
          out.push((await render(<RunningPlanSummary onGenerate={noop} />)).html());
        }
      }
      session({});
      out.push((await render(<RunningPlanSummary onGenerate={noop} />)).html());
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`running-summary-${V(v2)}`));
    });
  }
});

describe('AccountSecureStep', () => {
  for (const v2 of [false, true]) {
    it(`initial, skip warning, every sign-in error × gender, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      for (const gender of ['male', 'female']) {
        for (const name of ['דנה', '']) {
          session(name ? { onboarding_personal_gender: gender, onboarding_personal_name: name } : { onboarding_personal_gender: gender });
          const r = await render(<AccountSecureStep onNext={noop} onSkip={noop} />);
          out.push(r.html());
          await r.clickText('המשך עם פרופיל מקומי');
          out.push(r.html());
        }
        const errors = [
          'google_timeout', 'google_account_exists', 'popup_closed', 'something_else',
          'apple_timeout', 'apple_account_exists',
        ];
        for (const error of errors) {
          S.linkResult = { user: null, error };
          const r = await render(<AccountSecureStep onNext={noop} onSkip={noop} />);
          await r.clickText(error.startsWith('apple') ? 'Apple' : 'Google');
          out.push(`<!-- ${error} -->`, r.html());
        }
        // apple generic error + thrown errors
        S.linkResult = { user: null, error: 'weird' };
        let r = await render(<AccountSecureStep onNext={noop} onSkip={noop} />);
        await r.clickText('Apple');
        out.push(r.html());
        S.linkResult = null as never; // destructuring null throws → the catch branch
        r = await render(<AccountSecureStep onNext={noop} onSkip={noop} />);
        await r.clickText('Google');
        out.push(r.html());
        r = await render(<AccountSecureStep onNext={noop} onSkip={noop} />);
        await r.clickText('Apple');
        out.push(r.html());
        // pending sign-in → the "connecting" label on the tapped button
        S.linkResult = new Promise(() => {}) as never;
        r = await render(<AccountSecureStep onNext={noop} onSkip={noop} />);
        await r.clickText('Google');
        out.push(r.html());
        r = await render(<AccountSecureStep onNext={noop} onSkip={noop} />);
        await r.clickText('Apple');
        out.push(r.html());
        S.linkResult = { user: null, error: null };
      }
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`account-secure-${V(v2)}`));
    });
  }
});

describe('PersonaStep', () => {
  for (const v2 of [false, true]) {
    it(`picks, mad-libs, goals, hints, access-code modal × gender, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      for (const gender of ['male', 'female']) {
        for (const name of ['דנה', '']) {
          session(name ? { onboarding_personal_gender: gender, onboarding_personal_name: name } : { onboarding_personal_gender: gender });
          storeData({});
          const r = await render(<PersonaStep onNext={noop} />);
          out.push(r.html());
          // persona cards are the first buttons; pick 1, 2, 3, 4 (not office_worker — it opens the gate)
          const personaButtons = () => buttons().filter((b) => b.hasAttribute('aria-pressed') || b.className.includes('rounded-2xl'));
          void personaButtons;
          for (const label of gender === 'female' ? ['אמא', 'סטודנטית', 'תלמידה', 'צה"ל'] : ['אבא', 'סטודנט', 'תלמיד', 'צה"ל']) {
            await r.clickText(label);
            out.push(r.html());
          }
          // goals: first, second, third (replaces the oldest)
          const goalButtons = buttons().filter((b) => (b.closest('[class*="flex-wrap"]') !== null));
          for (const b of goalButtons.slice(0, 3)) {
            await r.click(b);
            out.push(r.html());
          }
        }
        // access-code gate: office worker → modal → success view → continue
        const r = await render(<PersonaStep onNext={noop} />);
        await r.clickText(gender === 'female' ? 'עובדת משרד' : 'עובד משרד');
        out.push(r.html());
        await r.click('[data-gate-success]');
        out.push(r.html());
      }
      // askGoals = false (strength track captured the goal) → the shorter hint / sentence
      S.profile = { progression: { tracks: { push: { level: 1 } } }, lifestyle: { programPath: 'health' } } as never;
      for (const gender of ['female', 'male']) {
        session({ onboarding_personal_gender: gender });
        storeData({});
        out.push((await render(<PersonaStep onNext={noop} />)).html());
      }
      // stored selection (two personas, two goals) + English
      S.profile = null;
      storeData({ selectedPersonaIds: ['parent', 'student'], selectedGoalIds: ['health', 'routine'] });
      out.push((await render(<PersonaStep onNext={noop} />)).html());
      session({ onboarding_language: 'en' });
      out.push((await render(<PersonaStep onNext={noop} />)).html());
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`persona-${V(v2)}`));
    });
  }
});

describe('PlanLengthStep', () => {
  for (const v2 of [false, true]) {
    it(`presets, race calendar, custom slider, every distance, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      for (const targetDistance of ['2k', '3k', '5k', '10k', 'maintenance', undefined]) {
        session({ onboarding_running_answers: JSON.stringify({ targetDistance, goalPath: 'start_running' }) });
        out.push((await render(<PlanLengthStep onNext={noop} />)).html());
      }
      session({ onboarding_running_answers: JSON.stringify({ targetDistance: '10k', goalPath: 'improve_time' }) });
      const r = await render(<PlanLengthStep onNext={noop} />);
      // calendar mode
      await r.clickAny(v2 ? 'יש לי מרוץ' : 'בחירת תאריך סיום');
      out.push(r.html());
      // next month, then pick the 15th
      const next = document.querySelector('button[aria-label="החודש הבא"]') ?? buttons().find((b) => b.className === 'p-1' && b.nextSibling === null);
      if (next) await r.click(next);
      const day = buttons().find((b) => b.textContent === '15' && !b.disabled);
      if (day) await r.click(day);
      out.push(r.html());
      // slider mode
      await r.clickAny(v2 ? '4–52 שבועות' : 'בחירה מותאמת אישית');
      out.push(r.html());
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`plan-length-${V(v2)}`));
    });
  }
});

describe('RunningScheduleStep', () => {
  for (const v2 of [false, true]) {
    it(`signup pass-through, JIT picker: frequency, days, time, notices × gender, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      // signup (not JIT): the loading line (the effect advances immediately)
      out.push((await render(<RunningScheduleStep onNext={noop} />)).html());
      for (const gender of ['male', 'female']) {
        for (const strength of [true, false]) {
          S.profile = {
            core: { gender },
            lifestyle: { scheduleDays: strength ? ['ב', 'ד'] : [] },
            running: { scheduleDays: ['א'] },
          };
          storeData({ runningWeeklyFrequency: 3 });
          const r = await render(<RunningScheduleStep onNext={noop} isJIT />);
          out.push(r.html());
          await r.advance(800);
          out.push(r.html());
          await r.advance(400);
          out.push(r.html());
          // frequency 2 and 4
          for (const n of ['2', '4']) {
            const b = buttons().find((x) => (x.getAttribute('aria-label') ?? '').startsWith(`${n} `) || x.textContent?.trim() === n);
            if (b) await r.click(b);
            await r.advance(500);
            out.push(r.html());
          }
          // custom time (v2) / a preset
          const other = buttons().find((x) => x.textContent?.includes('אחר'));
          if (other) {
            await r.click(other);
            out.push(r.html());
          }
        }
      }
      S.profile = { running: { scheduleDays: ['א', 'ג'], scheduleDaysSource: 'user-chosen' } };
      out.push((await render(<RunningScheduleStep onNext={noop} isJIT isLastStep />)).html());
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`running-schedule-${V(v2)}`));
    });
  }
});

describe('ScheduleStep', () => {
  for (const v2 of [false, true]) {
    it(`history, recommendations, frequency, days, popover, warnings, time × gender, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      for (const gender of ['male', 'female']) {
        session({ onboarding_personal_gender: gender });
        storeData({});
        const r = await render(<ScheduleStep onNext={noop} />);
        out.push(r.html());
        await r.advance(800);
        out.push(r.html());
        await r.advance(400);
        out.push(r.html());
        // history: none → recommendation A (frequency 3)
        await r.clickText('לא התאמנתי');
        out.push(r.html());
        await r.clickText('המלצה שלנו');
        out.push(r.html());
        // locations + sports chips
        await r.clickText('גינת כושר');
        await r.clickText('ריצה');
        out.push(r.html());
        // history 1-2 + frequency 1 → recommendation B
        await r.clickText('1-2 פעמים בשבוע');
        const one = buttons().find((b) => b.textContent?.trim() === '1');
        if (one) await r.click(one);
        await r.advance(500);
        out.push(r.html());
        // frequency 7, then open a day popover
        const seven = buttons().find((b) => b.textContent?.trim() === '7');
        if (seven) await r.click(seven);
        await r.advance(500);
        out.push(r.html());
        const dayCard = buttons().find((b) => (b.getAttribute('aria-label') ?? '').includes('—'));
        if (dayCard) {
          await r.click(dayCard);
          out.push(r.html());
        }
        const rest = buttons().find((b) => b.textContent?.includes('יום מנוחה'));
        if (rest) {
          await r.click(rest);
          out.push(r.html());
        }
      }
      // JIT / last step CTAs + English
      session({ onboarding_personal_gender: 'female' });
      out.push((await render(<ScheduleStep onNext={noop} isJIT />)).html());
      out.push((await render(<ScheduleStep onNext={noop} isLastStep />)).html());
      session({ onboarding_language: 'en' });
      const r = await render(<ScheduleStep onNext={noop} />);
      await r.advance(1200);
      out.push(r.html());
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`schedule-${V(v2)}`));
    });
  }
});
