// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `onboarding`, batch t): LifestyleWizard, PersonaQuestionsDrawer and its
 * HierarchySearchStep — snapshots recorded BEFORE the extraction, from unmodified origin/main. The
 * extraction commit must render the same Hebrew markup (and raise the same alert() text).
 *
 * LifestyleWizard: v1 / v2, male / female, every step's header, the notifications step (v1), the
 * iOS "add to home screen" sheet (v1 and v2), the save-error alert. Its steps from other folders
 * (PersonaStep, ScheduleStep, RunningScheduleStep, StrengthSignupScheduleFlow, WizardRemindersStepV2,
 * StickyActionButton) are stubs that print the props this extraction feeds them.
 * PersonaQuestionsDrawer + HierarchySearchStep (both rendered for real, v1 = MyPersonasSection's look):
 * header, privacy line, stale-unit notice, skip, save failure; the unit search — loading, list,
 * search miss, empty level, drill-down, finish + declare errors, the "not in the list" form, the
 * duplicate prompt, submit errors / busy / submitted — × male / female / other.
 * jsdom + react-dom/client; framer-motion is replaced by plain elements. Inline `style` attributes are
 * stripped (animation values only, never text). `<!-- -->` is stripped before comparing.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';

type Entry = { id: string; data: Record<string, unknown> };
const S = vi.hoisted(() => ({
  v2: false,
  gender: 'male' as string,
  profile: null as Record<string, unknown> | null,
  router: { push: () => {}, replace: () => {}, back: () => {} },
  alerts: [] as string[],
  writeFails: false,
  resolved: true,
  saveFails: false,
  dir: {} as Record<string, Entry[]>,
  pendingRoot: null as Promise<void> | null,
  declare: { ok: true } as { ok: boolean; error?: string },
  submit: 'ok' as 'ok' | 'fail' | 'pending',
}));

vi.mock('framer-motion', async () => (await import('../steps/__tests__/i18n-dom-harness')).motionStub);
vi.mock('@/lib/firebase', () => ({ db: {}, app: {}, auth: { currentUser: { uid: 'u1' } } }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  setDoc: async () => {},
  Timestamp: { now: () => ({}) },
  collection: () => ({}),
  where: (_f: string, _op: string, v: unknown) => ({ parentId: v }),
  query: (_c: unknown, w: { parentId: unknown }) => w,
  getDocs: async (q: { parentId: string | null }) => {
    const key = q.parentId ?? 'root';
    if (key === 'root' && S.pendingRoot) await S.pendingRoot;
    const docs = (S.dir[key] ?? []).map((e) => ({ id: e.id, data: () => e.data }));
    return { docs };
  },
}));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: {}, loading: false }) }));
vi.mock('next/navigation', () => ({ useRouter: () => S.router }));
vi.mock('@/features/user/onboarding/hooks/useOnboardingV2', () => ({
  useOnboardingV2: () => S.v2,
  useOnboardingV2State: () => ({ v2: S.v2, ready: true, quizHintV2: false }),
}));
vi.mock('@/features/user/onboarding/hooks/useWizardIdentity', () => ({
  useWizardIdentity: () => ({
    gender: S.gender,
    copyGender: S.gender === 'male' || S.gender === 'female' ? S.gender : 'other',
    firstName: '',
  }),
}));
vi.mock('@/features/user/identity/store/useUserStore', () => {
  const state = () => ({ profile: S.profile, refreshProfile: async () => {}, _hasHydrated: true });
  const useUserStore = (sel?: (s: unknown) => unknown) => (sel ? sel(state()) : state());
  (useUserStore as unknown as { getState: () => unknown }).getState = state;
  return { useUserStore };
});
vi.mock('@/features/parks/core/hooks/useSuppressBottomNav', () => ({ useSuppressBottomNav: () => {} }));
vi.mock('@/lib/native/push', () => ({
  initPushNotifications: async () => {},
  requestWebPush: async () => {},
  isNativePlatform: () => false,
  isIOSDevice: () => true,
  isStandalonePWA: () => false,
}));
vi.mock('@/features/notifications/services/notification-prefs.service', () => ({ saveNotificationPrefs: async () => {} }));
vi.mock('@/features/schedule/services/reminderOptIn.service', () => ({ saveReminderSkip: async () => {} }));
vi.mock('@/features/user/onboarding/services/lifestyle-wizard-submit.service', () => ({
  writeLifestyleWizardCompletion: async () => {
    if (S.writeFails) throw new Error('boom');
  },
}));
vi.mock('@/components/ui/StickyActionButton', () => ({
  default: (p: { label: string; successLabel?: string; onPress: () => void }) => (
    <button data-stub="sticky" data-success={p.successLabel ?? ''} onClick={() => p.onPress()}>
      {p.label}
    </button>
  ),
}));
vi.mock('@/features/user/onboarding/components/steps/PersonaStep', () => ({
  default: (p: { onNext: () => void }) => <button data-stub="persona" onClick={() => p.onNext()} />,
}));
vi.mock('@/features/user/onboarding/components/steps/ScheduleStep', () => ({
  default: (p: { onNext: () => void }) => <button data-stub="schedule" onClick={() => p.onNext()} />,
}));
vi.mock('@/features/user/onboarding/components/steps/RunningScheduleStep', () => ({
  default: (p: { onNext: () => void }) => <button data-stub="run-schedule" onClick={() => p.onNext()} />,
}));
vi.mock('@/features/user/onboarding/components/strength-v2/signup-schedule/StrengthSignupScheduleFlow', () => ({
  default: (p: { onConfirmed: (w: unknown) => void }) => <button data-stub="strength-schedule" onClick={() => p.onConfirmed({})} />,
}));
vi.mock('@/features/user/onboarding/utils/wizard-reminder-plan', () => ({
  EMPTY_REMINDER_PLAN: {},
  runningReminderPlan: () => ({}),
  strengthReminderPlan: () => ({}),
}));
vi.mock('@/features/user/onboarding/components/wizard-v2/WizardRemindersStepV2', () => ({
  default: (p: { onFinish: (c: boolean) => void; onIOSBlocked: (c: boolean) => void }) => (
    <div data-stub="reminders">
      <button data-ios onClick={() => p.onIOSBlocked(true)} />
      <button data-finish onClick={() => p.onFinish(true)} />
    </div>
  ),
}));
vi.mock('@/features/user/identity/hooks/useResolvedPersonaSummary', () => ({
  useResolvedPersonaSummary: () => ({ loading: false, resolved: S.resolved, rawAnswers: {}, firstUnansweredIndex: 0 }),
}));
vi.mock('@/features/user/identity/services/persona-answers.service', () => ({
  savePersonaAnswers: async () => {
    if (S.saveFails) throw new Error('boom');
  },
}));
vi.mock('@/features/analytics/AnalyticsService', () => ({
  Analytics: new Proxy({}, { get: () => async () => {} }),
}));
vi.mock('@/features/user/onboarding/components/persona-questions-drawer/ChoiceStep', () => ({
  default: (p: { onSelect: (v: string) => void }) => <button data-stub="choice" onClick={() => p.onSelect('reserve')} />,
}));
vi.mock('@/lib/demo', () => ({ isDemoTenant: () => false }));
vi.mock('@/components/ui/UnitIconBadge', () => ({ default: () => <span data-stub="unit-icon" /> }));
vi.mock('@/features/user/onboarding/services/unit-declaration.service', () => ({
  declareUnit: async () => S.declare,
}));
vi.mock('@/features/user/onboarding/services/pending-unit.service', () => ({
  submitPendingUnit: () => {
    if (S.submit === 'pending') return new Promise(() => {});
    if (S.submit === 'fail') return Promise.reject(new Error('boom'));
    return Promise.resolve({ id: 'p1' });
  },
}));

import { mount, type Mounted } from '../steps/__tests__/i18n-dom-harness';
import { useLocaleStore } from '@/store/useLocaleStore';
import { useOnboardingStore } from '@/features/user/onboarding/store/useOnboardingStore';
import LifestyleWizard from '../LifestyleWizard';
import PersonaQuestionsDrawer from '../PersonaQuestionsDrawer';

const snap = (name: string) => `./__snapshots__/lifestyle-persona-i18n/${name}.html`;
const noop = () => {};
const V = (v2: boolean) => `v${v2 ? 2 : 1}`;
const STORE_DEFAULTS = { ...useOnboardingStore.getState() };
const LOCALE_DEFAULTS = { ...useLocaleStore.getState() };
let m: Mounted | null = null;

const html = (r: Mounted) => r.html().replace(/ style="[^"]*"/g, '');

async function render(el: ReactElement): Promise<Mounted> {
  m?.unmount();
  document.body.innerHTML = '';
  m = await mount(el);
  return m;
}
const buttons = () => Array.from(document.querySelectorAll('button'));
const byText = (text: string) => {
  const b = buttons().find((x) => (x.textContent ?? '').includes(text));
  if (!b) throw new Error(`no button with ${text}`);
  return b;
};
const flush = async () => {
  const { act } = await import('react');
  await act(async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  });
};

const entry = (id: string, name: string, parentOrg = 'org1'): Entry => ({
  id,
  data: { name, level: 'brigade', orgId: parentOrg, unitId: id === 'b1' ? null : `u-${id}`, serviceType: null, statusCategory: null, iconUrl: null },
});

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-21T12:00:00'));
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  window.alert = (msg?: unknown) => {
    S.alerts.push(String(msg));
  };
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  S.v2 = false;
  S.gender = 'male';
  S.profile = null;
  S.alerts = [];
  S.writeFails = false;
  S.resolved = true;
  S.saveFails = false;
  S.dir = {};
  S.pendingRoot = null;
  S.declare = { ok: true };
  S.submit = 'ok';
  sessionStorage.clear();
  document.body.innerHTML = '';
  useOnboardingStore.setState({ ...STORE_DEFAULTS });
  useLocaleStore.setState({ ...LOCALE_DEFAULTS });
});
afterEach(() => {
  m?.unmount();
  m = null;
});

describe('LifestyleWizard', () => {
  for (const v2 of [false, true]) {
    it(`every step × gender, iOS sheet, save-error alert, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      for (const gender of ['male', 'female', 'other']) {
        S.gender = gender;
        S.writeFails = true;
        const r = await render(<LifestyleWizard onComplete={noop} onSkip={noop} />);
        out.push(`<!-- ${gender} persona -->`, html(r));
        await r.click('[data-stub="persona"]');
        out.push(`<!-- ${gender} schedule -->`, html(r));
        await r.click(v2 ? '[data-stub="strength-schedule"]' : '[data-stub="schedule"]');
        out.push(`<!-- ${gender} notifications -->`, html(r));
        if (v2) {
          await r.click('[data-ios]');
        } else {
          await r.click('[data-stub="sticky"]');
          await flush();
        }
        out.push(`<!-- ${gender} ios sheet -->`, html(r));
        // The sheet's skip → final submit → the save fails → alert.
        const skip = buttons()[buttons().length - 1];
        await r.click(skip);
        await flush();
      }
      out.push('<!-- alerts -->', ...S.alerts);
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`lifestyle-${V(v2)}`));
    });
  }
});

describe('PersonaQuestionsDrawer + HierarchySearchStep', () => {
  for (const v2 of [false, true]) {
    it(`header, stale notice, skip, save failure, unit search states × gender, ${V(v2)}`, async () => {
      S.v2 = v2;
      const out: string[] = [];
      for (const gender of ['male', 'female', 'other']) {
        useLocaleStore.setState({ gender: gender as never });

        // Choice step + stale notice, skip to the unit search (root still loading).
        S.resolved = false;
        let resolveRoot!: () => void;
        S.pendingRoot = new Promise<void>((res) => {
          resolveRoot = res;
        });
        S.dir = {
          root: [entry('b1', 'חטיבה 1'), entry('b2', 'חטיבה 2')],
          b2: [entry('c1', 'גדוד 11', 'org1')],
        };
        let r = await render(<PersonaQuestionsDrawer personaId={'military' as never} isOpen onComplete={noop} v2={v2} />);
        out.push(`<!-- ${gender} choice -->`, html(r));
        await r.click(byText('דילוג'));
        out.push(`<!-- ${gender} loading -->`, html(r));
        resolveRoot();
        await flush();
        out.push(`<!-- ${gender} list -->`, html(r));
        await r.type('input[type="text"]', 'xyz');
        out.push(`<!-- ${gender} search miss -->`, html(r));
        await r.type('input[type="text"]', '');
        // Drill into b2 (has children; a real unitId, so finishing declares it).
        await r.click(byText('חטיבה 2'));
        await flush();
        out.push(`<!-- ${gender} drilled -->`, html(r));
        // Finish → declare fails without a message, then with one.
        S.declare = { ok: false };
        await r.click(byText('סיום'));
        await flush();
        out.push(`<!-- ${gender} declare error -->`, html(r));
        S.declare = { ok: false, error: 'שגיאת שרת' };
        await r.click(byText('שוב'));
        await flush();
        out.push(`<!-- ${gender} declare server error -->`, html(r));
        // Not-in-the-list form, duplicate prompt, submit fail / busy / ok.
        await r.click(byText('היחידה שלי לא ברשימה'));
        out.push(`<!-- ${gender} add form -->`, html(r));
        const inputs = Array.from(document.querySelectorAll('input[type="text"]'));
        const nameInput = inputs[inputs.length - 1] as HTMLInputElement;
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        const { act } = await import('react');
        await act(async () => {
          setter.call(nameInput, 'גדוד 11');
          nameInput.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await r.click(byText('שליחה'));
        out.push(`<!-- ${gender} duplicate prompt -->`, html(r));
        S.submit = 'fail';
        await r.click(byText('לא, זו לא'));
        await flush();
        out.push(`<!-- ${gender} submit failed -->`, html(r));
        S.submit = 'pending';
        await r.click(byText('לא, זו לא'));
        out.push(`<!-- ${gender} submit busy -->`, html(r));

        // Submitted.
        S.submit = 'ok';
        S.resolved = true;
        S.pendingRoot = null;
        S.dir = { root: [] };
        r = await render(<PersonaQuestionsDrawer personaId={'military' as never} isOpen onComplete={noop} v2={v2} />);
        await r.click(byText('דילוג'));
        await flush();
        out.push(`<!-- ${gender} empty root -->`, html(r));
        await r.click(byText('היחידה שלי לא ברשימה'));
        const only = document.querySelector('input[type="text"]') as HTMLInputElement;
        await act(async () => {
          setter.call(only, 'יחידה חדשה');
          only.dispatchEvent(new Event('input', { bubbles: true }));
        });
        await r.click(byText('שליחה'));
        await flush();
        out.push(`<!-- ${gender} submitted -->`, html(r));

        // Save failure screen: skip both questions → the save throws.
        S.saveFails = true;
        S.dir = { root: [] };
        r = await render(<PersonaQuestionsDrawer personaId={'military' as never} isOpen onComplete={noop} v2={v2} />);
        await r.click(byText('דילוג'));
        await flush();
        await r.click(byText('דילוג'));
        await flush();
        await r.advance(1000); // the drawer retries once after 1 s
        await flush();
        out.push(`<!-- ${gender} save failed -->`, html(r));
        S.saveFails = false;
      }
      await expect(out.join('\n')).toMatchFileSnapshot(snap(`persona-${V(v2)}`));
    });
  }
});
