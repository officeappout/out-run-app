/**
 * Sheets batch 4 — flag-OFF parity. The legacy markup of each migrated sheet
 * was recorded from its pre-migration component (the committed snapshot) and
 * must stay byte-identical; only the enable_home_v2 branch moved onto <Sheet>.
 * The v2 cases check that branch renders through the shared primitive.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

const flags = { enableHomeV2: false, kellyUnifiedV1: false };
const userState = { profile: { id: 'u1', core: { isSuperAdmin: false, name: 'דנה', photoURL: undefined } } };

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

// PostJoinSuccessDrawer
vi.mock('@/features/user/scheduling/services/communitySchedule.service', () => ({
  generateCommunityICS: () => '',
  downloadICS: () => {},
}));
// NeighborhoodPickerSheet
vi.mock('@/features/admin/services/authority.service', () => ({ getChildrenByParent: () => new Promise(() => {}) }));
// EditProfileModal
vi.mock('@/components/ui/ProfilePhotoUploader', () => ({ default: () => <div data-photo-uploader /> }));
vi.mock('@/features/profile/hooks/usePersonalInfoEditor', () => ({
  TRAINING_TAG_OPTIONS: [
    { id: 'run', label: 'ריצה' },
    { id: 'street', label: 'סטריט' },
  ],
  usePersonalInfoEditor: () => ({
    editName: 'דנה',
    setEditName: () => {},
    editBio: 'רצה בבקרים',
    setEditBio: () => {},
    editTrainingTags: ['run'],
    toggleTrainingTag: () => {},
    editSaving: false,
    openPersonalEdit: () => {},
    savePersonalEdit: async () => true,
  }),
}));
// SessionDrawer
vi.mock('@/features/parks/core/store/useGPSStore', () => {
  const state = { coords: null, requestPermissionIfAllowed: () => {} };
  const useGPSStore = (sel: (s: typeof state) => unknown) => sel(state);
  useGPSStore.getState = () => state;
  return { useGPSStore };
});
vi.mock('@/features/arena/components/AttendeesPreview', () => ({ default: () => <div data-attendees /> }));
vi.mock('@/features/arena/components/NavigationSheet', () => ({ default: () => null }));
vi.mock('@/features/arena/components/ReportContentSheet', () => ({ default: () => null }));
// SetSavedPlaceSheet
vi.mock('@/features/parks/core/services/mapbox.service', () => ({ MapboxService: { searchAddress: async () => [] } }));
vi.mock('@/features/user/places/store/useSavedPlacesStore', () => ({
  SAVED_PLACE_KIND_LABEL: { home: 'בית', work: 'עבודה' },
  useSavedPlacesStore: (sel: (s: { setPlace: () => void }) => unknown) => sel({ setPlace: () => {} }),
}));
// ChatInbox
vi.mock('@/features/social/hooks/useChatInbox', () => ({
  useChatInbox: () => ({
    isLoading: false,
    threads: [
      {
        id: 't1',
        type: 'dm',
        participants: ['u1', 'u2'],
        participantNames: { u2: 'נועה' },
        lastMessage: 'נתראה מחר',
        lastSenderId: 'u2',
        lastMessageAt: new Date(),
        unreadCount: { u1: 2 },
      },
    ],
  }),
}));
vi.mock('@/features/social/hooks/useAllChats', () => ({ useAllChats: () => ({ threads: [], isLoading: false }) }));
vi.mock('@/features/social/components/ChatThread', () => ({ default: () => <div data-chat-thread /> }));
vi.mock('@/features/arena/services/group.service', () => ({ getGroupById: async () => null }));
vi.mock('@/features/social/services/kelly-welcome-bot.service', () => ({ KELLY_UID: 'kelly', KELLY_NAME: 'קלי' }));
vi.mock('@/config/feature-flags', () => ({ isRootAdmin: () => false, SCHEDULE_BUILDER_DRAWER_ENABLED: true }));
vi.mock('@/features/ai-coach/components/AiCoachEntry', () => ({
  AiCoachInboxRow: () => <div data-ai-coach-row />,
  KellyInboxRow: () => <div data-kelly-row />,
}));
// ScheduleBuilderDrawer
vi.mock('@/components/ui/DrumTimePicker', () => ({ DrumTimePicker: () => <div data-drum /> }));
vi.mock('@/hooks/useSheetScrollChain', () => ({ useSheetScrollChain: () => ({ scrollRef: { current: null } }) }));
vi.mock('@/features/home/components/agenda/AgendaDayCard', () => ({ default: () => <div data-agenda-day /> }));
vi.mock('@/features/parks/core/components/hybrid/AerobicStrengthSlider', () => ({ default: () => <div data-slider /> }));
vi.mock('@/features/schedule/engine/weaverInput', () => ({
  defaultWeaveControls: () => ({ mode: 'mixed', focus: 50, availableDayCount: 3 }),
}));
vi.mock('@/features/schedule/engine/strengthVocabulary', () => ({ scheduleIdNameHe: () => 'כוח' }));
vi.mock('@/features/schedule/advisor/advisor', () => ({ adviseWeek: () => null }));
vi.mock('@/features/schedule/advisor/adapters/client', () => ({ toAdvisorInputFromClient: () => ({}), localDateKey: () => '2026-10-19' }));
vi.mock('@/features/schedule/services/scheduleBuilderSave.plan', () => ({ planScheduleSave: () => ({}) }));
vi.mock('@/features/schedule/services/scheduleBuilderSave', () => ({
  isScheduleBuilderSaveEnabled: () => false,
  saveScheduleProposal: async () => ({ ok: true }),
}));
vi.mock('@/features/workout-engine/services/program-hierarchy.utils', () => ({ resolveToSlug: (s: string) => s }));

import LeagueFilterSheet from '@/features/arena/components/LeagueFilterSheet';
import OpponentPickerSheet from '@/features/arena/components/OpponentPickerSheet';
import PostJoinSuccessDrawer from '@/features/arena/components/PostJoinSuccessDrawer';
import SessionDrawer from '@/features/arena/components/SessionDrawer';
import NeighborhoodPickerSheet from '@/features/profile/components/NeighborhoodPickerSheet';
import EditProfileModal from '@/features/profile/components/EditProfileModal';
import SetSavedPlaceSheet from '@/features/user/places/components/SetSavedPlaceSheet';
import ChatInbox from '@/features/social/components/ChatInbox';
import ScheduleBuilderDrawer from '@/features/schedule/components/ScheduleBuilderDrawer';
import type { ScopeCompetitionEntry } from '@/features/arena/services/ranking.service';
import type { CommunityEvent } from '@/types/community.types';
import type { ScheduleSlot } from '@/types/community.types';

const noop = () => {};
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

const entry = (scopeId: string, scopeName: string, rank: number, totalScore: number) =>
  ({ scopeId, scopeName, rank, totalScore }) as unknown as ScopeCompetitionEntry;

const leagueFilter = () =>
  html(<LeagueFilterSheet isOpen onClose={noop} genderFilter="female" onGenderFilterChange={noop} />);
const opponentPicker = () =>
  html(
    <OpponentPickerSheet
      isOpen
      onClose={noop}
      myEntry={entry('me', 'פלורנטין', 3, 1200)}
      candidates={[entry('a', 'נווה צדק', 1, 2400), entry('b', 'יפו', 2, 1800)]}
      selectedOpponentId="a"
      onSelect={noop}
    />,
  );
const postJoin = () =>
  html(
    <PostJoinSuccessDrawer
      isOpen
      onClose={noop}
      name="רצי הירקון"
      verb="ירוץ"
      onOpenChat={noop}
      scheduleSlots={[{ dayOfWeek: 1, time: '07:00' } as unknown as ScheduleSlot]}
    />,
  );
const event = {
  id: 'e1',
  name: 'אימון בוקר בפארק',
  category: 'fitness_day',
  date: new Date(2026, 9, 20),
  startTime: '07:00',
  endTime: '08:00',
  currentRegistrations: 4,
  maxParticipants: 12,
  description: 'אימון כוח וריצה קלה',
  location: { address: 'פארק הירקון', location: { lat: 0, lng: 0 } },
  isOfficial: true,
} as unknown as CommunityEvent;
const session = () => html(<SessionDrawer isOpen onClose={noop} event={event} onJoin={noop} />);
const neighborhood = () =>
  html(
    <NeighborhoodPickerSheet
      isOpen
      onClose={noop}
      cityAuthorityId="tlv"
      cityName="תל אביב"
      currentNeighborhoodId={null}
      onSelect={noop}
    />,
  );
const editProfile = () => html(<EditProfileModal isOpen onClose={noop} />);
const savedPlace = () => html(<SetSavedPlaceSheet openKind="home" onClose={noop} />);
const chatInbox = () => html(<ChatInbox isOpen onClose={noop} />);
const scheduleBuilder = () => html(<ScheduleBuilderDrawer isOpen onClose={noop} />);

beforeEach(() => {
  flags.enableHomeV2 = false;
});

describe('flag off — byte-identical to the pre-migration markup', () => {
  it('LeagueFilterSheet', () => {
    expect(leagueFilter()).toMatchSnapshot();
  });
  it('OpponentPickerSheet', () => {
    expect(opponentPicker()).toMatchSnapshot();
  });
  it('PostJoinSuccessDrawer', () => {
    expect(postJoin()).toMatchSnapshot();
  });
  it('SessionDrawer', () => {
    expect(session()).toMatchSnapshot();
  });
  it('NeighborhoodPickerSheet', () => {
    expect(neighborhood()).toMatchSnapshot();
  });
  it('EditProfileModal', () => {
    expect(editProfile()).toMatchSnapshot();
  });
  it('SetSavedPlaceSheet', () => {
    expect(savedPlace()).toMatchSnapshot();
  });
  it('ChatInbox', () => {
    expect(chatInbox()).toMatchSnapshot();
  });
  it('ScheduleBuilderDrawer', () => {
    expect(scheduleBuilder()).toMatchSnapshot();
  });
});

describe('flag on — the shared <Sheet>', () => {
  beforeEach(() => {
    flags.enableHomeV2 = true;
  });
  it('LeagueFilterSheet: z 48/49 in place, grabber drag, tint selection, CTA footer', () => {
    const out = leagueFilter();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index:49');
    expect(out).toContain('z-index:48');
    expect(out).toContain('cursor-grab');
    expect(out).toContain('bg-v2-tint text-v2-deep');
    expect(out).toContain('bg-v2-cta');
    expect(out).toContain('calc(env(safe-area-inset-bottom, 0px) + 56px)');
    expect(out).toContain('data-v2-icon-button="surface"');
  });
  it('OpponentPickerSheet: z 48/49, subtitle in the header, list kept', () => {
    const out = opponentPicker();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index:49');
    expect(out).toContain('z-index:48');
    expect(out).toContain('רק היריבה מתחלפת');
    expect(out).toContain('נווה צדק');
    expect(out).toContain('data-v2-icon-button="surface"');
  });
  it('PostJoinSuccessDrawer: z 90/91, blurred backdrop, width-capped, body kept', () => {
    const out = postJoin();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index:91');
    expect(out).toContain('z-index:90');
    expect(out).toContain('backdrop-filter:blur(4px)');
    expect(out).toContain('max-w-md mx-auto');
    expect(out).toContain('הצטרפת ל-רצי הירקון');
    expect(out).toContain('data-v2-icon-button="surface"');
  });
  it('SessionDrawer: z 80/81, 85vh frame, media hero with glass close', () => {
    const out = session();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index:81');
    expect(out).toContain('z-index:80');
    expect(out).toContain('height:85vh');
    expect(out).toContain('data-v2-icon-button="glass"');
    expect(out).toContain('אימון בוקר בפארק');
    expect(out).toContain('data-attendees');
  });
  it('NeighborhoodPickerSheet: z 70/71, blurred backdrop, city subtitle', () => {
    const out = neighborhood();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index:71');
    expect(out).toContain('z-index:70');
    expect(out).toContain('backdrop-filter:blur(12px)');
    expect(out).toContain('בתל אביב');
    expect(out).toContain('טוען שכונות');
  });
  it('EditProfileModal: nested, keyboard-aware, z 100, CTA footer', () => {
    const out = editProfile();
    expect(out).toContain('data-v2-sheet-modal="nested"');
    expect(out).toContain('kb-fit fixed inset-0');
    expect(out).toContain('kb-cap');
    expect(out).toContain('z-index:100');
    expect(out).toContain('sm:items-center');
    expect(out).toContain('max-h-[92vh]');
    expect(out).toContain('bg-v2-cta');
    expect(out).toContain('placeholder="שמך"');
    expect(out).toContain('data-v2-icon-button="surface"');
  });
  it('SetSavedPlaceSheet: z 100/100 in place, rides the keyboard, input kept', () => {
    const out = savedPlace();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('kb-sheet fixed');
    expect(out).toContain('kb-cap');
    expect(out.match(/z-index:100/g)?.length).toBe(2);
    expect(out).toContain('var(--kb-safe-bottom)');
    expect(out).toContain('הגדרת בית');
    expect(out).toContain('placeholder="כתובת הבית שלך..."');
  });
  it('ChatInbox: z 100/101 in place, keyboard-aware, 90dvh, list kept', () => {
    const out = chatInbox();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out).toContain('z-index:101');
    expect(out).toContain('z-index:100');
    expect(out).toContain('kb-sheet fixed');
    expect(out).toContain('h-[90dvh]');
    expect(out).toContain('aria-label="חיפוש שיחות"');
    expect(out).toContain('נועה');
  });
  it('ScheduleBuilderDrawer: z 101, tinted surface, 92vh, handle-row drag', () => {
    const out = scheduleBuilder();
    expect(out).toContain('data-v2-sheet-surface');
    expect(out.match(/z-index:101/g)?.length).toBe(2);
    expect(out).toContain('rounded-t-[28px] bg-v2-surface shadow-v2-sheet');
    expect(out).toContain('height:92vh');
    expect(out).toContain('cursor-grab');
    expect(out).toContain('בואו נבנה לוז');
    expect(out).toContain('data-v2-icon-button="white-ring"');
  });
});
