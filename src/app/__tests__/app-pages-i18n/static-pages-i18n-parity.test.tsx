/**
 * i18n wave 2 (app pages: namespaces `legal`, `onboarding` join.* / legacyRedirect.*, `map` mapError.*,
 * `community` leagueLink.*): Hebrew markup parity of the route pages that render their copy on the
 * first (static) render. Snapshots recorded BEFORE the extraction, from unmodified origin/main.
 *
 * The legal pages are server components: rendered with react-dom/server as plain functions, and their
 * `metadata` (a static export before the extraction, `generateMetadata()` after) is snapshotted as JSON.
 * `<!-- -->` is stripped before comparing (react-dom/server's separator between adjacent text nodes;
 * not rendered text) — the BEFORE snapshots were recorded stripped too.
 */
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('next/navigation', () => {
  const router = { push: () => {}, replace: () => {}, back: () => {}, prefetch: () => {} };
  const params = new URLSearchParams('');
  return { useRouter: () => router, useSearchParams: () => params, useParams: () => ({}) };
});
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/features/safecity/services/referral.service', () => ({ captureReferralParam: () => {} }));

import AccessibilityPage, * as accessibilityMod from '@/app/accessibility/page';
import PrivacyPage, * as privacyMod from '@/app/privacy/page';
import DeleteDataPage, * as deleteDataMod from '@/app/delete-data/page';
import ReferralJoinPage from '@/app/join/page';
import OnboardingRedirect from '@/app/onboarding/page';
import LeagueDeepLinkPage from '@/app/league/page';
import MapError from '@/app/map/error';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/static/${name}.html`;

type MetaModule = { metadata?: unknown; generateMetadata?: () => unknown };
const meta = async (mod: MetaModule) =>
  JSON.stringify(mod.metadata ?? (await mod.generateMetadata?.()), null, 2);

describe('legal pages (server components)', () => {
  it('accessibility statement', async () => {
    await expect(html(<AccessibilityPage />)).toMatchFileSnapshot(snap('accessibility'));
    await expect(await meta(accessibilityMod as MetaModule)).toMatchFileSnapshot(snap('accessibility-metadata'));
  });

  it('privacy policy', async () => {
    await expect(html(<PrivacyPage />)).toMatchFileSnapshot(snap('privacy'));
    await expect(await meta(privacyMod as MetaModule)).toMatchFileSnapshot(snap('privacy-metadata'));
  });

  it('delete data', async () => {
    await expect(html(<DeleteDataPage />)).toMatchFileSnapshot(snap('delete-data'));
    await expect(await meta(deleteDataMod as MetaModule)).toMatchFileSnapshot(snap('delete-data-metadata'));
  });
});

describe('redirect / error pages', () => {
  it('/join referral landing', async () => {
    await expect(html(<ReferralJoinPage />)).toMatchFileSnapshot(snap('join-referral'));
  });

  it('/onboarding legacy redirect', async () => {
    await expect(html(<OnboardingRedirect />)).toMatchFileSnapshot(snap('onboarding-redirect'));
  });

  it('/league deep link', async () => {
    await expect(html(<LeagueDeepLinkPage />)).toMatchFileSnapshot(snap('league'));
  });

  it('/map error boundary', async () => {
    const error = Object.assign(new Error('boom'), { digest: 'd' });
    await expect(html(<MapError error={error} reset={() => {}} />)).toMatchFileSnapshot(snap('map-error'));
  });
});
