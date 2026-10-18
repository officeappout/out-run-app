'use client';

/**
 * "קלי AI" — the AI coach chat screen (full screen, light, RTL). Separate from the human
 * Kelly support DM in the inbox and labeled as AI everywhere.
 *
 * Unified Kelly (`unified`, flag kelly_unified_v1): ONE Kelly conversation. Header "קלי",
 * team replies in their own subtle bubble (label "קלי · צוות OUT"), system messages as Kelly.
 * `teamOnly` (no AI for this user): no AI intro / quick replies, a note that the team answers
 * here, and messages go to the team. Without `unified`: the old "קלי AI" screen, unchanged.
 *
 * Workout cards open the SAME WorkoutPreviewDrawer the workout builder opens, with the
 * same props shape (shell + generatedWorkout + workoutLocation); its own Start button
 * then runs the normal session path (useWorkoutSession → active_workout_data → player).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Send, Sparkles, Users, WifiOff } from 'lucide-react';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import WorkoutPreviewDrawer from '@/features/workouts/components/WorkoutPreviewDrawer';
import WorkoutBuilderSheet from '@/features/home/components/WorkoutBuilderSheet';
import { describeCoachError, CHAT_MESSAGE_MAX_CHARS, type WorkoutCard } from '@/lib/ai/coach/protocol';
import { coachGenderOf, firstNameOf, greeting, quickReplies } from '@/lib/ai/coach/persona';
import { useAiCoachChat } from '../hooks/useAiCoachChat';
import { getAiWorkout } from '../services/workout-cache';
import { isBusy, LIVE_ID } from '../state/chat-machine';
import AiCoachWorkoutCard, { AiCoachWorkoutCardError, AiCoachWorkoutCardSkeleton } from './AiCoachWorkoutCard';
import AiCoachActionChips from './AiCoachActionChips';
import { startMiniDomainAssessment } from '@/features/user/onboarding/services/mini-domain-assessment';
import { KELLY_TEAM_SENDER_NAME } from '@/lib/ai/coach/unified-thread';

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}

const DIFF: Record<number, 'easy' | 'medium' | 'hard'> = { 1: 'easy', 2: 'medium', 3: 'hard' };

export default function AiCoachChat({
  profile,
  onClose,
  unified = false,
  teamOnly = false,
}: {
  profile: UserFullProfile;
  onClose: () => void;
  /** kelly_unified_v1 ON. */
  unified?: boolean;
  /** Unified only: this user has no AI → the team answers here. */
  teamOnly?: boolean;
}) {
  const { state, send, retry, dismissError, teamMode } = useAiCoachChat(profile, { unified, teamOnly });
  const router = useRouter();
  const gender = coachGenderOf(profile.core?.gender);
  const online = useOnline();
  const [input, setInput] = useState('');
  const [builderOpen, setBuilderOpen] = useState(false);
  const [openCard, setOpenCard] = useState<WorkoutCard | null>(null);
  const [missingCard, setMissingCard] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state.messages, state.phase]);

  const busy = isBusy(state);
  const uiError = state.error ? describeCoachError(state.error, gender) : null;
  const showIntro = state.phase !== 'loading' && state.messages.length === 0 && !teamMode;
  // "Build today's workout" belongs to today's newest reply only; older chips open the schedule.
  const lastAssistantId = [...state.messages].reverse().find((m) => m.role === 'assistant')?.id ?? null;

  const cached = useMemo(() => (openCard ? getAiWorkout(openCard.workoutId) : null), [openCard]);
  const shell = useMemo(() => {
    if (!openCard || !cached) return null;
    return {
      id: openCard.workoutId,
      title: cached.workout.title || openCard.title,
      description: cached.workout.description || '',
      difficulty: DIFF[cached.workout.difficulty] ?? 'medium',
      duration: cached.workout.estimatedDuration,
      coverImage: '',
      segments: [] as [],
    };
  }, [openCard, cached]);

  const handleOpenCard = (card: WorkoutCard) => {
    if (getAiWorkout(card.workoutId)) {
      setMissingCard(false);
      setOpenCard(card);
    } else {
      setMissingCard(true);
    }
  };

  const submit = () => {
    if (!input.trim() || busy) return;
    send(input);
    setInput('');
  };

  // The workout skeleton card stands in for a status line while a workout is being built.
  const building = state.workoutBuild === 'building';
  const statusLabel =
    building
      ? null
      : state.toolStatus
        ? 'בודק...'
        : state.phase === 'sending' && !teamMode
          ? 'קלי כותב...'
          : null;

  return (
    // Always LIGHT (owner): pinned text color + color-scheme so an OS dark mode (globals.css
    // flips --foreground to near-white) never leaks into the screen, its inputs or scrollbars.
    <div className="fixed inset-0 z-[56] flex flex-col bg-[#F8FAFC] text-gray-900" style={{ colorScheme: 'light' }} dir="rtl">
      {/* Header */}
      <div
        className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 pb-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="grid h-10 w-10 place-items-center rounded-full bg-gray-100 active:bg-gray-200"
          aria-label="חזור"
        >
          <ArrowRight className="h-5 w-5 text-gray-700" />
        </button>
        <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-sky-600 text-white shadow-sm">
          <Sparkles className="h-5 w-5" aria-hidden />
        </div>
        {unified ? (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-black text-gray-900">קלי</h1>
              {!teamMode && <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-black text-cyan-700">AI + צוות</span>}
            </div>
            <p className="truncate text-[11.5px] font-semibold text-gray-400">
              {teamMode ? 'הצוות של OUT עונה כאן' : 'רוב התשובות נכתבות על ידי AI. הודעות מהצוות מסומנות'}
            </p>
          </div>
        ) : (
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="text-base font-black text-gray-900">קלי AI</h1>
              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-black text-cyan-700">AI</span>
            </div>
            <p className="truncate text-[11.5px] font-semibold text-gray-400">מאמן דיגיטלי. התשובות נכתבות על ידי בינה מלאכותית</p>
          </div>
        )}
      </div>

      {!online && (
        <div className="flex items-center gap-2 bg-amber-50 px-4 py-2 text-[12.5px] font-bold text-amber-800">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
          <span className="flex-1">אין חיבור. בונה האימונים עובד גם בלי אינטרנט.</span>
          <button type="button" onClick={() => setBuilderOpen(true)} className="rounded-full bg-white px-3 py-1 text-amber-800 shadow-sm">
            לבונה האימונים
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {state.phase === 'loading' && <p className="py-10 text-center text-sm text-gray-400 animate-pulse">טוען את השיחה...</p>}

        {teamMode && state.phase !== 'loading' && (
          <div className="mx-auto flex max-w-[90%] items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1.5 text-[12px] font-bold text-emerald-800">
            <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>הצוות יענה כאן. אפשר לכתוב כל שאלה על האימונים או על האפליקציה.</span>
          </div>
        )}

        {showIntro && (
          <div className="flex flex-col items-end">
            <div className="max-w-[80%] rounded-2xl rounded-tl-sm border border-gray-100 bg-white px-3.5 py-2.5 text-sm leading-snug text-gray-900 shadow-sm">
              {greeting(gender, firstNameOf(profile.core?.name))}
            </div>
          </div>
        )}

        {state.messages.map((m) => {
          const mine = m.role === 'user';
          const team = unified && m.source === 'human';
          if (!mine && !m.text && m.cards.length === 0 && m.id === LIVE_ID) return null;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-start' : 'items-end'}`}>
              {team && (
                <span className="mb-0.5 flex items-center gap-1 px-1 text-[10.5px] font-black text-emerald-700">
                  <Users className="h-3 w-3" aria-hidden />
                  {m.senderName || KELLY_TEAM_SENDER_NAME}
                </span>
              )}
              {m.text && (
                <div
                  className={`max-w-[80%] whitespace-pre-line rounded-2xl px-3.5 py-2.5 text-sm leading-snug shadow-sm ${
                    mine
                      ? 'rounded-tr-sm bg-cyan-500 text-white'
                      : team
                        ? 'rounded-tl-sm border border-emerald-100 bg-emerald-50/60 text-gray-900'
                        : 'rounded-tl-sm border border-gray-100 bg-white text-gray-900'
                  }`}
                >
                  {m.text}
                </div>
              )}
              {/* Workout cards sit under the bubble, full card width (the home card, half height). */}
              {m.cards.map((c) => (
                <div key={c.workoutId} className="mt-2">
                  <AiCoachWorkoutCard card={c} onOpen={handleOpenCard} />
                </div>
              ))}
              {!mine && m.actions && m.actions.length > 0 && (
                <AiCoachActionChips
                  actions={m.id === lastAssistantId ? m.actions : m.actions.filter((a) => a !== 'build_today')}
                  onNavigate={(href) => router.push(href)}
                  onSend={(msg) => send(msg)}
                  onAssess={(t) => startMiniDomainAssessment(router, t.slug, t.returnTo, t.domainType)}
                  disabled={busy}
                />
              )}
            </div>
          );
        })}

        {building && (
          <div className="flex justify-end">
            <AiCoachWorkoutCardSkeleton />
          </div>
        )}

        {state.workoutBuild === 'failed' && !busy && (
          <div className="flex justify-end">
            <AiCoachWorkoutCardError onRetry={retry} onBuilder={() => setBuilderOpen(true)} />
          </div>
        )}

        {statusLabel && (
          <div className="flex items-end justify-end">
            <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-gray-100 bg-white px-3.5 py-2.5 text-[12.5px] font-semibold text-gray-500 shadow-sm">
              <span className="flex gap-1" aria-hidden>
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400 [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400 [animation-delay:-0.1s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-400" />
              </span>
              {statusLabel}
            </div>
          </div>
        )}

        {missingCard && (
          <p className="rounded-xl bg-gray-100 px-3 py-2 text-center text-[12.5px] font-semibold text-gray-500">
            האימון הזה כבר לא שמור במכשיר. אפשר לבקש מקלי לבנות אותו שוב.
          </p>
        )}

        {uiError && (
          <div className="rounded-2xl border border-gray-100 bg-white p-4 text-center shadow-sm">
            <p className="text-sm font-black text-gray-900">{uiError.title}</p>
            <p className="mt-1 text-[13px] text-gray-500">{uiError.body}</p>
            <div className="mt-3 flex justify-center gap-2">
              {uiError.retryable && (
                <button type="button" onClick={retry} className="rounded-full bg-cyan-500 px-4 py-2 text-[13px] font-black text-white">
                  לנסות שוב
                </button>
              )}
              {uiError.offerBuilder && (
                <button type="button" onClick={() => setBuilderOpen(true)} className="rounded-full bg-gray-100 px-4 py-2 text-[13px] font-black text-gray-700">
                  לבונה האימונים
                </button>
              )}
              {!uiError.retryable && !uiError.offerBuilder && (
                <button type="button" onClick={dismissError} className="rounded-full bg-gray-100 px-4 py-2 text-[13px] font-black text-gray-700">
                  סגירה
                </button>
              )}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick replies (first open) */}
      {showIntro && !busy && (
        <div className="flex gap-2 overflow-x-auto px-4 pb-2">
          {quickReplies(gender).map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => send(q)}
              className="shrink-0 rounded-full border border-cyan-200 bg-white px-3.5 py-2 text-[13px] font-bold text-cyan-700 shadow-sm active:scale-[0.97]"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-gray-100 bg-white px-4 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+12px)]">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value.slice(0, CHAT_MESSAGE_MAX_CHARS))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
                    placeholder={teamMode ? 'כתבו לצוות...' : 'כתבו לקלי...'}
          className="flex-1 rounded-full bg-gray-100 px-4 py-2.5 text-right text-sm text-gray-900 outline-none placeholder:text-gray-400"
          style={{ color: '#111827', WebkitTextFillColor: '#111827' }}
          enterKeyHint="send"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!input.trim() || busy}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-cyan-500 transition-opacity disabled:opacity-40"
          aria-label="שליחה"
        >
          <Send className="h-4 w-4 text-white" />
        </button>
      </div>

      {shell && cached && (
        <WorkoutPreviewDrawer
          isOpen={!!openCard}
          onClose={() => setOpenCard(null)}
          workout={shell}
          generatedWorkout={cached.workout}
          workoutLocation={cached.location}
          surface="ai-coach"
        />
      )}

      {builderOpen && <WorkoutBuilderSheet onClose={() => setBuilderOpen(false)} />}
    </div>
  );
}
