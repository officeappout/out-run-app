/**
 * getParkOnce — ONE getPark point-fetch per park per session, shared by every surface that needs a
 * park's full record (gymEquipment / city / rating — the cached catalog carries none of them):
 * the workout preview's "איפה מתאמנים?" carousel and the map places drawer. A failed read resolves
 * to null (and is memoised too, so a missing park is not re-read on every render).
 */
import { getPark } from './parks.service';
import type { Park } from '../types/park.types';

const pointFetches = new Map<string, Promise<Park | null>>();

export function getParkOnce(id: string): Promise<Park | null> {
  let p = pointFetches.get(id);
  if (!p) {
    p = getPark(id).catch(() => null);
    pointFetches.set(id, p);
  }
  return p;
}
