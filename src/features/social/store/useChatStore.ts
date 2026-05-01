'use client';

/**
 * Chat Store — globally controls the ChatInbox sheet from anywhere in the app.
 *
 * In-memory only (no persistence) — opening a DM is an explicit user action
 * and shouldn't survive a refresh.
 *
 * The active thread uses the canonical `ChatThread` type from
 * `chat.types.ts`. This is the same shape `ChatInbox.setOpenThread` accepts,
 * so the global mount can hand it straight through without an adapter.
 *
 * Two ways to surface the inbox:
 *   - `openDM(myUid, myName, otherUid, otherName)` — resolves the DM thread
 *     via `getOrCreateChat`, sets it as `activeThread`, opens the sheet.
 *   - `open()` — opens the sheet on the inbox list (no specific thread),
 *     used by `/feed` callers that just want to reveal messages.
 */

import { create } from 'zustand';
import { getOrCreateChat, getGroupChatThread } from '../services/chat.service';
import type { ChatThread } from '../types/chat.types';

interface ChatStoreState {
  activeThread: ChatThread | null;
  isOpen: boolean;
  isOpening: boolean;
  open: () => void;
  openDM: (
    myUid: string,
    myName: string,
    otherUid: string,
    otherName: string,
  ) => Promise<void>;
  openGroup: (groupId: string, groupName: string) => Promise<void>;
  close: () => void;
}

export const useChatStore = create<ChatStoreState>((set) => ({
  activeThread: null,
  isOpen: false,
  isOpening: false,

  open: () => set({ isOpen: true, activeThread: null }),

  openDM: async (myUid, myName, otherUid, otherName) => {
    set({ isOpening: true });
    try {
      const thread = await getOrCreateChat(myUid, myName, otherUid, otherName);
      set({ activeThread: thread, isOpen: true, isOpening: false });
    } catch (err) {
      console.error('[useChatStore] openDM failed:', err);
      set({ isOpening: false });
    }
  },

  openGroup: async (groupId, groupName) => {
    set({ isOpening: true });
    try {
      const thread = await getGroupChatThread(groupId, groupName);
      set({ activeThread: thread, isOpen: true, isOpening: false });
    } catch (err) {
      console.error('[useChatStore] openGroup failed:', err);
      set({ isOpening: false });
    }
  },

  close: () => set({ isOpen: false, activeThread: null }),
}));
