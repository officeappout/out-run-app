/**
 * i18n extraction batch ui-2 (namespace `player`, `lobby.*` / `together.strip.*` / `milestone.*`): the classic session
 * lobby, the participant strip and the milestone feed. Snapshots recorded from unmodified origin/main
 * (`<!-- -->` stripped). Zustand stores render their INITIAL state under react-dom/server, so state is written there.
 */
import { beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

type UserState = { profile: { id: string; core: { name: string; isSuperAdmin: boolean } } };
const userState: UserState = { profile: { id: 'u1', core: { name: 'דנה', isSuperAdmin: false } } };

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('firebase/firestore', () => ({ getDoc: () => new Promise(() => {}), doc: () => ({}) }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: { enableHomeV2: false, enableTogetherLayerV1: false }, loading: false }) }));
vi.mock('@/features/user', () => {
  const useUserStore = (sel?: (s: UserState) => unknown) => (sel ? sel(userState) : userState);
  useUserStore.getState = () => userState;
  return { useUserStore };
});
vi.mock('@/features/user/identity/store/useUserStore', () => {
  const useUserStore = (sel?: (s: UserState) => unknown) => (sel ? sel(userState) : userState);
  useUserStore.getState = () => userState;
  return { useUserStore };
});
vi.mock('@/features/arena/services/booking.service', () => ({ bookSession: async () => {} }));
vi.mock('@/features/arena/services/group-invitation.service', () => ({ createSessionInvitation: async () => ({ url: '' }) }));
vi.mock('@/features/arena/services/session-phase.service', () => ({ setSessionPhase: async () => {} }));
vi.mock('@/lib/workoutInvite', () => ({ createRunInvite: async () => ({ shareUrl: '' }) }));

import SessionLobbyOverlay from '../SessionLobbyOverlay';
import ParticipantStrip from '../ParticipantStrip';
import { useSharedSession } from '@/features/workout-engine/core/store/useSharedSession';
import { useLocaleStore } from '@/store/useLocaleStore';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/shared-i18n/${name}.html`;
const SESSION_DEFAULTS = { ...useSharedSession.getInitialState() };

beforeEach(() => {
  Object.assign(useSharedSession.getInitialState(), SESSION_DEFAULTS);
  Object.assign(useLocaleStore.getInitialState(), { gender: 'other' });
});

it.each(['female', 'male', 'other'])('lobby, empty roster, %s', async (gender) => {
  Object.assign(useLocaleStore.getInitialState(), { gender });
  Object.assign(useSharedSession.getInitialState(), { groupId: 'g1', groupName: 'ריצת בוקר', attendanceId: '2026-10-15_07-00', phase: 'lobby', attendeeProfiles: {} });
  await expect(html(<SessionLobbyOverlay onStartFreeRun={() => {}} />)).toMatchFileSnapshot(snap(`lobby-empty-${gender}`));
});

it('lobby, roster with me', async () => {
  Object.assign(useSharedSession.getInitialState(), {
    groupId: 'g1',
    groupName: 'ריצת בוקר',
    attendanceId: '2026-10-15_07-00',
    phase: 'lobby',
    attendeeProfiles: { u1: { name: 'דנה' }, u2: { name: 'אורי' } },
  });
  await expect(html(<SessionLobbyOverlay onStartFreeRun={() => {}} />)).toMatchFileSnapshot(snap('lobby-roster'));
});

it('active phase (before the countdown starts)', async () => {
  Object.assign(useSharedSession.getInitialState(), { groupId: 'g1', groupName: 'ריצת בוקר', attendanceId: '2026-10-15_07-00', phase: 'active' });
  await expect(html(<SessionLobbyOverlay onStartFreeRun={() => {}} />)).toMatchFileSnapshot(snap('active'));
});

it.each([
  ['no-distance', 0],
  ['short', 2.34],
  ['long', 1234.5],
])('participant strip %s', async (name, km) => {
  await expect(html(<ParticipantStrip partnerPositions={[]} totalDistanceKm={km} />)).toMatchFileSnapshot(snap(`strip-${name}`));
});
