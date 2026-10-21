// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `onboarding`, keys `assessment.*` / `phases.*`): the strength assessment
 * page's OWN copy — snapshots recorded BEFORE the extraction, from unmodified origin/main.
 *
 * The page's text only appears after effects / async service calls (auth, sessionStorage, path
 * config, rule engine, save), so this is a jsdom + react-dom/client test: every service is mocked
 * and driven by hand, framer-motion is replaced by plain elements, and the child screens (why /
 * tier / slider / result, which carry their own copy and parity tests) are stubs that expose
 * buttons to move the flow. The story-bar stub prints its `phaseLabel`, so the strength phase
 * labels the page passes (STRENGTH_LABELS) are pinned too. `alert()` texts are recorded with a spy
 * and snapshotted next to the markup. react-dom/client emits no `<!-- -->` separators; they are
 * stripped anyway (same rule as the static-markup parity tests).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, Fragment, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// ── Controls ─────────────────────────────────────────────────────────

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const S = {
  v2: false,
  flagsReady: true,
  currentUser: { uid: 'u1' } as { uid: string } | null,
  miniActive: false,
  evaluate: deferred<unknown>(),
  mapping: deferred<unknown>(),
  save: deferred<unknown>(),
  miniWrite: deferred<unknown>(),
};

const PATH_CONFIG = {
  path: 'health',
  categories: ['push'],
  minLevel: 1,
  skipTier: true,
  skillIds: [] as string[],
  clampTierLevel: (l: number) => l,
};

// ── Mocks ────────────────────────────────────────────────────────────

vi.mock('next/navigation', () => {
  const router = { push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} }; // stable, like Next's
  return { useRouter: () => router };
});
vi.mock('@/lib/firebase', () => ({
  db: {},
  app: {},
  get auth() { return { currentUser: S.currentUser }; },
}));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_a: unknown, cb: (u: unknown) => void) => { cb(S.currentUser); return () => {}; },
}));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  serverTimestamp: () => 'ts',
  setDoc: () => S.save.promise,
}));
vi.mock('framer-motion', () => {
  const strip = (p: Record<string, unknown>) => {
    const { initial, animate, exit, variants, transition, ...rest } = p;
    void initial; void animate; void exit; void variants; void transition;
    return rest;
  };
  return {
    motion: { div: (p: Record<string, unknown>) => createElement('div', strip(p)) },
    AnimatePresence: ({ children }: { children: ReactNode }) => createElement(Fragment, null, children),
  };
});

vi.mock('@/features/user/onboarding/components/visual-assessment/BlurredWhyStep', () => ({
  default: (p: { onNext: () => void }) => <button data-stub="why" onClick={p.onNext} />,
  calcAgeGroup: () => '26-50',
}));
vi.mock('@/features/user/onboarding/components/visual-assessment/TierSelectionCard', () => ({
  default: () => <div data-stub="tier" />,
}));
vi.mock('@/features/user/onboarding/components/visual-assessment/VisualSlider', () => ({
  default: (p: { category: string; onLevelConfirm: (l: number) => void }) => (
    <button data-stub="slider" data-category={p.category} onClick={() => p.onLevelConfirm(4)} />
  ),
}));
vi.mock('@/features/user/onboarding/components/ProgramResult', () => ({
  default: (p: { saveError: string | null; onContinue: () => void }) => (
    <div data-stub="result">
      <button data-stub="accept" onClick={p.onContinue} />
      <p data-stub="save-error">{p.saveError ?? ''}</p>
    </div>
  ),
}));
vi.mock('@/features/user/onboarding/components/ResultLoading', () => ({
  default: (p: { onComplete: () => void }) => <button data-stub="result-loading" onClick={p.onComplete} />,
}));
vi.mock('@/features/user/onboarding/components/OnboardingStoryBar', () => ({
  default: (p: { phaseLabel?: string; currentPhase?: number }) => (
    <div data-stub="story-bar" data-phase={p.currentPhase}>{p.phaseLabel}</div>
  ),
}));
vi.mock('@/features/user/onboarding/utils/onboarding-confetti', () => ({ firePhaseConfetti: () => {} }));
vi.mock('@/features/user/onboarding/services/assessment-rule-engine.service', () => ({
  evaluateRules: () => S.evaluate.promise,
}));
vi.mock('@/features/user/onboarding/services/program-threshold-mapper.service', () => ({
  mapLevelsToProgram: () => S.mapping.promise,
  computeAssessedAverage: () => 4,
}));
vi.mock('@/features/user/onboarding/services/visual-content-resolver.service', () => ({
  clearContentCache: () => {},
  resolveText: (v: unknown) => (typeof v === 'string' ? v : ((v as { he?: string } | undefined)?.he ?? '')),
  prefetchCategoryVideos: async () => {},
}));
vi.mock('@/features/user/onboarding/services/onboarding-sync.service', () => ({
  syncOnboardingToFirestore: async () => true,
}));
vi.mock('@/lib/reportSignupFailure', () => ({ reportSignupFailure: () => {}, extractErrorCode: () => 'x' }));
vi.mock('@/features/user/onboarding/services/branching-logic.service', () => ({
  computeAssessmentContext: async () => ({}),
  saveAssessmentContext: () => {},
}));
vi.mock('@/features/user/onboarding/services/assessment-path-config.service', () => ({
  getPathConfigSync: () => PATH_CONFIG,
  loadPathConfigAsync: () => new Promise(() => {}),
  getMaxLevelForCategory: () => 10,
  getFollowUpMaxLevel: () => 10,
  getSkillFocusFromStorage: () => [],
  getProgramPathListFromStorage: () => [],
  getMuscleFocusFromStorage: () => [],
}));
vi.mock('@/features/content/programs/core/programLevelSettings.service', () => ({ getProgramLevelSetting: async () => null }));
vi.mock('@/features/content/programs/core/program.service', () => ({ getAllPrograms: async () => [] }));
vi.mock('@/hooks/useAndroidBack', () => ({ useAndroidBack: () => {} }));
vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: { getState: () => ({ profile: null, refreshProfile: async () => {} }) },
}));
vi.mock('@/features/user/onboarding/services/mini-domain-assessment', () => ({
  isMiniAssessmentActive: () => S.miniActive,
  consumeMiniAssessmentState: () => ({ returnTo: '/home' }),
  MINI_ASSESSMENT_DOMAIN_KEY: 'mini_domain',
}));
vi.mock('@/lib/health-declaration', () => ({ hasAcceptedHealthDeclaration: () => false }));
vi.mock('@/features/user/onboarding/services/single-domain-assessment.service', () => ({
  writeSingleDomainAssessment: () => S.miniWrite.promise,
}));
vi.mock('@/features/user/onboarding/utils/skill-result-levels', () => ({ baselineSkillMasterSubLevels: () => ({}) }));
vi.mock('@/features/user/onboarding/constants/skill-foundation-domain.constants', () => ({ SKILL_TO_FOUNDATION_DOMAIN: {} }));
vi.mock('@/features/user/onboarding/utils/assessment-level-caps', () => ({ getFoundationAssessmentMax: () => 25 }));
vi.mock('@/features/user/onboarding/hooks/useOnboardingV2', () => ({
  useOnboardingV2State: () => ({ v2: S.v2, ready: S.flagsReady, quizHintV2: false }),
}));
vi.mock('@/features/user/onboarding/hooks/useDeferredIdentity', () => {
  // Stable like the real useCallback — a fresh function per render re-runs the page's init effect forever.
  const identity = { runAfterIdentity: () => {}, identityOverlay: null };
  return { useDeferredIdentity: () => identity };
});
vi.mock('@/features/user/onboarding/utils/deferred-identity', () => ({ demographicsFromSession: () => null }));
vi.mock('@/features/user/onboarding/utils/onboarding-entry', () => ({ backfillOnboardingIdentitySession: () => {} }));
vi.mock('@/features/user/onboarding/utils/add-track-routing', () => ({ strengthResultNextRoute: () => '/onboarding-new/health' }));
vi.mock('@/lib/track-ownership', () => ({ hasRunningTrack: () => false }));

import VisualAssessmentPage from '../page';

// ── Harness ──────────────────────────────────────────────────────────

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
let alerts: string[] = [];

const html = () => (host?.innerHTML ?? '').replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/assessment-page-i18n/${name}.html`;
const flush = async () => { await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); }); };
const click = async (stub: string) => {
  const el = host?.querySelector(`[data-stub="${stub}"]`) as HTMLElement | null;
  if (!el) throw new Error(`stub ${stub} not rendered:\n${html()}`);
  await act(async () => { el.click(); });
  await flush();
};

async function mount() {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<VisualAssessmentPage />); });
  await flush();
}

/** why → slider → evaluating (rule engine pending). */
async function toEvaluating() {
  await mount();
  await click('why');
  await click('slider');
}

/** … → no rule → threshold mapping → result loading → result. */
async function toResult() {
  await toEvaluating();
  await act(async () => { S.evaluate.resolve(null); });
  await flush();
  await act(async () => {
    S.mapping.resolve({ programId: 'full_body', levelMode: 'auto', levelId: '', displayName: { he: 'גוף מלא' } });
  });
  await flush();
  await click('result-loading');
}

beforeEach(() => {
  S.v2 = false;
  S.flagsReady = true;
  S.currentUser = { uid: 'u1' };
  S.miniActive = false;
  S.evaluate = deferred();
  S.mapping = deferred();
  S.save = deferred();
  S.miniWrite = deferred();
  alerts = [];
  vi.spyOn(window, 'alert').mockImplementation((m?: unknown) => { alerts.push(String(m)); });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  sessionStorage.clear();
  sessionStorage.setItem('onboarding_personal_dob', '1990-01-01');
  sessionStorage.setItem('onboarding_personal_gender', 'male');
});

afterEach(async () => {
  await act(async () => { root?.unmount(); });
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

const V = [false, true] as const;
const tag = (v2: boolean) => (v2 ? 'v2' : 'v1');

describe('assessment page — Hebrew byte-identical to origin/main', () => {
  it.each(V)('loading (v2=%s)', async (v2) => {
    S.v2 = v2;
    S.flagsReady = false;
    sessionStorage.clear();
    await mount();
    await expect(html()).toMatchFileSnapshot(snap(`loading-${tag(v2)}`));
  });

  it.each(V)('evaluating — phase 3 label (v2=%s)', async (v2) => {
    S.v2 = v2;
    await toEvaluating();
    await expect(html()).toMatchFileSnapshot(snap(`evaluating-${tag(v2)}`));
  });

  it.each(V)('follow-up — badge + fallback title (v2=%s)', async (v2) => {
    S.v2 = v2;
    await toEvaluating();
    await act(async () => {
      S.evaluate.resolve({ id: 'r1', name: 'r', action: { type: 'BRANCH_TO_FOLLOW_UP', followUpCategories: ['pull'] } });
    });
    await flush();
    await expect(html()).toMatchFileSnapshot(snap(`follow-up-fallback-${tag(v2)}`));
  });

  it('follow-up — CMS title wins over the fallback', async () => {
    await toEvaluating();
    await act(async () => {
      S.evaluate.resolve({
        id: 'r1', name: 'r',
        action: { type: 'BRANCH_TO_FOLLOW_UP', followUpCategories: ['pull'], followUpTitle: { he: 'כותרת מה-CMS' } },
      });
    });
    await flush();
    await expect(html()).toMatchFileSnapshot(snap('follow-up-cms-title'));
  });

  it.each(V)('saving — phase 5 label (v2=%s)', async (v2) => {
    S.v2 = v2;
    await toResult();
    await click('accept');
    await expect(html()).toMatchFileSnapshot(snap(`saving-${tag(v2)}`));
  });

  it.each([
    ['network', 'unavailable'],
    ['deadline', 'deadline-exceeded'],
    ['network-code', 'auth/network-request-failed'],
    ['auth', 'permission-denied'],
    ['unauthenticated', 'unauthenticated'],
    ['generic', 'internal'],
    ['no-code', undefined],
  ] as const)('save error — %s', async (name, code) => {
    await toResult();
    await click('accept');
    await act(async () => { S.save.reject(code ? { code } : new Error('boom')); });
    await flush();
    await expect(html()).toMatchFileSnapshot(snap(`save-error-${name}`));
  });

  it('threshold mapping fails → fallback program, still reaches the result', async () => {
    await toEvaluating();
    await act(async () => { S.evaluate.resolve(null); });
    await flush();
    await act(async () => { S.mapping.reject(new Error('no thresholds')); });
    await flush();
    await click('result-loading');
    await expect(html()).toMatchFileSnapshot(snap('mapping-failed-result'));
  });

  it('alert — mini-domain save fails', async () => {
    S.miniActive = true;
    await toResult();
    await click('accept');
    await act(async () => { S.miniWrite.reject(new Error('boom')); });
    await flush();
    await expect(alerts.join('\n')).toMatchFileSnapshot('./__snapshots__/assessment-page-i18n/alert-mini-save-failed.txt');
  });

  it('alert — no signed-in user', async () => {
    S.currentUser = null;
    await toResult();
    await click('accept');
    await expect(alerts.join('\n')).toMatchFileSnapshot('./__snapshots__/assessment-page-i18n/alert-no-user.txt');
  });
});
