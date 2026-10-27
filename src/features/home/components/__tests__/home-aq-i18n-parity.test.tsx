/**
 * i18n wave 2 batch aq (namespace `home`): AlertModal, RunForecastWidget, StrengthVolumeWidget,
 * ConcentricRingsProgress centre label. Snapshots recorded BEFORE the extraction from unmodified
 * origin/main (static markup, `<!-- -->` stripped).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const h = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  summary: {} as Record<string, unknown>,
}));

vi.mock('framer-motion', async () => {
  const harness = await import('@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness');
  return harness.motionStub;
});
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {}, storage: {} }));
vi.mock('@/features/user', () => ({ useUserStore: () => ({ profile: h.profile }) }));
vi.mock('@/features/user/onboarding/utils/onboarding-entry', () => ({ seedOnboardingTrackEntry: () => {} }));
vi.mock('@/features/activity', () => ({
  useWeeklyProgress: () => ({ summary: h.summary }),
  useDailyActivity: () => ({ ringData: [], totalMinutesToday: 42, isLoading: false }),
}));
vi.mock('@/features/content/programs', () => ({ getProgramIcon: (k?: string) => <i data-icon={k} /> }));

import AlertModal from '../AlertModal';
import { RunForecastWidget } from '../widgets/RunForecastWidget';
import { StrengthVolumeWidget } from '../widgets/StrengthVolumeWidget';
import ConcentricRingsProgress from '../rings/ConcentricRingsProgress';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/home-aq-i18n/${name}.html`;
afterEach(() => {
  h.profile = null;
  h.summary = {};
});

describe('AlertModal', () => {
  it.each(['missed', 'comeback'] as const)('%s', async (type) => {
    await expect(html(<AlertModal type={type} onClose={() => {}} onAction={() => {}} />)).toMatchFileSnapshot(snap(`alert-${type}`));
  });
});

describe('RunForecastWidget', () => {
  it('predictions', async () => {
    await expect(html(<RunForecastWidget averagePaceMinPerKm={5.5} />)).toMatchFileSnapshot(snap('forecast-predictions'));
  });
  it('upsell', async () => {
    h.profile = { lifestyle: { dashboardMode: 'PERFORMANCE' } };
    await expect(html(<RunForecastWidget averagePaceMinPerKm={5.5} />)).toMatchFileSnapshot(snap('forecast-upsell'));
  });
});

describe('StrengthVolumeWidget', () => {
  it('full, strength only', async () => {
    h.summary = { categorySessions: { strength: 2, cardio: 0 }, categoryTotals: { cardio: 0 } };
    await expect(html(<StrengthVolumeWidget />)).toMatchFileSnapshot(snap('strength-full'));
  });
  it('full, hybrid', async () => {
    h.profile = { lifestyle: { primaryTrack: 'hybrid' } };
    h.summary = { categorySessions: { strength: 1, cardio: 1 }, categoryTotals: { cardio: 30 } };
    await expect(html(<StrengthVolumeWidget />)).toMatchFileSnapshot(snap('strength-hybrid'));
  });
  it('compact', async () => {
    await expect(html(<StrengthVolumeWidget layout="compact" />)).toMatchFileSnapshot(snap('strength-compact'));
  });
  it('custom rows', async () => {
    await expect(
      html(<StrengthVolumeWidget rows={[{ id: 'x', label: 'שורה', iconKey: 'muscle', completed: 1, target: 2 }]} />),
    ).toMatchFileSnapshot(snap('strength-custom'));
  });
  it('upsell', async () => {
    h.profile = { lifestyle: { dashboardMode: 'RUNNING' } };
    await expect(html(<StrengthVolumeWidget />)).toMatchFileSnapshot(snap('strength-upsell'));
  });
});

describe('ConcentricRingsProgress', () => {
  const ringData = [
    { id: 'strength', label: 'כוח', value: 10, max: 30, percentage: 33.3, color: '#00ADEF' },
    { id: 'cardio', label: 'קרדיו', value: 5, max: 20, percentage: 25, color: '#84cc16' },
    { id: 'maintenance', label: 'תחזוקה', value: 0, max: 10, percentage: 0, color: '#a855f7' },
  ] as never;
  it.each(['minutes', 'percentage', 'primary'] as const)('center %s', async (centerMode) => {
    await expect(html(<ConcentricRingsProgress ringData={ringData} centerMode={centerMode} />)).toMatchFileSnapshot(snap(`rings-${centerMode}`));
  });
});
