// @vitest-environment jsdom
/**
 * i18n wave 2 batch aq (namespace `profile`, keys `hubV1.*`): the v1 progress tab's own headings and the
 * primary badge — ProgressionScreen (flag off), MyProgramsSection, NeedsAssessmentSection, DiscoverMoreSection.
 * Snapshots recorded BEFORE the extraction from unmodified origin/main. Every card / header the files render
 * is a prop-printing stub, so the Hebrew these sections PASS DOWN (badge, hints) is pinned too.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  buckets: { mine: [] as unknown[], needsAssessment: [] as unknown[], discover: [] as unknown[] },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('../SkillMapCard', () => ({
  SkillMapCard: (p: Record<string, unknown>) => (
    <div data-card={String(p.programId)} data-state={String(p.state)} data-badge={String(p.badge ?? '')} data-hint={String(p.lockedHint ?? '')}>
      {String(p.nameHe)}
    </div>
  ),
}));
vi.mock('@/features/home/components/AddStrengthProgramCard', () => ({ default: () => <div data-add-card="" /> }));
vi.mock('@/features/user/identity/store/useUserStore', () => {
  const state = () => ({ profile: { core: {} } });
  return { useUserStore: (sel?: (s: unknown) => unknown) => (sel ? sel(state()) : state()) };
});
vi.mock('@/components/ui/AppHeader', () => ({ default: () => <div data-header="" /> }));
vi.mock('@/features/user/progression/components/IdentityHeroCard', () => ({ IdentityHeroCard: () => <div data-hero="" /> }));
vi.mock('@/features/progression-map/hooks/useProgressHubBuckets', () => ({
  useProgressHubBuckets: () => ({ ready: true, buckets: h.buckets }),
}));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: { enableHomeV2: false }, ready: true }) }));
vi.mock('../../v2/components/ProgressScreenV2', () => ({ default: () => null }));
vi.mock('../../v2/hub/ProgressHubScreen', () => ({ default: () => null }));
vi.mock('../../v2/hub/useProgressHubFlag', () => ({ isProgressHubOn: () => false }));
vi.mock('@/components/ui/v2/ScreenSkeleton', () => ({ default: () => null }));
vi.mock('@/features/user/onboarding/services/mini-domain-assessment', () => ({ startMiniDomainAssessment: () => {} }));
vi.mock('@/features/profile/components/widgets/program-groups.utils', () => ({ domainTypeForSlug: () => 'x' }));
vi.mock('@/lib/progression-map-config', () => ({ getProgressionMapProgramName: (id: string) => `שם ${id}` }));

import { mount, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';
import { ProgressionScreen } from '../ProgressionScreen';
import { MyProgramsSection } from '../MyProgramsSection';
import { NeedsAssessmentSection } from '../NeedsAssessmentSection';
import { DiscoverMoreSection } from '../DiscoverMoreSection';

const snap = (name: string) => `./__snapshots__/progression-hub-aq-i18n/${name}.html`;
let m: Mounted | null = null;
afterEach(() => {
  m?.unmount();
  m = null;
  document.body.innerHTML = '';
});

const mine = [
  { slug: 'a', programId: 'prog_a', role: 'primary' },
  { slug: 'b', programId: 'prog_b', role: 'active' },
  { slug: 'c', programId: 'prog_c', role: 'tracked' },
] as never[];
const needs = [{ slug: 'n', programId: 'prog_n' }] as never[];
const discover = [
  { slug: 'd1', programId: 'prog_d1', kind: 'parent' },
  { slug: 'd2', programId: 'prog_d2', kind: 'prereq', missing: 'x' },
] as never[];

describe('MyProgramsSection', () => {
  it('empty / pending / list', async () => {
    const parts: string[] = [];
    for (const [items, pending] of [[[], false], [[], true], [mine, false]] as const) {
      m = await mount(<MyProgramsSection items={items as never[]} hasPendingAssessment={pending} />);
      parts.push(m.html());
      m.unmount();
      m = null;
    }
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('my-programs'));
  });
});

describe('NeedsAssessmentSection', () => {
  it('empty / list', async () => {
    const parts: string[] = [];
    for (const items of [[], needs]) {
      m = await mount(<NeedsAssessmentSection items={items as never[]} />);
      parts.push(m.html());
      m.unmount();
      m = null;
    }
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('needs-assessment'));
  });
});

describe('DiscoverMoreSection', () => {
  it('collapsed / expanded', async () => {
    m = await mount(<DiscoverMoreSection items={discover} />);
    const parts = [m.html()];
    await m.click('button');
    parts.push(m.html());
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('discover'));
  });
});

describe('ProgressionScreen (flag off)', () => {
  it('empty / full', async () => {
    const parts: string[] = [];
    for (const b of [{ mine: [], needsAssessment: [], discover: [] }, { mine, needsAssessment: needs, discover }]) {
      h.buckets = b;
      m = await mount(<ProgressionScreen />);
      parts.push(m.html());
      m.unmount();
      m = null;
    }
    await expect(parts.join('\n')).toMatchFileSnapshot(snap('screen'));
  });
});
