/**
 * city-mapping-summary.server — how many cities have a map inventory and at which readiness
 * level, from the STORED city_inventory/{authorityId}.readiness (computed by computeReadiness,
 * src/lib/city-inventory/readiness.ts, at apply time). Admin SDK only (city_inventory is
 * locked from clients). Cities never built have no doc and are simply not counted.
 */
import 'server-only';
import type { Firestore } from 'firebase-admin/firestore';
import { CITY_INVENTORY_COLLECTION, type ReadinessLevel } from '@/lib/city-inventory/types';

export interface CityMappingSummary {
  citiesWithInventory: number;
  byLevel: Record<ReadinessLevel, number>;
  /** lowest scores first — where work is needed */
  lowest: Array<{ authorityId: string; city: string; level: ReadinessLevel; score: number }>;
  /** highest scores first */
  highest: Array<{ authorityId: string; city: string; level: ReadinessLevel; score: number }>;
}

const LEVELS: ReadinessLevel[] = ['red', 'yellow', 'green'];

export async function computeCityMappingSummary(db: Firestore): Promise<CityMappingSummary> {
  const snap = await db.collection(CITY_INVENTORY_COLLECTION).select('city', 'readiness').get();
  const rows = snap.docs.map((d) => {
    const r = (d.data()?.readiness ?? {}) as { level?: unknown; score?: unknown };
    const level = LEVELS.includes(r.level as ReadinessLevel) ? (r.level as ReadinessLevel) : 'red';
    return {
      authorityId: d.id,
      city: typeof d.data()?.city === 'string' ? (d.data()?.city as string) : d.id,
      level,
      score: typeof r.score === 'number' && Number.isFinite(r.score) ? Math.round(r.score) : 0,
    };
  });
  const byLevel = { red: 0, yellow: 0, green: 0 } as Record<ReadinessLevel, number>;
  rows.forEach((r) => (byLevel[r.level] += 1));
  const sorted = [...rows].sort((a, b) => a.score - b.score || a.city.localeCompare(b.city, 'he'));
  return { citiesWithInventory: rows.length, byLevel, lowest: sorted.slice(0, 5), highest: sorted.slice(-5).reverse() };
}
