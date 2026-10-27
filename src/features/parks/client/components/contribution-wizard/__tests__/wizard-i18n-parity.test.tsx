/**
 * i18n wave 2 batch ar (namespace `map`, keys `wizard.*`): add-location wizard, suggest-edit and quick-report sheets.
 * Snapshots recorded from the components BEFORE the extraction; the extracted components must render the same
 * Hebrew markup in v1 and v2 (enable_home_v2). Static markup (react-dom/server), node env.
 * `<!-- -->` is stripped before comparing (react-dom/server's separator between adjacent text nodes; not rendered text).
 * States behind a tap / async load (duplicate warning, equipment catalog, edit summary) are pinned key by key in
 * src/lib/i18n/__tests__/map-batch-ar-he.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const flags = { enableHomeV2: false };
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('@/features/user', () => {
  const state = { profile: { id: 'u1', core: { gender: 'male', isSuperAdmin: false } } };
  const useUserStore = (sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state);
  return { useUserStore };
});
vi.mock('@/features/parks/core/services/contribution.service', () => ({
  createContribution: async () => {},
  checkDuplicateNearby: async () => null,
}));
vi.mock('@/features/content/equipment/gym/core/gym-equipment.service', () => ({
  getGymEquipment: async () => null,
  getAllGymEquipment: async () => [],
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ showToast: () => {} }) }));
vi.mock('react-map-gl', () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div data-map>{children}</div>,
  Marker: ({ children }: { children?: React.ReactNode }) => <div data-marker>{children}</div>,
  AttributionControl: () => null,
}));

import { WizardV2Context } from '../wizard-v2';
import Step1LocationPicker from '../Step1LocationPicker';
import Step2Details from '../Step2Details';
import StepEquipment from '../StepEquipment';
import Step3Photo from '../Step3Photo';
import ContributionWizard from '../index';
import SuggestEditSheet from '../SuggestEditSheet';
import QuickReportSheet from '../QuickReportSheet';
import type { WizardData } from '../index';
import type { Park } from '@/features/parks/core/types/park.types';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/wizard-i18n/${name}.html`;
const noop = () => {};

const base: WizardData = {
  location: null, isPointOfInterest: false, parkName: '', facilityType: null, featureTags: [],
  gymEquipment: [], photoUrl: null, photoStoragePath: null,
};
const filled: WizardData = {
  ...base, location: { lat: 32.08, lng: 34.78 }, parkName: 'גינת כושר שנקין', facilityType: 'gym_park',
  featureTags: ['shaded', 'has_benches'], photoUrl: 'https://example.com/p.jpg',
};
const withV2 = (v2: boolean, el: ReactElement) => <WizardV2Context.Provider value={v2}>{el}</WizardV2Context.Provider>;
const park = {
  id: 'p1', name: 'פארק הירקון', location: { lat: 32.1, lng: 34.8 }, featureTags: ['shaded', 'dog_friendly'],
} as unknown as Park;

beforeEach(() => { flags.enableHomeV2 = false; });

describe.each([false, true])('wizard steps, v2=%s', (v2) => {
  const tag = v2 ? 'v2' : 'v1';
  it('step 1 — nothing picked', async () => {
    await expect(html(withV2(v2, <Step1LocationPicker data={base} updateData={noop} onNext={noop} />))).toMatchFileSnapshot(snap(`step1-empty-${tag}`));
  });
  it('step 1 — location + poi options', async () => {
    const d = { ...base, location: { lat: 32, lng: 34 }, isPointOfInterest: true };
    await expect(html(withV2(v2, <Step1LocationPicker data={d} updateData={noop} onNext={noop} />))).toMatchFileSnapshot(snap(`step1-poi-${tag}`));
  });
  it('step 2 — park', async () => {
    await expect(html(withV2(v2, <Step2Details data={filled} updateData={noop} onNext={noop} onBack={noop} />))).toMatchFileSnapshot(snap(`step2-park-${tag}`));
  });
  it('step 2 — poi', async () => {
    await expect(html(withV2(v2, <Step2Details data={{ ...filled, isPointOfInterest: true }} updateData={noop} onNext={noop} onBack={noop} />))).toMatchFileSnapshot(snap(`step2-poi-${tag}`));
  });
  it('equipment step (loading)', async () => {
    await expect(html(withV2(v2, <StepEquipment data={filled} updateData={noop} onNext={noop} onBack={noop} />))).toMatchFileSnapshot(snap(`equipment-loading-${tag}`));
  });
  it('step 3 — photo attached', async () => {
    await expect(html(withV2(v2, <Step3Photo data={filled} updateData={noop} onBack={noop} onSubmit={noop} submitting={false} />))).toMatchFileSnapshot(snap(`step3-photo-${tag}`));
  });
  it('step 3 — no photo, no name, submitting', async () => {
    await expect(html(withV2(v2, <Step3Photo data={base} updateData={noop} onBack={noop} onSubmit={noop} submitting />))).toMatchFileSnapshot(snap(`step3-empty-${tag}`));
  });
  it('wizard shell', async () => {
    flags.enableHomeV2 = v2;
    await expect(html(<ContributionWizard isOpen onClose={noop} initialLocation={null} />)).toMatchFileSnapshot(snap(`shell-${tag}`));
  });
  it('wizard closed', () => {
    flags.enableHomeV2 = v2;
    expect(html(<ContributionWizard isOpen={false} onClose={noop} />)).toBe('');
  });
  it('suggest edit sheet', async () => {
    flags.enableHomeV2 = v2;
    await expect(html(<SuggestEditSheet isOpen onClose={noop} park={park} />)).toMatchFileSnapshot(snap(`suggest-edit-${tag}`));
  });
  it('quick report sheet', async () => {
    flags.enableHomeV2 = v2;
    await expect(html(<QuickReportSheet isOpen onClose={noop} userLocation={{ lat: 32, lng: 34 }} />)).toMatchFileSnapshot(snap(`quick-report-${tag}`));
  });
});
