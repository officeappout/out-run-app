'use client';

/**
 * useAiCoachChat — drives the "קלי AI" screen: loads the stored thread (owner-read via the
 * client SDK), sends messages, and closes the client_tool loop (run the tool on the
 * device → POST the compact result → keep streaming).
 *
 * Unified Kelly (opts.unified, flag kelly_unified_v1): the thread is a LIVE listener
 * (onSnapshot) so team replies appear while the screen is open; opening it marks the
 * conversation read (server route); in team-only mode — or when the AI gate refuses this user
 * (minor, no entitlement) — the message goes to the team through /api/ai-coach/thread instead
 * of the AI. A paused AI (rate limit, kill switch, budget, outage) is answered by the chat
 * route itself (stored + Kelly's paused reply, see ai-pause.ts). Without opts.unified: exactly the old hook.
 */
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { collection, getDocs, limit, onSnapshot, orderBy, query, type DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { ChatRequest, CoachStreamEvent, WorkoutCard } from '@/lib/ai/coach/protocol';
import { CoachHttpError, CoachOfflineError, postCoach, postThreadAction } from '../services/ai-coach-api';
import { runClientTool } from '../services/client-tools';
import { chatReducer, initialChatState, isBusy, type UiMessage } from '../state/chat-machine';
import { isCoachActionId } from '@/lib/ai/coach/action-chips';
import { messageSourceOf, TEAM_FALLBACK_CODES } from '@/lib/ai/coach/unified-thread';
import { refusedSendAction } from '@/lib/ai/coach/ai-pause';
import { useKellyThreadMeta } from './useKellyThread';

const HISTORY_LIMIT = 30;
const UNIFIED_LIMIT = 50;

function storedCards(x: DocumentData): WorkoutCard[] {
  return Array.isArray(x.cards)
    ? (x.cards as WorkoutCard[]).map((c) => ({
        type: 'workout' as const,
        workoutId: c.workoutId,
        title: c.title,
        minutes: c.minutes,
        exerciseCount: c.exerciseCount,
        location: c.location,
        ...(Array.isArray(c.domains) ? { domains: c.domains.filter((d) => typeof d === 'string').slice(0, 8) } : {}),
        ...(typeof c.difficulty === 'number' ? { difficulty: c.difficulty } : {}),
      }))
    : [];
}

/** Unified Kelly: a stored message of any source → a screen message. */
export function unifiedUiMessage(id: string, x: DocumentData): UiMessage {
  const source = messageSourceOf(x);
  return {
    id,
    role: source === 'user' ? 'user' : 'assistant',
    text: typeof x.text === 'string' ? x.text : '',
    cards: storedCards(x),
    actions: Array.isArray(x.actions) ? (x.actions as unknown[]).filter(isCoachActionId) : [],
    source,
    ...(typeof x.senderName === 'string' ? { senderName: x.senderName } : {}),
  };
}

export interface AiCoachChatOptions {
  /** kelly_unified_v1 ON. */
  unified?: boolean;
  /** Start in team-only mode (no AI for this user). Only with `unified`. */
  teamOnly?: boolean;
}

export function useAiCoachChat(profile: UserFullProfile | null, opts: AiCoachChatOptions = {}) {
  const unified = opts.unified === true;
  const [teamMode, setTeamMode] = useState<boolean>(unified && opts.teamOnly === true);
  const teamModeRef = useRef(teamMode);
  teamModeRef.current = teamMode;
  const unifiedRef = useRef(unified);
  unifiedRef.current = unified;
  useEffect(() => {
    if (unified && opts.teamOnly) setTeamMode(true);
  }, [unified, opts.teamOnly]);
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const abortRef = useRef<AbortController | null>(null);

  // ── History ────────────────────────────────────────────────────────────────
  const uid = profile?.id ?? null;

  // Unified: live listener on the newest messages (every source).
  useEffect(() => {
    if (!uid || !unified) return;
    return onSnapshot(
      query(collection(db, 'ai_coach_threads', uid, 'messages'), orderBy('createdAt', 'desc'), limit(UNIFIED_LIMIT)),
      (snap) => dispatch({ type: 'SNAPSHOT', messages: snap.docs.map((d) => unifiedUiMessage(d.id, d.data())).reverse() }),
      (err) => {
        console.warn('[ai-coach] live thread unavailable', err);
        dispatch({ type: 'SNAPSHOT', messages: [] });
      },
    );
  }, [uid, unified]);

  // Unified: the screen is open and visible → nothing unread (server route; clients can't write).
  const meta = useKellyThreadMeta(uid, unified);
  const readInFlight = useRef(false);
  useEffect(() => {
    if (!unified || meta.unreadForUser <= 0) return;
    const markRead = () => {
      if (readInFlight.current || document.visibilityState !== 'visible') return;
      readInFlight.current = true;
      postThreadAction({ action: 'read' })
        .catch((err) => console.warn('[ai-coach] mark read failed', err))
        .finally(() => {
          readInFlight.current = false;
        });
    };
    markRead();
    document.addEventListener('visibilitychange', markRead);
    return () => document.removeEventListener('visibilitychange', markRead);
  }, [unified, meta.unreadForUser]);

  useEffect(() => {
    if (!uid || unified) return;
    let cancelled = false;
    (async () => {
      let messages: UiMessage[] = [];
      try {
        const snap = await getDocs(
          query(collection(db, 'ai_coach_threads', uid, 'messages'), orderBy('createdAt', 'desc'), limit(HISTORY_LIMIT)),
        );
        messages = snap.docs
          .map((d) => {
            const x = d.data();
            return {
              id: d.id,
              role: x.role === 'assistant' ? 'assistant' : 'user',
              text: typeof x.text === 'string' ? x.text : '',
              cards: Array.isArray(x.cards)
                ? (x.cards as WorkoutCard[]).map((c) => ({
                    type: 'workout' as const,
                    workoutId: c.workoutId,
                    title: c.title,
                    minutes: c.minutes,
                    exerciseCount: c.exerciseCount,
                    location: c.location,
                    ...(Array.isArray(c.domains) ? { domains: c.domains.filter((d) => typeof d === 'string').slice(0, 8) } : {}),
                    ...(typeof c.difficulty === 'number' ? { difficulty: c.difficulty } : {}),
                  }))
                : [],
              actions: Array.isArray(x.actions) ? (x.actions as unknown[]).filter(isCoachActionId) : [],
            } as UiMessage;
          })
          .reverse();
      } catch (err) {
        // No thread yet / rules not deployed yet: start fresh, the server still has it.
        console.warn('[ai-coach] history unavailable', err);
      }
      if (!cancelled) dispatch({ type: 'HISTORY_LOADED', messages });
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, unified]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // ── Team-only send (unified): stored for the team, no AI call ───────────────
  const sendToTeam = useCallback(async (text: string): Promise<void> => {
    try {
      await postThreadAction({ action: 'message', message: text });
      dispatch({ type: 'TEAM_SENT' });
    } catch (err) {
      if (err instanceof CoachHttpError) {
        dispatch({ type: 'FAILED', error: { status: err.status, code: err.code, retryAfterSec: err.retryAfterSec } });
      } else if (err instanceof CoachOfflineError) {
        dispatch({ type: 'FAILED', error: { offline: true } });
      } else {
        dispatch({ type: 'FAILED', error: {} });
      }
    }
  }, []);

  // ── One request (+ the client tool continuation it may trigger) ─────────────
  const run = useCallback(async (body: ChatRequest): Promise<void> => {
    const ac = new AbortController();
    abortRef.current = ac;
    let clientCall: Extract<CoachStreamEvent, { type: 'client_tool' }> | null = null;
    let terminal = false;
    try {
      await postCoach(
        body,
        (ev) => {
          if (ev.type === 'client_tool') clientCall = ev;
          if (ev.type === 'client_tool' || ev.type === 'done' || ev.type === 'error') terminal = true;
          dispatch({ type: 'EVENT', event: ev });
        },
        ac.signal,
      );
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return;
      // Unified: the AI gate refused this message. A pause (rate limit, kill switch, budget,
      // outage) was already stored by the route with Kelly's paused reply, which the live
      // thread shows; no AI for this user at all → the message goes to the team and the screen
      // stays in team-only mode.
      if (err instanceof CoachHttpError) {
        const action = refusedSendAction(err, {
          unified: unifiedRef.current,
          isMessage: 'message' in body,
          teamFallbackCodes: TEAM_FALLBACK_CODES,
        });
        if (action === 'stored') {
          dispatch({ type: 'TEAM_SENT' });
          return;
        }
        if (action === 'team' && 'message' in body) {
          setTeamMode(true);
          teamModeRef.current = true;
          await sendToTeam(body.message);
          return;
        }
      }
      if (err instanceof CoachHttpError) {
        dispatch({ type: 'FAILED', error: { status: err.status, code: err.code, retryAfterSec: err.retryAfterSec } });
      } else if (err instanceof CoachOfflineError) {
        dispatch({ type: 'FAILED', error: { offline: true } });
      } else {
        dispatch({ type: 'FAILED', error: {} });
      }
      return;
    }

    // The connection closed mid-turn (no done / error / client_tool): don't hang on "typing".
    if (!terminal) {
      dispatch({ type: 'FAILED', error: {} });
      return;
    }

    const call = clientCall as Extract<CoachStreamEvent, { type: 'client_tool' }> | null;
    if (call) {
      const p = profileRef.current;
      const { outcome } = p
        ? await runClientTool(call.name, call.input, p)
        : { outcome: { ok: false as const, error: 'generation_failed' as const } };
      dispatch({ type: 'TOOL_POSTED', ok: outcome.ok });
      await run({ toolResult: { id: call.id, outcome } });
    }
  }, [sendToTeam]);

  const send = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || isBusy(stateRef.current)) return;
      dispatch({ type: 'SEND', id: `u-${Date.now()}`, text: t });
      if (unifiedRef.current && teamModeRef.current) void sendToTeam(t);
      else void run({ message: t });
    },
    [run, sendToTeam],
  );

  const retry = useCallback(() => {
    const last = stateRef.current.lastUserText;
    dispatch({ type: 'DISMISS_ERROR' });
    if (last) {
      dispatch({ type: 'SEND', id: `u-${Date.now()}`, text: last });
      if (unifiedRef.current && teamModeRef.current) void sendToTeam(last);
      else void run({ message: last });
    }
  }, [run, sendToTeam]);

  const dismissError = useCallback(() => dispatch({ type: 'DISMISS_ERROR' }), []);

  return { state, send, retry, dismissError, teamMode: unified && teamMode };
}
