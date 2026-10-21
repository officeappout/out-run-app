/**
 * i18n wave 2 (namespace `player`): the shared workout components in
 * src/features/workout-engine/components (top level only — not strength/, not cards/, not the busy
 * PostWorkoutSurvey / RunShareBar): GpsIndicator, ShareAsLiveToggle, WorkoutPreviewHeader,
 * CoachNoteBlock, StrengthOverviewCard. The snapshots below were recorded BEFORE the extraction from
 * unmodified origin/main — every status, v1 / v2 styling, male / female / other / unset gender,
 * every activity, every difficulty and duration shape.
 *
 * Static markup (react-dom/server, node env). useUserStore is a selector-hook fake (the real store
 * pulls Firebase in). `<!-- -->` is stripped before comparing (react-dom/server's separator between
 * adjacent text nodes — `{n} דק'` is two nodes before, one `t()` string after; not rendered text).
 * StrengthOverviewCard's smart description renders only after mount (useIsMounted) — it is CMS
 * template text (@-tags), left as is.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const userState: { profile: Record<string, unknown> | null } = { profile: null };

vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ back: () => {}, push: () => {} }) }));
vi.mock('@/features/workout-engine/summary/components/running/RunMapBlock', () => ({ default: () => <div data-stub="run-map" /> }));
vi.mock('@/features/safecity/services/presence.service', () => ({ updatePresence: async () => {}, clearPresence: async () => {} }));
vi.mock('@/features/safecity/store/usePrivacyStore', () => ({ usePrivacyStore: { getState: () => ({ mode: 'public' }) } }));
vi.mock('@/features/parks/client/components/planned-activity/PlannedActivityComposeSheet', () => ({
  default: (p: { initialType: string }) => <div data-stub="compose" data-type={p.initialType} />,
}));
vi.mock('@/features/workout-engine/shared/utils/gear-mapping.utils', () => ({
  resolveEquipmentLabel: (id: string) => `ציוד-${id}`,
  resolveEquipmentSvgPathList: (id: string) => (id === 'rings' ? ['/icons/rings.svg'] : []),
}));
vi.mock('@/features/content/branding/core/branding.utils', () => ({ resolveDescription: (s: string) => s }));

import GpsIndicator, { type GpsStatus } from '../GpsIndicator';
import ShareAsLiveToggle from '../ShareAsLiveToggle';
import WorkoutPreviewHeader from '../WorkoutPreviewHeader';
import CoachNoteBlock from '../CoachNoteBlock';
import StrengthOverviewCard from '../StrengthOverviewCard';
import type { WorkoutPlan } from '@/features/parks';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/workout-components-i18n/${name}.html`;

beforeEach(() => {
  userState.profile = null;
});

describe('GpsIndicator', () => {
  it('every status, with and without accuracy', async () => {
    const statuses: GpsStatus[] = ['searching', 'poor', 'good', 'perfect', 'simulated'];
    const out = statuses.flatMap((s) => [html(<GpsIndicator status={s} accuracy={null} />), html(<GpsIndicator status={s} accuracy={7.6} />)]);
    out.push(html(<GpsIndicator status={'weird' as GpsStatus} accuracy={3} />));
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('gps'));
  });
});

describe('ShareAsLiveToggle', () => {
  const ACTIVITIES = ['strength', 'running', 'walking', 'cycling'] as const;
  it.each([false, true])('v2=%s: every activity × prop gender', async (v2) => {
    const out: string[] = [];
    for (const a of ACTIVITIES) {
      for (const gender of ['male', 'female', 'other', undefined] as const) {
        out.push(html(<ShareAsLiveToggle activityType={a} workoutTitle="אימון" gender={gender} v2={v2} />));
      }
    }
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`share-live-v${v2 ? 2 : 1}`));
  });
  it('gender from the stored profile (female / other / odd / none)', async () => {
    const out: string[] = [];
    for (const g of ['female', 'other', 'nonbinary', undefined]) {
      userState.profile = { core: g ? { gender: g } : {} };
      out.push(html(<ShareAsLiveToggle activityType="running" workoutTitle="ריצה" />));
      out.push(html(<ShareAsLiveToggle activityType="walking" workoutTitle="ריצה" v2 />));
    }
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('share-live-stored'));
  });
});

describe('WorkoutPreviewHeader + CoachNoteBlock', () => {
  it('difficulty 0..4 × duration', async () => {
    const out: string[] = [];
    for (const difficulty of [undefined, 1, 2, 3, 4]) {
      for (const estimatedDuration of [undefined, 0, 45]) {
        out.push(html(<WorkoutPreviewHeader title="אימון כוח" description="תיאור" coverImage="/c.jpg" difficulty={difficulty} estimatedDuration={estimatedDuration} />));
      }
    }
    out.push(html(<WorkoutPreviewHeader title="ריצה" routePath={[[34.8, 32.1], [34.81, 32.11]]} />));
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('preview-header'));
  });
  it('coach note v1 / v2 / empty', async () => {
    const out = [
      html(<CoachNoteBlock note="שמור על גב ישר." />),
      html(<CoachNoteBlock note="שמור על גב ישר." v2 className="pb-2" />),
      html(<CoachNoteBlock note="" />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('coach-note'));
  });
});

describe('StrengthOverviewCard', () => {
  const plan = (over: Partial<WorkoutPlan>, muscles?: string[]): WorkoutPlan =>
    ({
      id: 'w1',
      name: 'אימון',
      totalDuration: 1800,
      difficulty: 'medium',
      segments: [
        {
          id: 's1',
          exercises: [
            { id: 'e1', name: 'שכיבות סמיכה', reps: '10 חזרות', equipment: ['rings', 'none'], ...(muscles ? { muscleGroups: muscles } : {}) },
            { id: 'e2', name: 'מתח', duration: '30 שניות', equipment: ['bar', 'bodyweight'], imageUrl: '/x.png' },
          ],
        },
        { id: 's2' },
      ],
      ...over,
    }) as unknown as WorkoutPlan;
  it('difficulties, durations, default and listed muscles (incl. an unknown one)', async () => {
    const out = [
      html(<StrengthOverviewCard workoutPlan={plan({})} onStartWorkout={() => {}} />),
      html(<StrengthOverviewCard workoutPlan={plan({ difficulty: 'easy', totalDuration: 3600 }, ['chest', 'back', 'shoulders', 'abs', 'obliques', 'forearms'])} onStartWorkout={() => {}} />),
      html(<StrengthOverviewCard workoutPlan={plan({ difficulty: 'hard', totalDuration: 5400 }, ['biceps', 'triceps', 'quads', 'hamstrings', 'glutes'])} onStartWorkout={() => {}} />),
      html(<StrengthOverviewCard workoutPlan={plan({ difficulty: 'extreme' as never, totalDuration: 0 }, ['calves', 'traps', 'cardio', 'full_body', 'core'])} onStartWorkout={() => {}} />),
      html(<StrengthOverviewCard workoutPlan={plan({ difficulty: undefined as never, totalDuration: 7259 }, ['legs', 'neck'])} onStartWorkout={() => {}} />),
      html(<StrengthOverviewCard workoutPlan={plan({ segments: [] })} onStartWorkout={() => {}} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('strength-overview'));
  });
});
