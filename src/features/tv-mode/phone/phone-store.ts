'use client';

import { create } from 'zustand';
import type { TvJoinRole, TvMirror, TvParticipantState, TvWorkoutInfo } from '../core/types';

/** What the remote buttons do — provided by the player that runs the workout (the phone is the source of truth). */
export interface TvRemoteControls {
  togglePause: () => void;
  next: () => void;
  prev: () => void;
  skipExercise: () => void;
}

export interface TvParticipantProgress {
  state: TvParticipantState;
  set?: number;
  totalSets?: number;
}

export interface TvPending {
  info: TvWorkoutInfo;
  /** "התחלת אימון" on the host panel → the overview's own start handler. */
  onStart: () => void;
  /** Persists the workout as a shared workout and returns its id (participants open it). */
  prepareShare?: () => Promise<string | undefined>;
}

export type TvPhoneView = 'none' | 'pair' | 'host' | 'joined';

interface TvPhoneState {
  view: TvPhoneView;
  code: string | null;
  role: TvJoinRole | null;
  /** The workout that is about to be shown (set by the overview entry). */
  pending: TvPending | null;
  /** Host: the player's mirror + controls (set by useTvRunnerBridge). */
  mirror: TvMirror | null;
  controls: TvRemoteControls | null;
  /** Participant: own progress (set by the player running the shared workout). */
  progress: TvParticipantProgress | null;
  /** Host chose "continue on phone only" after losing the screen. */
  phoneOnly: boolean;

  openPair: (pending: TvPending | null, initialCode?: string) => void;
  setConnected: (code: string, role: TvJoinRole) => void;
  setMirror: (mirror: TvMirror | null, controls: TvRemoteControls | null) => void;
  setProgress: (p: TvParticipantProgress | null) => void;
  setPhoneOnly: (v: boolean) => void;
  closePair: () => void;
  /** Hide the full-screen panel but stay connected (the workout runs on). */
  hide: () => void;
  reset: () => void;
}

const BLANK = { view: 'none' as TvPhoneView, code: null, role: null, pending: null, mirror: null, controls: null, progress: null, phoneOnly: false };

export const useTvPhoneStore = create<TvPhoneState>((set) => ({
  ...BLANK,
  openPair: (pending, initialCode) => set({ view: 'pair', pending, code: initialCode ?? null }),
  setConnected: (code, role) => set({ code, role, view: role === 'host' ? 'host' : 'joined', phoneOnly: false }),
  setMirror: (mirror, controls) => set({ mirror, controls }),
  setProgress: (progress) => set({ progress }),
  setPhoneOnly: (phoneOnly) => set({ phoneOnly }),
  closePair: () => set((s) => (s.role ? { view: s.role === 'host' ? 'host' : 'joined' } : { ...BLANK })),
  hide: () => set({ view: 'none' }),
  reset: () => set({ ...BLANK }),
}));

const KEY = 'tv:phone';

/** Survive a reload of the app while a session is open (re-joined on mount; host re-join is idempotent). */
export function saveConnection(code: string, role: TvJoinRole, nickname?: string): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ code, role, ...(nickname ? { nickname } : {}) }));
  } catch {
    /* storage unavailable: no resume */
  }
}
export function clearConnection(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
/** `nickname` is only there for a guest (they re-join with the same one after a reload). */
export function readConnection(): { code: string; role: TvJoinRole; nickname?: string } | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { code?: string; role?: string; nickname?: unknown };
    return typeof v.code === 'string' && (v.role === 'host' || v.role === 'participant')
      ? { code: v.code, role: v.role, ...(typeof v.nickname === 'string' && v.nickname ? { nickname: v.nickname } : {}) }
      : null;
  } catch {
    return null;
  }
}
