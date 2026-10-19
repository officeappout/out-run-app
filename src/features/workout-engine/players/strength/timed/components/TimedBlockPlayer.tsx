'use client';

/**
 * TimedBlockPlayer — the top layer of the strength player while an AMRAP /
 * EMOM / Tabata segment runs on the timed engine (enable_home_v2 only).
 * Composition only: backdrop media, header, the bottom card of the current
 * phase, the AMRAP round toast and the format "i" sheet. All timing and
 * state come from the TimedStore snapshot (this subtree is the only one that
 * re-renders per tick).
 */
import React, { useMemo, useState } from 'react';
import type { Exercise, WorkoutPlan } from '@/features/parks/core/types/route.types';
import { timedStrip } from '@/features/workout-engine/engines/timed/timed.strip';
import { toCartItems } from '@/features/workout-engine/engines/strip-item';
import type { AmrapState, EmomState, TimedItem } from '@/features/workout-engine/engines/timed/timed.types';
import type { TimedStore } from '../state/timed-store';
import { useTimedSnapshot } from '../hooks/useTimedSnapshot';
import {
  blockTitle,
  clockCaption,
  emomMinuteMs,
  emomRestLine,
  formatClock,
  headerClock,
  nextCaption,
  phaseClock,
  timedEyebrow,
  workHint,
} from '../logic/timed-labels';
import { blockProgress, segmentBars } from '../logic/timed-header';
import { timedCardMode } from '../logic/timed-card';
import TimedHeader from './TimedHeader';
import TimedMedia from './TimedMedia';
import TimedReadyCard from './TimedReadyCard';
import TimedWorkCard from './TimedWorkCard';
import TimedClockCard from './TimedClockCard';
import TimedRepsPanel from './TimedRepsPanel';
import TimedDoneCard from './TimedDoneCard';
import TimedRoundToast from './TimedRoundToast';
import TimedFormatInfoSheet from './TimedFormatInfoSheet';

export interface TimedBlockPlayerProps {
  store: TimedStore;
  workout: WorkoutPlan;
  segmentIndex: number;
  isPaused: boolean;
  hideList?: boolean;
  onTogglePause: () => void;
  onList: () => void;
  onHeaderPointerDown?: (e: React.PointerEvent) => void;
}

export default function TimedBlockPlayer({ store, workout, segmentIndex, isPaused, hideList, onTogglePause, onList, onHeaderPointerDown }: TimedBlockPlayerProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const snap = useTimedSnapshot(store);
  const actions = store.actions;
  const segment = workout.segments[segmentIndex];
  const planOf = useMemo(() => {
    const list = segment?.exercises ?? [];
    return (it: TimedItem | null | undefined): Exercise | null =>
      it?.kind === 'exercise' ? list.find((e) => e.id === it.exerciseId) ?? null : null;
  }, [segment]);

  if (!snap) return null;
  const { spec, state, view, prompt, prefix } = snap;

  const mode = timedCardMode(state, view, prompt);
  const strip = timedStrip(state, Date.now());
  const cartItems = toCartItems(strip);
  const warn = view.isLastSeconds;
  const title = blockTitle(spec);
  const mediaItem = mode === 'rest' ? view.next : mode === 'ready' ? spec.items[0] ?? null : view.current;
  const eyebrow = timedEyebrow(state, view, prefix);

  let card: React.ReactNode;
  switch (mode) {
    case 'ready':
      card = <TimedReadyCard spec={spec} segmentTitle={segment?.title ?? ''} prefix={prefix} onInfo={() => setInfoOpen(true)} onStart={actions.start} />;
      break;
    case 'prompt':
      card = <TimedRepsPanel prompt={prompt!} onSave={actions.answerPrompt} onSkip={actions.skipPrompt} />;
      break;
    case 'done':
      card = <TimedDoneCard title={title} result={snap.result} />;
      break;
    case 'clock':
      card = (
        <TimedClockCard
          mode="work"
          eyebrow={eyebrow}
          warn={warn}
          clock={phaseClock(view)}
          ofClock={spec.format === 'tabata' ? formatClock(spec.config.workSec) : null}
          item={view.current}
          next={view.next}
          nextCaption={nextCaption(view)}
        />
      );
      break;
    case 'rest':
      card = (
        <TimedClockCard
          mode="rest"
          eyebrow={eyebrow}
          warn={warn}
          clock={phaseClock(view)}
          item={view.next}
          nextCaption={nextCaption(view)}
          line={spec.format === 'emom' ? emomRestLine(state as EmomState, view) : null}
        />
      );
      break;
    default:
      card = view.current ? (
        <TimedWorkCard
          eyebrow={eyebrow}
          warn={warn}
          item={view.current}
          next={view.next}
          nextCaption={nextCaption(view)}
          hint={workHint(view, view.current)}
          minute={spec.format === 'emom' ? { clock: phaseClock(view), fraction: view.phaseElapsedMs / emomMinuteMs(state as EmomState) } : null}
          runDistanceM={snap.runDistanceM}
          onDone={actions.itemDone}
        />
      ) : null;
  }

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <TimedMedia item={mediaItem} planExercise={planOf(mediaItem)} next={planOf(view.next)} isPaused={isPaused || mode === 'ready'} />
      <TimedHeader
        bars={segmentBars(workout, segmentIndex)}
        progress={blockProgress(view.activeMs, view.totalMs)}
        cartItems={cartItems}
        caption={clockCaption(view, prefix)}
        clock={headerClock(view)}
        warn={warn}
        isPaused={isPaused}
        hideList={hideList}
        onList={onList}
        onInfo={() => setInfoOpen(true)}
        onTogglePause={onTogglePause}
        onPointerDown={onHeaderPointerDown}
      />
      {spec.format === 'amrap' && <TimedRoundToast state={state as AmrapState} />}
      {card}
      <TimedFormatInfoSheet spec={spec} open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}
