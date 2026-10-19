import { distanceToPathM } from '../geo';
import { decodePolyline } from '../polyline';
import type { Finding, InvariantRule } from './types';

/** A station park further than this from the line = the route does not pass through it. */
export const STATION_MAX_DISTANCE_M = 30;
/** The stored line is privacy-trimmed; a park within this of a trimmed end can't be judged from it. */
const TRIM_SLACK_M = 250;

export const routeMissesStationPark: InvariantRule = {
  id: 'ROUTE_MISSES_STATION_PARK',
  titleHe: 'המסלול לא עובר בפארק של התחנה',
  descriptionHe: `פארק של תחנת כוח רחוק יותר מ-${STATION_MAX_DISTANCE_M} מ׳ מקו המסלול — המשתמש רואה תחנה שהמסלול לא מגיע אליה.`,
  severity: 3,
  check({ output }) {
    if (!output.route || !output.stations?.length) return [];
    let line: ReturnType<typeof decodePolyline> | null = null;
    const findings: Finding[] = [];
    for (const st of output.stations) {
      let d = st.distanceToRouteM;
      if (d === null || d === undefined) {
        line ??= decodePolyline(output.route.polyline);
        const fromStored = distanceToPathM([st.lng, st.lat], line);
        // Measured against the trimmed line only: a big gap near the cut ends is not proof.
        if (fromStored === null || fromStored > TRIM_SLACK_M) continue;
        d = fromStored;
      }
      if (d > STATION_MAX_DISTANCE_M) {
        findings.push({
          ruleId: 'ROUTE_MISSES_STATION_PARK',
          severity: d > 150 ? 3 : 2,
          messageHe: `הפארק ${st.parkId} נמצא ${Math.round(d)} מ׳ מהמסלול`,
          data: { parkId: st.parkId, distanceM: Math.round(d) },
        });
      }
    }
    return findings;
  },
};
