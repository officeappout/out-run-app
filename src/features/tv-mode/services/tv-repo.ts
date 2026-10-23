import { db } from '@/lib/firebase';
import { createFirestoreTvRepo } from './firestore-tv-repo';
import type { TvSessionRepo } from './tv-session-repo';

let repo: TvSessionRepo | null = null;

/** The app's repo (Firestore). Lazy, so importing a hook never touches Firebase at module load. */
export function getTvRepo(): TvSessionRepo {
  repo ??= createFirestoreTvRepo(db);
  return repo;
}

/** Tests / demos swap the storage. */
export function setTvRepoForTests(next: TvSessionRepo | null): void {
  repo = next;
}
