import type { TvParticipantProgress } from '../phone/phone-store';
import type { RunnerSnapshot } from './runner-snapshot';

/** A participant's own place in the shared workout, for the TV friends row. */
export function progressFromSnapshot(snap: Pick<RunnerSnapshot, 'phase' | 'setIndex' | 'setCount'>): TvParticipantProgress {
  return {
    state: snap.phase === 'done' ? 'done' : snap.phase === 'rest' ? 'resting' : 'active',
    set: snap.setIndex,
    totalSets: snap.setCount,
  };
}
