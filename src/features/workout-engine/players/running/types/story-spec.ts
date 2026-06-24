import type React from 'react';
import type { Participant } from '../../shared/types/session-policy';
import type { SessionGoal } from '../store/useRunningPlayer';

export type StoryKind = 'metric-goal' | 'versus' | 'group-aggregate';

export interface StandingsResult {
  /** My 1-based place among all participants (including self). */
  place: number;
  /** Gap in metres vs selected rival. Positive = I lead, negative = I trail. */
  gapM: number;
  rival: Participant | null;
}

export interface TrackData {
  meKm: number;
  rivalKm: number;
  /** Scale reference for dot placement — max extent of the track. */
  goalKm: number;
  gapM: number;
  myColor: string;
  rivalColor: string;
}

export interface StoryContext {
  totalDistance: number;       // km
  totalDuration: number;       // seconds
  currentPace: number;         // min/km
  sessionGoal: SessionGoal | null;
  selectedUid: string | null;
  standings: StandingsResult | null;
}

export interface StorySpec {
  id: string;
  kind: StoryKind;
  label: string;
  render: 'fill' | 'track';
  /** Text line shown above the bar: "2.40 / 5.00 ק״מ" or "12:30". */
  getValue: (ctx: StoryContext) => string;
  /** 0–100 for fill render. null = no goal (bar hidden / muted). */
  getProgress?: (ctx: StoryContext) => number | null;
  /** Data for the 2-dot race track render. null = not enough data. */
  getTrack?: (ctx: StoryContext) => TrackData | null;
  visibleWhen: (ctx: StoryContext) => boolean;
}

/** Extensible slide descriptor used by StatsCarousel — moved here to break
 *  any circular import between buildDrawerSlides and StatsCarousel/index. */
export interface DrawerSlide {
  id: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.ComponentType<any>;
}
