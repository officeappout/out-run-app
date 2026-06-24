/**
 * SessionPolicy — configuration object driving LiveSessionShell.
 *
 * Each session mode (solo / group / duo / competition / virtual) is a
 * SessionPolicy value, not a separate screen. LiveSessionShell reads this
 * object and routes slot content accordingly.
 *
 * Slot consumption map:
 *   TopBar   — mode, goal, participants (sum progress), coLocation
 *   SideRail — participants, selectedUid, mode
 *   MapLayer — participants, coLocation (remote → silhouette), route
 *   Drawer   — mode, selectedUid, participants (VS page)
 */

export type SessionMode = 'solo' | 'group' | 'duo' | 'competition' | 'virtual';
export type CoLocation = 'none' | 'together' | 'remote';
export type SessionEntry = 'scheduled' | 'link' | 'discover';

export interface RouteRef {
  id: string;
}

export interface Participant {
  uid: string;
  name: string;
  photoURL?: string;
  personaImageUrl: string;
  /** Color from GROUP_COLORS palette in useGroupPresence. */
  color: string;
  distanceKm: number;
  /** "5:30" format — from mockPace or real pace. */
  pace?: string;
  /** From PresenceActivity.status. */
  status: string;
  /** true when coLocation === 'remote' (virtual mode). */
  isRemote: boolean;
  /** 1-based rank — competition mode only. */
  place?: number;
}

export interface SessionGoal {
  type: 'sum' | 'individual' | 'none';
  /** Per-runner target km — used when type === 'individual'. */
  perPersonKm?: number;
  /** Collective sum target km — used when type === 'sum'. */
  totalKm?: number;
}

export interface SessionPolicy {
  mode: SessionMode;
  entry: SessionEntry;
  coLocation: CoLocation;
  goal: SessionGoal;
  participants: Participant[];
  /** UID of the participant selected for the VS/comparison drawer page. */
  selectedUid: string | null;
  /** null = no turn-by-turn navigation card. */
  route: RouteRef | null;
}
