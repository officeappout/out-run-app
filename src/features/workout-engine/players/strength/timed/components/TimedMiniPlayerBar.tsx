'use client';

/**
 * TimedMiniPlayerBar — the mini bar while a timed block runs ("סבב 3 ·
 * נותרו 05:48"). Subscribes to the store itself, so the ticking label never
 * re-renders the player root.
 */
import React from 'react';
import MiniPlayerBar, { type MiniPlayerBarProps } from '../../components/MiniPlayerBar';
import { useTimedSnapshot } from '../hooks/useTimedSnapshot';
import { miniPlayerInfo } from '../logic/timed-labels';
import type { TimedStore } from '../state/timed-store';

export type TimedMiniPlayerBarProps = Omit<MiniPlayerBarProps, 'exerciseName' | 'elapsedTimeLabel'> & {
  store: TimedStore;
  /** Shown until the first snapshot lands. */
  fallbackName: string;
  fallbackLabel: string;
};

export default function TimedMiniPlayerBar({ store, fallbackName, fallbackLabel, ...rest }: TimedMiniPlayerBarProps) {
  const snap = useTimedSnapshot(store);
  const info = snap ? miniPlayerInfo(snap.state, snap.view, snap.prefix) : null;
  return <MiniPlayerBar {...rest} exerciseName={info?.name ?? fallbackName} elapsedTimeLabel={info?.label ?? fallbackLabel} />;
}
