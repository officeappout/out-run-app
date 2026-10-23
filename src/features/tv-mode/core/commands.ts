import type { TvCommand } from './types';

/** What the TV page itself holds, driven by host commands. */
export interface TvLocalState {
  volume: number;
  muted: boolean;
  ended: boolean;
  /** Highest command seq already applied. */
  lastSeq: number;
}

export const INITIAL_LOCAL: TvLocalState = { volume: 1, muted: false, ended: false, lastSeq: 0 };

export const clampVolume = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

/** One-shot per `seq`: a re-delivered snapshot never re-applies, an unknown command is ignored. */
export function applyCommand(state: TvLocalState, cmd: TvCommand | null | undefined): TvLocalState {
  if (!cmd || !Number.isInteger(cmd.seq) || cmd.seq <= state.lastSeq) return state;
  const base = { ...state, lastSeq: cmd.seq };
  switch (cmd.type) {
    case 'volume':
      return { ...base, volume: clampVolume(cmd.value ?? state.volume), muted: false };
    case 'mute':
      return { ...base, muted: cmd.value !== 0 };
    case 'end':
      return { ...base, ended: true };
    default:
      return base;
  }
}

/** The next command the host sends (seq strictly increases). */
export function nextCommand(prev: TvCommand | null, type: TvCommand['type'], value?: number): TvCommand {
  return { seq: (prev?.seq ?? 0) + 1, type, ...(value === undefined ? {} : { value }) };
}
