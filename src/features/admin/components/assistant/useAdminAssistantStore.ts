/**
 * useAdminAssistantStore — the "שאל את OUT" drawer state (Zustand; no new React Context, axiom
 * §7). Lives above the page so the conversation survives navigation between admin pages.
 */
import { create } from 'zustand';
import type { EvidenceItem, QuickCard } from '@/lib/ai/admin-assistant/sse';

export interface AssistantLink {
  href: string;
  title: string;
  pageId: string;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  links: AssistantLink[];
  card?: QuickCard;
  evidence?: EvidenceItem[];
  /** tool names running right now (assistant message while streaming) */
  running?: string[];
  pending?: boolean;
  unverified?: boolean;
  costUsd?: number;
  auditId?: string | null;
  rating?: 'up' | 'down';
  error?: string;
}

interface AssistantState {
  open: boolean;
  messages: AssistantMessage[];
  busy: boolean;
  loadedHistory: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  push: (m: AssistantMessage) => void;
  patch: (id: string, patch: Partial<AssistantMessage> | ((m: AssistantMessage) => Partial<AssistantMessage>)) => void;
  setBusy: (busy: boolean) => void;
  setHistory: (messages: AssistantMessage[]) => void;
}

export const useAdminAssistantStore = create<AssistantState>((set) => ({
  open: false,
  messages: [],
  busy: false,
  loadedHistory: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  push: (m) => set((s) => ({ messages: [...s.messages, m].slice(-60) })),
  patch: (id, patch) =>
    set((s) => ({
      messages: s.messages.map((m) => (m.id === id ? { ...m, ...(typeof patch === 'function' ? patch(m) : patch) } : m)),
    })),
  setBusy: (busy) => set({ busy }),
  setHistory: (messages) => set((s) => ({ loadedHistory: true, messages: s.messages.length ? s.messages : messages })),
}));
