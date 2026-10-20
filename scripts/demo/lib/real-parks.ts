/**
 * The real parks the demo cities reference — READ-ONLY (owner 20.10.2026: demo check-ins
 * point at the real parks of Tel Aviv / Beer Sheva / Haifa, but nothing is ever written to
 * a real park or a real authority). The real city is found by exact name; 0 or ≥ 2
 * matches → no parks for that city (never a guess), and the seed simply writes no check-ins.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { DEMO_CITIES } from './config';
import type { DemoPark } from './history';

const MAX_PARKS_PER_CITY = 8;

export async function loadRealParks(db: Firestore, log: (s: string) => void = () => {}): Promise<Record<string, DemoPark[]>> {
  const out: Record<string, DemoPark[]> = {};
  for (const c of DEMO_CITIES) {
    out[c.id] = [];
    const snap = await db.collection('authorities').where('name', 'in', c.realCityNames.slice(0, 10)).get();
    const cities = snap.docs.filter((d) => {
      const t = d.data().type;
      return !d.id.startsWith('demo-') && d.data().isDemo !== true && (t === undefined || t === 'city');
    });
    if (cities.length !== 1) {
      log(`  ${c.name}: ${cities.length} רשויות אמיתיות בשם הזה — בלי צ׳ק-אינים בפארקים`);
      continue;
    }
    const parks = await db.collection('parks').where('authorityId', '==', cities[0].id).limit(80).get();
    out[c.id] = parks.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .filter(({ data }) => (data.published ?? data.contentStatus === 'published') === true)
      .map(({ id, data }) => ({ id, name: String(data.name ?? 'פארק'), lat: Number(data.location?.lat), lng: Number(data.location?.lng) }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, MAX_PARKS_PER_CITY);
    log(`  ${c.name}: ${out[c.id].length} פארקים אמיתיים (קריאה בלבד) מ-${cities[0].id}`);
  }
  return out;
}
