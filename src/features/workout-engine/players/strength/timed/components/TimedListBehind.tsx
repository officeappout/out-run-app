'use client';

/**
 * TimedListBehind — the session list layer while a timed block runs: feeds
 * TimedSessionList from the engine (pure models) at the current time.
 */
import React from 'react';
import type { WorkoutPlan } from '@/features/parks/core/types/route.types';
import { timedStrip } from '@/features/workout-engine/engines/timed/timed.strip';
import { toCartItems } from '@/features/workout-engine/engines/strip-item';
import type { TimedSegmentApi } from '../hooks/useTimedSegment';
import { timedListModel } from '../logic/timed-list';
import { blockTitle, headerClock } from '../logic/timed-labels';
import TimedSessionList from './TimedSessionList';

export interface TimedListBehindProps {
  timed: TimedSegmentApi;
  workout: WorkoutPlan;
  segmentIndex: number;
  onClose: () => void;
}

export default function TimedListBehind({ timed, workout, segmentIndex, onClose }: TimedListBehindProps) {
  const { spec, state, view } = timed;
  if (!spec || !state || !view) return null;
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
