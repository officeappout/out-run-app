/**
 * i18n wave 2 batch w (namespace `coach`): Kelly / "קלי AI" screens — snapshots recorded BEFORE the
 * extraction, from unmodified origin/main: the /ai-coach page, the chat screen (classic + unified,
 * AI / team-only, every status / error / card / rating / proposal state reachable from props), the
 * entry rows (inbox, home v1/v2 × gender, unified Kelly row), the workout / aerobic / parks cards,
 * the proposal card and the memory sheet's first frame.
 *
 * Static markup (node env). Hooks that talk to Firestore / the API are mocked with plain values.
 * `<!-- -->` is stripped before comparing (react-dom/server's separator between adjacent text
 * nodes; not rendered text). States that need an effect or a tap: coach-i18n-jsdom-parity.test.tsx.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const hoisted = vi.hoisted(() => ({
  flags: {} as Record<string, unknown>,
  flagsLoading: false,
  access: { canUseAi: true, loading: false },
  userState: { profile: null as Record<string, unknown> | null },
  chat: {
    state: null as unknown,
    teamMode: false,
  },
  meta: { unreadForUser: 0, lastMessagePreview: '' as string | null },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('@/hooks/useFeatureFlags', () => ({
  useFeatureFlags: () => ({ flags: hoisted.flags, rawFlags: {}, loading: hoisted.flagsLoading }),
}));
vi.mock('@/features/user', () => {
  const useUserStore = (sel?: (s: typeof hoisted.userState) => unknown) => (sel ? sel(hoisted.userState) : hoisted.userState);
  (useUserStore as unknown as { getState: () => unknown }).getState = () => hoisted.userState;
  return { useUserStore };
});
vi.mock('../hooks/useAiCoachAccess', () => ({ useAiCoachAccess: () => hoisted.access }));
vi.mock('../hooks/useKellyThread', () => ({ useKellyThreadMeta: () => hoisted.meta }));
vi.mock('../hooks/useKellySituation', () => ({ useKellySituation: () => null }));
vi.mock('../hooks/useAiCoachChat', () => ({
  useAiCoachChat: () => ({
    state: hoisted.chat.state,
    send: () => {},
    retry: () => {},
    dismissError: () => {},
    setProposalStatus: () => {},
    teamMode: hoisted.chat.teamMode,
  }),
}));
vi.mock('../services/kelly-phase3-api', () => ({
  rateWorkout: async () => true,
  listMemory: () => new Promise(() => {}),
  deleteMemoryFact: async () => true,
  deleteAllMemory: async () => true,
}));
vi.mock('../services/schedule-proposal-api', () => ({
  confirmScheduleProposal: async () => 'applied',
  dismissScheduleProposal: async () => 'dismissed',
}));
vi.mock('../services/round4-actions', () => ({ openAerobicCard: async () => {}, parkHref: (id: string) => `/map?openPark=${id}`, runRound4Chip: async () => {} }));
vi.mock('@/features/user/onboarding/services/mini-domain-assessment', () => ({ startMiniDomainAssessment: () => {} }));
vi.mock('@/features/workouts/components/WorkoutPreviewDrawer', () => ({ default: () => null }));
vi.mock('@/features/home/components/WorkoutBuilderSheet', () => ({ default: () => null }));

import AiCoachPage from '@/app/ai-coach/page';
import AiCoachChat from '../components/AiCoachChat';
import { AiCoachHomeEntry, AiCoachInboxRow, KellyInboxRow } from '../components/AiCoachEntry';
import AiCoachProposalCard from '../components/AiCoachProposalCard';
import KellyMemorySheet from '../components/KellyMemorySheet';
import { AiCoachWorkoutCardError, AiCoachWorkoutCardFace, AiCoachWorkoutCardSkeleton } from '../components/AiCoachWorkoutCard';
import KellyAerobicCard from '../components/round4/KellyAerobicCard';
import KellyNearbyParks from '../components/round4/KellyNearbyParks';
import { initialChatState, type ChatState, type UiMessage } from '../state/chat-machine';
import type { WorkoutCard } from '@/lib/ai/coach/protocol';
import type { AerobicCardView, ParkCardView } from '@/lib/ai/coach/round4/types';
import type { ProposalView } from '@/lib/ai/coach/schedule-proposal/types';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/coach-i18n/${name}.html`;

const profileOf = (gender?: string) => ({ id: 'u1', core: { name: 'דנה כהן', gender } }) as unknown as UserFullProfile;

const card: WorkoutCard = {
  type: 'workout',
  workoutId: 'ai-core-home-1234',
  title: 'אימון ליבה בבית',
  minutes: 22,
  exerciseCount: 6,
  location: 'home',
  domains: ['core'],
  difficulty: 2,
};
const aerobic: AerobicCardView = {
  id: 'aer-test-0001',
  kind: 'easy_run',
  title: 'ריצה קלה של 25 דקות',
  minutes: 25,
  distanceKm: null,
  cue: 'קצב שיחה',
  strengthStops: false,
  route: { status: 'map' },
  goal: { type: 'time', value: 25 },
} as AerobicCardView;
const parks: ParkCardView[] = [
  { parkId: 'park1', name: 'גינת הכושר', distanceKm: 0.8, equipment: ['מתח', 'מקבילים'], area: null },
  { parkId: 'park2', name: 'פארק הירקון', distanceKm: 12.5, equipment: [], area: 'צפון' },
];
const proposal = (status: ProposalView['status']): ProposalView => ({
  id: 'p1',
  status,
  scope: 'this_week',
  title: 'הצעה לשבוע',
  lines: ['ראשון: כוח', 'שלישי: ריצה'],
});

const state = (partial: Partial<ChatState>): ChatState => ({ ...initialChatState, phase: 'idle', ...partial });
const msg = (partial: Partial<UiMessage> & { id: string }): UiMessage => ({ role: 'assistant', text: '', cards: [], ...partial });

const chatProps = { onClose: () => {} };

beforeAll(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterAll(() => vi.restoreAllMocks());
beforeEach(() => {
  hoisted.flags = {};
  hoisted.flagsLoading = false;
  hoisted.access = { canUseAi: true, loading: false };
  hoisted.userState.profile = profileOf('male') as unknown as Record<string, unknown>;
  hoisted.chat.state = state({});
  hoisted.chat.teamMode = false;
  hoisted.meta = { unreadForUser: 0, lastMessagePreview: '' };
});

describe('/ai-coach page', () => {
  it('loading (no profile yet)', async () => {
    hoisted.userState.profile = null;
    await expect(html(<AiCoachPage />)).toMatchFileSnapshot(snap('page-loading'));
  });
  it('no access, classic screen', async () => {
    hoisted.access = { canUseAi: false, loading: false };
    await expect(html(<AiCoachPage />)).toMatchFileSnapshot(snap('page-no-access'));
  });
});

describe('chat screen', () => {
  it('classic, loading the conversation', async () => {
    hoisted.chat.state = { ...initialChatState };
    await expect(html(<AiCoachChat profile={profileOf('male')} {...chatProps} />)).toMatchFileSnapshot(snap('chat-classic-loading'));
  });

  it.each(['male', 'female', undefined])('classic, empty (intro + quick replies), gender=%s', async (gender) => {
    await expect(html(<AiCoachChat profile={profileOf(gender)} {...chatProps} />)).toMatchFileSnapshot(
      snap(`chat-classic-intro-${gender ?? 'unset'}`),
    );
  });

  it('classic, phase2 (no hints → fallback placeholder)', async () => {
    await expect(html(<AiCoachChat profile={profileOf('male')} {...chatProps} phase2 />)).toMatchFileSnapshot(snap('chat-classic-phase2'));
  });

  it('unified AI: header, memory button, messages, ratings, team bubble, proposals, cards, round4, typing', async () => {
    hoisted.chat.state = state({
      phase: 'sending',
      messages: [
        msg({ id: 'm1', role: 'user', text: 'מה האימון היום?' }),
        msg({ id: 'm2', text: 'הנה אימון', cards: [card] }),
        msg({ id: 'm3', text: 'איך היה?', rated: 'easy' }),
        msg({ id: 'm4', text: 'איך היה?', rated: 'right' }),
        msg({ id: 'm5', text: 'איך היה?', rated: 'hard' }),
        msg({ id: 'm6', text: 'תשובה מהצוות', source: 'human' }),
        msg({ id: 'm7', text: 'תשובה מהצוות', source: 'human', senderName: 'דוד' }),
        msg({ id: 'm8', text: 'הצעה', proposal: proposal('pending') }),
        msg({ id: 'm9', text: 'הצעה', proposal: proposal('applied') }),
        msg({ id: 'm10', text: 'הצעה', proposal: proposal('dismissed') }),
        msg({ id: 'm11', text: 'ריצה ופארקים', round4: { aerobic, parks } }),
      ],
    });
    await expect(
      html(<AiCoachChat profile={profileOf('female')} {...chatProps} unified phase2 memory round4 proactive />),
    ).toMatchFileSnapshot(snap('chat-unified-ai'));
  });

  it('unified team-only: note + team placeholder', async () => {
    hoisted.chat.teamMode = true;
    await expect(html(<AiCoachChat profile={profileOf('male')} {...chatProps} unified teamOnly memory />)).toMatchFileSnapshot(
      snap('chat-unified-team'),
    );
  });

  it('tool running → checking label', async () => {
    hoisted.chat.state = state({ phase: 'running_tool', toolStatus: 'search', messages: [msg({ id: 'm1', role: 'user', text: 'שאלה' })] });
    await expect(html(<AiCoachChat profile={profileOf('male')} {...chatProps} unified />)).toMatchFileSnapshot(snap('chat-tool-status'));
  });

  it('workout building / failed', async () => {
    hoisted.chat.state = state({ phase: 'streaming', workoutBuild: 'building', messages: [msg({ id: 'm1', role: 'user', text: 'אימון' })] });
    const building = html(<AiCoachChat profile={profileOf('male')} {...chatProps} />);
    hoisted.chat.state = state({ workoutBuild: 'failed', messages: [msg({ id: 'm1', role: 'user', text: 'אימון' })] });
    const failed = html(<AiCoachChat profile={profileOf('male')} {...chatProps} />);
    await expect(`${building}\n${failed}`).toMatchFileSnapshot(snap('chat-workout-build'));
  });

  it.each([
    ['offline', { offline: true }],
    ['403', { status: 403 }],
    ['401', { status: 401 }],
    ['generic', { status: 500 }],
  ])('error %s', async (name, error) => {
    hoisted.chat.state = state({ phase: 'error', error: error as ChatState['error'], messages: [msg({ id: 'm1', role: 'user', text: 'שאלה' })] });
    await expect(html(<AiCoachChat profile={profileOf('male')} {...chatProps} />)).toMatchFileSnapshot(snap(`chat-error-${name}`));
  });
});

describe('entry rows', () => {
  it('inbox row (classic)', async () => {
    await expect(html(<AiCoachInboxRow />)).toMatchFileSnapshot(snap('entry-inbox-row'));
  });
  it.each([
    ['male', true],
    ['female', true],
    ['other', true],
    [undefined, true],
    ['male', false],
    ['female', false],
  ])('home entry gender=%s v2=%s', async (gender, v2) => {
    hoisted.userState.profile = profileOf(gender) as unknown as Record<string, unknown>;
    await expect(html(<AiCoachHomeEntry v2={v2} />)).toMatchFileSnapshot(snap(`entry-home-${gender ?? 'unset'}-v${v2 ? 2 : 1}`));
  });
  it('no access → nothing', () => {
    hoisted.access = { canUseAi: false, loading: false };
    expect(html(<AiCoachInboxRow />)).toBe('');
    expect(html(<AiCoachHomeEntry v2 />)).toBe('');
  });
  it('unified Kelly row: no preview / unread + preview', async () => {
    const empty = html(<KellyInboxRow />);
    hoisted.meta = { unreadForUser: 12, lastMessagePreview: 'שלום מהצוות' };
    const unread = html(<KellyInboxRow />);
    await expect(`${empty}\n${unread}`).toMatchFileSnapshot(snap('entry-kelly-row'));
  });
});

describe('cards', () => {
  it('workout card faces', async () => {
    const faces = [
      html(<AiCoachWorkoutCardFace card={card} thumbnailUrl="" onOpen={() => {}} />),
      html(<AiCoachWorkoutCardFace card={{ ...card, title: '', exerciseCount: 1, location: 'park', difficulty: 1 }} thumbnailUrl="" onOpen={() => {}} />),
      html(<AiCoachWorkoutCardFace card={{ ...card, minutes: 1234, exerciseCount: 1234, location: 'office', difficulty: undefined }} thumbnailUrl="" cachedDifficulty={3} onOpen={() => {}} />),
      html(<AiCoachWorkoutCardFace card={{ ...card, location: 'street', difficulty: undefined }} thumbnailUrl="" onOpen={() => {}} />),
      html(<AiCoachWorkoutCardFace card={{ ...card, location: 'moon' as WorkoutCard['location'] }} thumbnailUrl="" onOpen={() => {}} />),
    ];
    await expect(faces.join('\n')).toMatchFileSnapshot(snap('card-workout-faces'));
  });
  it('workout card skeleton / error', async () => {
    const out = [
      html(<AiCoachWorkoutCardSkeleton />),
      html(<AiCoachWorkoutCardError onRetry={() => {}} onBuilder={() => {}} />),
      html(<AiCoachWorkoutCardError />),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap('card-workout-states'));
  });
  it('aerobic card faces', async () => {
    const out = [
      html(<KellyAerobicCard card={aerobic} onOpen={() => {}} />),
      html(<KellyAerobicCard card={{ ...aerobic, kind: 'walk', minutes: null, distanceKm: 3.5, strengthStops: true, route: { status: 'found', distanceKm: 3.2 } }} onOpen={() => {}} />),
      html(<KellyAerobicCard card={{ ...aerobic, kind: 'program_run', minutes: null, route: { status: 'found' } }} onOpen={() => {}} />),
    ];
    await expect(out.join('\n')).toMatchFileSnapshot(snap('card-aerobic'));
  });
  it('nearby parks', async () => {
    await expect(html(<KellyNearbyParks parks={parks} onOpen={() => {}} />)).toMatchFileSnapshot(snap('card-parks'));
  });
  it('proposal card statuses', async () => {
    const out = (['pending', 'applying', 'applied', 'dismissed'] as const).map((s) =>
      html(<AiCoachProposalCard messageId="m1" proposal={proposal(s)} onStatus={() => {}} />),
    );
    await expect(out.join('\n')).toMatchFileSnapshot(snap('card-proposal'));
  });
  it('memory sheet, first frame (loading)', async () => {
    await expect(html(<KellyMemorySheet onClose={() => {}} />)).toMatchFileSnapshot(snap('memory-loading'));
  });
});
