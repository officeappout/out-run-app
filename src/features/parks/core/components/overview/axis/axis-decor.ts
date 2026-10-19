/**
 * Optional decorations of the overview axis cards, provided by the consumer
 * through OverviewLegAxis (run overview, boards M-7a / 7b / 7c,
 * enable_home_v2). Without them every card renders exactly as before.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { GroupLeg } from '../overview-legs';

export interface AxisPaceSlot {
  paceKey: string;
  /** The pace as the card would print it ("6:15" / "4:45–4:55"). */
  text: string;
  edited: boolean;
  /** 'pill' — an aerobic leg's pace pill; 'row' — a group row's pace. */
  tone: 'pill' | 'row';
}

export interface AxisDecorations {
  /** Replaces a pace that has an edit target (`paceKey`) — e.g. a tappable pace. */
  renderPace?: (slot: AxisPaceSlot) => ReactNode;
  /** A group leg's header action (e.g. "החלף") and a note under its header. */
  groupExtras?: (leg: GroupLeg) => { action?: ReactNode; note?: ReactNode } | null;
  /** A drill / exercise tapped (a leg's `drills` chip or a group row's `drillKey`) — open its video. */
  onDrillTap?: (drillKey: string) => void;
}

export const AxisDecor = createContext<AxisDecorations>({});
export const useAxisDecor = () => useContext(AxisDecor);
