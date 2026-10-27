/**
 * i18n wave 2 batch ar (namespace `map`, keys `safecity.*`): viral-unlock sheet, privacy switcher, map overlay badges,
 * kudo toast. Snapshots recorded from the components BEFORE the extraction; the extracted components must render the
 * same Hebrew markup (v1 / v2 sheet shells, each privacy mode, female / male / unset sender).
 * Static markup, node env. `<!-- -->` is stripped before comparing (not rendered text).
 * The privacy dropdown (opens on tap) and the shared invite text are pinned key by key in
 * src/lib/i18n/__tests__/map-batch-ar-he.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const flags = { enableHomeV2: false };
const userState: { profile: Record<string, unknown> } = { profile: {} };
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
}));
vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
}));

import ViralUnlockSheet from '../ViralUnlockSheet';
import PrivacyModeSwitcher from '../PrivacyModeSwitcher';
import SafeCityOverlay from '../SafeCityOverlay';
import KudoToast from '../KudoToast';
import type { PresenceMarker } from '../../services/segregation.service';
import type { KudoDoc } from '../../services/kudos.service';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/safecity-i18n/${name}.html`;
const noop = () => {};

const setUser = (core: Record<string, unknown>) => { userState.profile = { id: 'u1', core }; };
beforeEach(() => { flags.enableHomeV2 = false; setUser({ referralCount: 0, affiliations: [{ type: 'city', name: 'תל אביב' }] }); });

const marker = (over: Partial<PresenceMarker> = {}): PresenceMarker => ({
  uid: 'm1', name: 'דנה כהן', ageGroup: 'adult', isVerified: true, schoolName: 'בית ספר אורט',
  lat: 32, lng: 34, updatedAt: new Date('2026-10-22T12:00:00'), ...over,
});

describe.each([false, true])('ViralUnlockSheet, v2=%s', (v2) => {
  it.each([0, 1])('referrals=%s', async (n) => {
    flags.enableHomeV2 = v2;
    setUser({ referralCount: n, gender: 'female' });
    await expect(html(<ViralUnlockSheet isOpen onClose={noop} />)).toMatchFileSnapshot(snap(`viral-${n}-${v2 ? 'v2' : 'v1'}`));
  });
});

describe('PrivacyModeSwitcher', () => {
  it('closed trigger', async () => {
    await expect(html(<PrivacyModeSwitcher />)).toMatchFileSnapshot(snap('switcher-closed'));
  });
});

describe('SafeCityOverlay', () => {
  it.each(['ghost', 'squad', 'verified_global'] as const)('mode %s', async (mode) => {
    await expect(html(<SafeCityOverlay markers={[marker(), marker({ uid: 'm2', name: 'יוסי', schoolName: null })]} heatmapCount={7} privacyMode={mode} ageGroup="adult" />)).toMatchFileSnapshot(snap(`overlay-${mode}`));
  });
  it('no markers, no heat', async () => {
    await expect(html(<SafeCityOverlay markers={[]} heatmapCount={0} privacyMode="squad" ageGroup="adult" />)).toMatchFileSnapshot(snap('overlay-empty'));
  });
});

describe('KudoToast', () => {
  it('shown', async () => {
    const kudo = { id: 'k1', fromName: 'נועה' } as unknown as KudoDoc;
    await expect(html(<KudoToast kudo={kudo} onDismiss={noop} />)).toMatchFileSnapshot(snap('kudo'));
  });
  it('hidden', () => { expect(html(<KudoToast kudo={null} onDismiss={noop} />)).toBe(''); });
});
