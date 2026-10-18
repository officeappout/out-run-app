'use client';

/**
 * useAiCoachChat — drives the "קלי AI" screen: loads the stored thread (owner-read via the
 * client SDK), sends messages, and closes the client_tool loop (run the tool on the
 * device → POST the compact result → keep streaming).
 */
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { collection, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import type { ChatRequest, CoachStreamEvent, WorkoutCard } from '@/lib/ai/coach/protocol';
import { CoachHttpError, CoachOfflineError, postCoach } from '../services/ai-coach-api';
import { runClientTool } from '../services/client-tools';
import { chatReducer, initialChatState, isBusy, type UiMessage } from '../state/chat-machine';

const HISTORY_LIMIT = 30;

export function useAiCoachChat(profile: UserFullProfile | null) {
  const [state, dispatch] = useReducer(chatReducer, initialChatState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const abortRef = useRef<AbortController | null>(null);

  // ── History ────────────────────────────────────────────────────────────────
  const uid = profile?.id ?? null;
  useEffect(() => {
    if (!uid) return;
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
                  }))
                : [],
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
  }, [uid]);

  useEffect(() => () => abortRef.current?.abort(), []);

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
      dispatch({ type: 'TOOL_POSTED' });
      await run({ toolResult: { id: call.id, outcome } });
    }
  }, []);

  const send = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || isBusy(stateRef.current)) return;
      dispatch({ type: 'SEND', id: `u-${Date.now()}`, text: t });
      void run({ message: t });
    },
    [run],
  );

  const retry = useCallback(() => {
    const last = stateRef.current.lastUserText;
    dispatch({ type: 'DISMISS_ERROR' });
    if (last) {
      dispatch({ type: 'SEND', id: `u-${Date.now()}`, text: last });
      void run({ message: last });
    }
  }, [run]);

  const dismissError = useCallback(() => dispatch({ type: 'DISMISS_ERROR' }), []);

  return { state, send, retry, dismissError };
}
