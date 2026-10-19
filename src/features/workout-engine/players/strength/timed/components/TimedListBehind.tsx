'use client';

/**
 * TimedListBehind — the session list layer while a timed block runs: feeds
 * TimedSessionList from the engine (pure models) at the current time.
 */
import React from 'react';
import type { WorkoutPlan } from '@/features/parks/core/types/route.types';
import { timedStrip } from '@/features/workout-engine/engines/timed/timed.strip';
import { toCartItems } from '@/features/workout-engine/engines/strip-item';
import type { TimedStore } from '../state/timed-store';
import { useTimedSnapshot } from '../hooks/useTimedSnapshot';
import { timedListModel } from '../logic/timed-list';
import { blockTitle, headerClock } from '../logic/timed-labels';
import TimedSessionList from './TimedSessionList';

export interface TimedListBehindProps {
  store: TimedStore;
  workout: WorkoutPlan;
  segmentIndex: number;
  onClose: () => void;
}

export default function TimedListBehind({ store, workout, segmentIndex, onClose }: TimedListBehindProps) {
  const snap = useTimedSnapshot(store);
  if (!snap) return null;
  const { spec, state, view } = snap;
  const now = Date.now();
  return (
    <TimedSessionList
      workout={workout}
      segmentIndex={segmentIndex}
      blockTitle={blockTitle(spec)}
      model={timedListModel(state, now)}
      cartItems={toCartItems(timedStrip(state, now))}
      remaining={headerClock(view)}
      onClose={onClose}
    />
  );
}
