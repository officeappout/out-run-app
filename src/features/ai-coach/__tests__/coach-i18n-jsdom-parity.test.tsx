// @vitest-environment jsdom
/**
 * i18n wave 2 batch w (namespace `coach`): Kelly states that only appear after an effect or a tap —
 * the memory sheet (loaded list, empty, failed, "delete all?" confirm), the proposal card's notes
 * after confirm / dismiss for every outcome, and the chat's offline banner, "card no longer on this
 * device" note and memory sheet opened from the header. Recorded BEFORE the extraction from
 * unmodified origin/main. react-dom/client in jsdom; services mocked; React `:rN:` ids normalised.
 * Static states: coach-i18n-parity.test.tsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const hoisted = vi.hoisted(() => ({
  memory: null as null | Array<{ id: string; category: string; text: string }>,
  outcome: 'stale' as string,
  chatState: null as unknown,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('@/features/user', () => {
  const s = { profile: null };
  const useUserStore = (sel?: (x: typeof s) => unknown) => (sel ? sel(s) : s);
  (useUserStore as unknown as { getState: () => unknown }).getState = () => s;
  return { useUserStore };
});
vi.mock('../services/kelly-phase3-api', () => ({
  rateWorkout: async () => true,
  listMemory: async () => hoisted.memory,
  deleteMemoryFact: async () => true,
  deleteAllMemory: async () => true,
}));
vi.mock('../services/schedule-proposal-api', () => ({
  confirmScheduleProposal: async () => hoisted.outcome,
  dismissScheduleProposal: async () => hoisted.outcome,
}));
vi.mock('../hooks/useKellySituation', () => ({ useKellySituation: () => null }));
vi.mock('../hooks/useAiCoachChat', () => ({
  useAiCoachChat: () => ({
    state: hoisted.chatState,
    send: () => {},
    retry: () => {},
    dismissError: () => {},
    setProposalStatus: () => {},
    teamMode: false,
  }),
}));
vi.mock('../services/round4-actions', () => ({ openAerobicCard: async () => {}, parkHref: (id: string) => id, runRound4Chip: async () => {} }));
vi.mock('@/features/user/onboarding/services/mini-domain-assessment', () => ({ startMiniDomainAssessment: () => {} }));
vi.mock('@/features/workouts/components/WorkoutPreviewDrawer', () => ({ default: () => null }));
vi.mock('@/features/home/components/WorkoutBuilderSheet', () => ({ default: () => null }));

import KellyMemorySheet from '../components/KellyMemorySheet';
import AiCoachProposalCard from '../components/AiCoachProposalCard';
import AiCoachChat from '../components/AiCoachChat';
import { initialChatState } from '../state/chat-machine';
import type { UserFullProfile } from '@/features/user/core/types/user.types';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView = function scrollIntoView() {};

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const norm = (s: string) => s.replace(/:r[0-9a-z]+:/g, ':rN:');
const snap = (name: string) => `./__snapshots__/coach-i18n/jsdom-${name}.html`;

async function mount(el: ReactElement) {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(el);
  });
  await act(async () => {
    await Promise.resolve();
  });
}
const out = () => norm(host!.innerHTML);
async function click(match: (b: HTMLButtonElement) => boolean) {
  const btn = Array.from(host!.querySelectorAll('button')).find(match);
  if (!btn) throw new Error('button not found');
  await act(async () => {
    btn.click();
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}
const byText = (text: string) => (b: HTMLButtonElement) => (b.textContent ?? '').trim() === text;

beforeEach(() => {
  hoisted.memory = null;
  hoisted.outcome = 'stale';
  hoisted.chatState = { ...initialChatState, phase: 'idle' };
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: true });
});

describe('memory sheet', () => {
  it('failed load', async () => {
    hoisted.memory = null;
    await mount(<KellyMemorySheet onClose={() => {}} />);
    await expect(out()).toMatchFileSnapshot(snap('memory-failed'));
  });
  it('empty', async () => {
    hoisted.memory = [];
    await mount(<KellyMemorySheet onClose={() => {}} />);
    await expect(out()).toMatchFileSnapshot(snap('memory-empty'));
  });
  it('list + delete-all confirm', async () => {
    hoisted.memory = [
      { id: 'f1', category: 'injury', text: 'כאב בברך שמאל' },
      { id: 'f2', category: 'schedule', text: 'מתאמן בבקרים' },
      { id: 'f3', category: 'unknown_kind', text: 'משהו' },
    ];
    await mount(<KellyMemorySheet onClose={() => {}} />);
    const list = out();
    await click(byText('מחק הכל'));
    await expect(`${list}\n${out()}`).toMatchFileSnapshot(snap('memory-list'));
  });
});

describe('proposal card notes', () => {
  it.each(['stale', 'expired', 'busy', 'failed', 'offline'])('confirm → %s', async (outcome) => {
    hoisted.outcome = outcome;
    await mount(
      <AiCoachProposalCard messageId="m1" proposal={{ id: 'p1', status: 'pending', scope: 'this_week', title: 'הצעה', lines: ['שורה'] }} onStatus={() => {}} />,
    );
    await click(byText('אשר'));
    await expect(out()).toMatchFileSnapshot(snap(`proposal-confirm-${outcome}`));
  });
  it('dismiss → stale / unknown outcome (falls back to failed)', async () => {
    hoisted.outcome = 'stale';
    await mount(
      <AiCoachProposalCard messageId="m1" proposal={{ id: 'p1', status: 'pending', scope: 'this_week', title: 'הצעה', lines: ['שורה'] }} onStatus={() => {}} />,
    );
    await click(byText('בטל'));
    const stale = out();
    act(() => root?.unmount());
    host?.remove();
    hoisted.outcome = 'applied';
    await mount(
      <AiCoachProposalCard messageId="m1" proposal={{ id: 'p1', status: 'pending', scope: 'this_week', title: 'הצעה', lines: ['שורה'] }} onStatus={() => {}} />,
    );
    await click(byText('בטל'));
    await expect(`${stale}\n${out()}`).toMatchFileSnapshot(snap('proposal-dismiss'));
  });
});

describe('chat after effects / taps', () => {
  const profile = { id: 'u1', core: { name: 'דנה', gender: 'female' } } as unknown as UserFullProfile;
  it('offline banner', async () => {
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, value: false });
    await mount(<AiCoachChat profile={profile} onClose={() => {}} />);
    await expect(out()).toMatchFileSnapshot(snap('chat-offline'));
  });
  it('card no longer cached → note; memory sheet opened from the header', async () => {
    hoisted.chatState = {
      ...initialChatState,
      phase: 'idle',
      messages: [
        {
          id: 'm1',
          role: 'assistant',
          text: 'הנה',
          cards: [{ type: 'workout', workoutId: 'ai-gone-0001', title: 'אימון', minutes: 20, exerciseCount: 5, location: 'home' }],
        },
      ],
    };
    hoisted.memory = [];
    await mount(<AiCoachChat profile={profile} onClose={() => {}} memory />);
    await click((b) => b.getAttribute('data-ai-card') === 'ready');
    const missing = out();
    await click(byText('מה קלי זוכר'));
    await expect(`${missing}\n${out()}`).toMatchFileSnapshot(snap('chat-missing-card-memory'));
  });
});
