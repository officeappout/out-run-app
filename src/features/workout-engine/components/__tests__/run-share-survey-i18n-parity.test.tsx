/**
 * i18n wave 2 (namespace `player`, batch ap): RunShareBar, PostWorkoutSurvey (+ compact), XpStatusRow.
 * Snapshots recorded BEFORE the extraction from unmodified origin/main. Static markup (react-dom/server);
 * `<!-- -->` stripped before comparing. State reached only through clicks (survey "thanks" message, the
 * share texts, "busy" label) is pinned by the key test (player-batch-ap-he.test.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('@/features/user', () => ({ useUserStore: (sel?: (s: unknown) => unknown) => (sel ? sel({ profile: null }) : { profile: null }) }));
vi.mock('@/features/safecity/services/presence.service', () => ({ updatePresence: async () => {}, clearPresence: async () => {} }));
vi.mock('@/features/safecity/store/usePrivacyStore', () => ({ usePrivacyStore: { getState: () => ({ mode: 'public' }) } }));
vi.mock('@/features/parks/client/components/planned-activity/PlannedActivityComposeSheet', () => ({ default: () => null }));
vi.mock('@/lib/workoutInvite', () => ({ createRunInvite: async () => ({}) }));
vi.mock('../ShareAsLiveToggle', () => ({ default: (p: { workoutTitle: string }) => <div data-stub="live" data-title={p.workoutTitle} /> }));

import RunShareBar from '../RunShareBar';
import PostWorkoutSurvey, { PostWorkoutSurveyCompact } from '../PostWorkoutSurvey';
import XpStatusRow from '../strength/components/XpStatusRow';
import { useLocaleStore } from '@/store/useLocaleStore';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/run-share-survey-i18n/${name}.html`;
const noop = () => {};

beforeEach(() => {
  Object.assign(useLocaleStore.getInitialState(), { gender: 'other' });
});

describe('RunShareBar', () => {
  it.each([false, true])('every timing x activity, v2=%s', async (v2) => {
    const out: string[] = [];
    for (const activityType of ['running', 'walking'] as const) {
      out.push(html(<RunShareBar activityType={activityType} userLocation={null} v2={v2} />));
      out.push(html(<RunShareBar activityType={activityType} userLocation={null} v2={v2} timing="later" schedDate="2026-11-03" schedTime="18:30" />));
      out.push(html(<RunShareBar activityType={activityType} userLocation={null} v2={v2} nowInvite={{ pending: false, onChange: noop }} />));
      out.push(html(<RunShareBar activityType={activityType} userLocation={null} v2={v2} nowInvite={{ pending: true, onChange: noop }} />));
    }
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`run-share-bar-v${v2 ? 2 : 1}`));
  });
});

describe('PostWorkoutSurvey / XpStatusRow', () => {
  it('survey, compact survey (dismiss shown / hidden, hidden)', async () => {
    const out = [
      html(<PostWorkoutSurvey sessionCount={1} onSubmit={noop} onDismiss={noop} />),
      html(<PostWorkoutSurvey sessionCount={1} onSubmit={noop} />),
      html(<PostWorkoutSurvey sessionCount={5} onSubmit={noop} />),
      html(<PostWorkoutSurveyCompact sessionCount={1} onSubmit={noop} />),
    ].join('\n\n');
    await expect(out).toMatchFileSnapshot(snap('survey'));
  });
  it('XpStatusRow, every status and gender', async () => {
    const out: string[] = [];
    for (const gender of ['male', 'female', 'other'] as const) {
      Object.assign(useLocaleStore.getInitialState(), { gender });
      for (const xpStatus of ['pending', 'awarded', 'failed'] as const) {
        out.push(html(<XpStatusRow xpStatus={xpStatus} xpEarnedAmount={42.6} xpControls={{} as never} onRetry={noop} />));
      }
    }
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('xp-status'));
  });
});
