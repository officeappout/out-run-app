/**
 * Analytics Service for Authority Managers
 * Privacy-first: Only aggregated/anonymized data, NO PII
 *
 * City-level rollup: All functions accept an authorityId that may be a city.
 * getAuthorityWithChildrenIds() expands it to include child neighborhoods,
 * so queries with Firestore 'in' cover users assigned to any neighborhood of
 * that city. (Firestore 'in' limit is 30; Sderot has 14 neighborhoods = 15
 * total IDs, well within the limit.)
 *
 * Performance: All batch queries run in parallel (Promise.all).
 * Authority children + user IDs are cached for 5 minutes to prevent
 * redundant Firestore reads across concurrent function calls.
 */
import {
  collection,
  doc,
  query,
  where,
  getDocs,
  getDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getChildrenByParent } from './authority.service';


const USERS_COLLECTION = 'users';
const WORKOUTS_COLLECTION = 'workouts';
const SESSIONS_COLLECTION = 'sessions';

// ── In-memory TTL cache ───────────────────────────────────────────────────────
const _cache = new Map<string, { value: unknown; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function cacheGet<T>(key: string): T | undefined {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { _cache.delete(key); return undefined; }
  return entry.value as T;
}
function cacheSet(key: string, value: unknown): void {
  _cache.set(key, { value, ts: Date.now() });
}

// ── Index-building sentinel ───────────────────────────────────────────────────
let _workoutsIndexBuilding = false;
export function isWorkoutsIndexBuilding(): boolean { return _workoutsIndexBuilding; }

// ── Helper: split array into chunks ──────────────────────────────────────────
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ── Index-building error detector ─────────────────────────────────────────────
function isIndexBuildingError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: string }).code ?? '';
  const msg  = (err as { message?: string }).message ?? '';
  return code === 'failed-precondition' || msg.includes('index') || msg.includes('requires an index');
}

// ── Rollup helper ─────────────────────────────────────────────────────────────

/**
 * Returns the given authority ID plus all direct child authority IDs.
 * Result is cached for 5 minutes so concurrent callers share one Firestore read.
 */
export async function getAuthorityWithChildrenIds(authorityId: string): Promise<string[]> {
  const key = `children:${authorityId}`;
  const cached = cacheGet<string[]>(key);
  if (cached) return cached;

  try {
    const children = await getChildrenByParent(authorityId);
    const ids = [authorityId, ...children.map(c => c.id)];
    cacheSet(key, ids);
    return ids;
  } catch {
    return [authorityId];
  }
}

/**
 * Get all user IDs for an authority (city or neighborhood).
 * Cached for 5 minutes. Batches run in parallel.
 */
async function getUserIdsForAuthority(authorityId: string, tenantId?: string): Promise<string[]> {
  const cacheKey = tenantId ? `userIds:tenant:${tenantId}` : `userIds:${authorityId}`;
  const cached = cacheGet<string[]>(cacheKey);
  if (cached) return cached;

  const userIds: string[] = [];

  if (tenantId) {
    const snap = await getDocs(query(
      collection(db, USERS_COLLECTION),
      where('core.tenantId', '==', tenantId)
    ));
    snap.docs.forEach(d => userIds.push(d.id));
  } else {
    const ids = await getAuthorityWithChildrenIds(authorityId);
    await Promise.all(chunk(ids, 30).map(async (batch) => {
      const snap = await getDocs(query(
        collection(db, USERS_COLLECTION),
        where('core.authorityId', 'in', batch)
      ));
      snap.docs.forEach(d => userIds.push(d.id));
    }));
  }

  cacheSet(cacheKey, userIds);
  return userIds;
}

/**
 * Get user docs (with data) for an authority. Cached for 5 minutes.
 */
async function getUserDocsForAuthority(authorityId: string, tenantId?: string): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const cacheKey = tenantId ? `userDocs:tenant:${tenantId}` : `userDocs:${authorityId}`;
  const cached = cacheGet<{ id: string; data: Record<string, unknown> }[]>(cacheKey);
  if (cached) return cached;

  const docs: { id: string; data: Record<string, unknown> }[] = [];

  if (tenantId) {
    const snap = await getDocs(query(
      collection(db, USERS_COLLECTION),
      where('core.tenantId', '==', tenantId)
    ));
    snap.docs.forEach(d => docs.push({ id: d.id, data: d.data() as Record<string, unknown> }));
  } else {
    const ids = await getAuthorityWithChildrenIds(authorityId);
    await Promise.all(chunk(ids, 30).map(async (batch) => {
      const snap = await getDocs(query(
        collection(db, USERS_COLLECTION),
        where('core.authorityId', 'in', batch)
      ));
      snap.docs.forEach(d => docs.push({ id: d.id, data: d.data() as Record<string, unknown> }));
    }));
  }

  cacheSet(cacheKey, docs);
  return docs;
}

// ── Fallback DAU via lastActive ───────────────────────────────────────────────
async function getDauFallback(userIds: string[], date: Date): Promise<number> {
  const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
  const endOfDay   = new Date(date); endOfDay.setHours(23, 59, 59, 999);
  const startTs = Timestamp.fromDate(startOfDay);
  const endTs   = Timestamp.fromDate(endOfDay);
  const activeSet = new Set<string>();

  await Promise.all(chunk(userIds, 30).map(async (batch) => {
    try {
      const q = query(
        collection(db, USERS_COLLECTION),
        where('__name__', 'in', batch),
        where('lastActive', '>=', startTs),
        where('lastActive', '<=', endTs)
      );
      const snap = await getDocs(q);
      snap.docs.forEach(d => activeSet.add(d.id));
    } catch { /* ignore per-batch errors in fallback */ }
  }));

  return activeSet.size;
}

// ── DAU / MAU ─────────────────────────────────────────────────────────────────

export async function getDailyActiveUsers(
  authorityId: string,
  date: Date
): Promise<number> {
  try {
    const userIds = await getUserIdsForAuthority(authorityId);

    console.log(`[DAU] authority=${authorityId} | userCount=${userIds.length} | date=${date.toISOString().split('T')[0]}`);

    if (userIds.length === 0) {
      console.warn(`[DAU] No users for authority ${authorityId}. Returning 0.`);
      return 0;
    }

    const startOfDay = new Date(date); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay   = new Date(date); endOfDay.setHours(23, 59, 59, 999);
    const startTs = Timestamp.fromDate(startOfDay);
    const endTs   = Timestamp.fromDate(endOfDay);
    const activeSet = new Set<string>();

    await Promise.all(chunk(userIds, 30).map(async (batch) => {
      const q = query(
        collection(db, WORKOUTS_COLLECTION),
        where('userId', 'in', batch),
        where('date', '>=', startTs),
        where('date', '<=', endTs)
      );
      const snap = await getDocs(q);
      snap.docs.forEach(d => activeSet.add(d.data().userId));
    }));

    _workoutsIndexBuilding = false;
    console.log(`[DAU] result=${activeSet.size}`);
    return activeSet.size;
  } catch (error) {
    if (isIndexBuildingError(error)) {
      _workoutsIndexBuilding = true;
      console.warn('[DAU] Index still building — using lastActive fallback.');
      try {
        const userIds = await getUserIdsForAuthority(authorityId);
        const fallback = await getDauFallback(userIds, date);
        console.log(`[DAU] Fallback=${fallback}`);
        return fallback;
      } catch (fallbackErr) {
        console.error('[DAU] Fallback failed:', fallbackErr);
      }
    } else {
      console.error('[DAU] Unexpected error:', error);
    }
    return 0;
  }
}

export async function getMonthlyActiveUsers(
  authorityId: string,
  year: number,
  month: number
): Promise<number> {
  try {
    const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
    const endOfMonth   = new Date(year, month,     0, 23, 59, 59, 999);
    const userIds = await getUserIdsForAuthority(authorityId);

    console.log(`[MAU] authority=${authorityId} | userCount=${userIds.length} | month=${year}-${String(month).padStart(2, '0')}`);

    if (userIds.length === 0) {
      console.warn(`[MAU] No users for authority ${authorityId}. Returning 0.`);
      return 0;
    }

    const startTs = Timestamp.fromDate(startOfMonth);
    const endTs   = Timestamp.fromDate(endOfMonth);
    const activeSet = new Set<string>();

    await Promise.all(chunk(userIds, 30).map(async (batch) => {
      const q = query(
        collection(db, WORKOUTS_COLLECTION),
        where('userId', 'in', batch),
        where('date', '>=', startTs),
        where('date', '<=', endTs)
      );
      const snap = await getDocs(q);
      snap.docs.forEach(d => activeSet.add(d.data().userId));
    }));

    _workoutsIndexBuilding = false;
    console.log(`[MAU] result=${activeSet.size}`);
    return activeSet.size;
  } catch (error) {
    if (isIndexBuildingError(error)) {
      _workoutsIndexBuilding = true;
      console.warn('[MAU] Index still building — using lastActive fallback.');
      try {
        const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const userIds = await getUserIdsForAuthority(authorityId);
        const fallback = await getDauFallback(userIds, startOfMonth);
        console.log(`[MAU] Fallback=${fallback}`);
        return fallback;
      } catch (fallbackErr) {
        console.error('[MAU] Fallback failed:', fallbackErr);
      }
    } else {
      console.error('[MAU] Unexpected error:', error);
    }
    return 0;
  }
}

// ── Gender / Age ──────────────────────────────────────────────────────────────

export interface GenderDistribution {
  male: number;
  female: number;
  other: number;
  total: number;
}

export async function getGenderDistribution(
  authorityId: string
): Promise<GenderDistribution> {
  try {
    const docs = await getUserDocsForAuthority(authorityId);
    const distribution: GenderDistribution = { male: 0, female: 0, other: 0, total: 0 };

    docs.forEach(({ data }) => {
      const gender = (data as { core?: { gender?: string } })?.core?.gender ?? 'other';
      if (gender === 'male') distribution.male++;
      else if (gender === 'female') distribution.female++;
      else distribution.other++;
      distribution.total++;
    });

    return distribution;
  } catch (error) {
    console.error('Error calculating gender distribution:', error);
    return { male: 0, female: 0, other: 0, total: 0 };
  }
}

export interface AgeDistribution {
  '18-25': number;
  '26-35': number;
  '36-45': number;
  '46-55': number;
  '56+': number;
  total: number;
}

export async function getAgeDistribution(
  authorityId: string
): Promise<AgeDistribution> {
  try {
    const docs = await getUserDocsForAuthority(authorityId);
    const distribution: AgeDistribution = {
      '18-25': 0, '26-35': 0, '36-45': 0, '46-55': 0, '56+': 0, total: 0,
    };
    const currentYear = new Date().getFullYear();

    docs.forEach(({ data }) => {
      const birthDate = (data as { core?: { birthDate?: Timestamp | Date | string } })?.core?.birthDate;
      if (birthDate) {
        let birthYear: number | null = null;
        if (birthDate instanceof Date) {
          birthYear = birthDate.getFullYear();
        } else if (typeof birthDate === 'string') {
          const parsed = new Date(birthDate);
          if (!isNaN(parsed.getTime())) birthYear = parsed.getFullYear();
        } else if (typeof (birthDate as Timestamp).toDate === 'function') {
          birthYear = (birthDate as Timestamp).toDate().getFullYear();
        }
        if (birthYear == null) { distribution.total++; return; }
        const age = currentYear - birthYear;
        if (age >= 18 && age <= 25) distribution['18-25']++;
        else if (age >= 26 && age <= 35) distribution['26-35']++;
        else if (age >= 36 && age <= 45) distribution['36-45']++;
        else if (age >= 46 && age <= 55) distribution['46-55']++;
        else if (age >= 56) distribution['56+']++;
      }
      distribution.total++;
    });

    return distribution;
  } catch (error) {
    console.error('Error calculating age distribution:', error);
    return { '18-25': 0, '26-35': 0, '36-45': 0, '46-55': 0, '56+': 0, total: 0 };
  }
}

// ── Popular Parks ─────────────────────────────────────────────────────────────

export interface PopularPark {
  parkId: string;
  parkName: string;
  checkInCount: number;
}

export async function getPopularParks(
  authorityId: string,
  limit: number = 10
): Promise<PopularPark[]> {
  try {
    const ids = await getAuthorityWithChildrenIds(authorityId);
    const parkCounts = new Map<string, number>();

    await Promise.all(chunk(ids, 30).map(async (batch) => {
      const q = query(
        collection(db, SESSIONS_COLLECTION),
        where('authorityId', 'in', batch)
      );
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
        const parkId = d.data().parkId;
        if (parkId) parkCounts.set(parkId, (parkCounts.get(parkId) || 0) + 1);
      });
    }));

    // Resolve park names in a single parallel batch
    const topEntries = Array.from(parkCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit);

    const resolvedNames = await Promise.all(
      topEntries.map(async ([parkId]) => {
        try {
          const snap = await getDoc(doc(db, 'parks', parkId));
          return snap.exists() ? (snap.data()?.name as string) || parkId : parkId;
        } catch {
          return parkId;
        }
      })
    );

    return topEntries.map(([parkId, count], i) => ({
      parkId,
      parkName: resolvedNames[i],
      checkInCount: count,
    }));
  } catch (error) {
    console.error('Error calculating popular parks:', error);
    return [];
  }
}

// ── Activity Trend ────────────────────────────────────────────────────────────

export interface ActivityTrend {
  date: string;
  dau: number;
  mau?: number;
}

/**
 * Calculates DAU for each of the last `days` days using a SINGLE range query
 * per batch instead of 30 separate per-day queries.
 * 30 days × n users: was ~420 sequential reads → now 6 parallel reads.
 */
export async function getActivityTrend(
  authorityId: string,
  days: number = 30
): Promise<ActivityTrend[]> {
  try {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - (days - 1));
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(today);
    endDate.setHours(23, 59, 59, 999);

    // Build an empty date → Set<userId> map for the full window
    const dateMap = new Map<string, Set<string>>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      dateMap.set(d.toISOString().split('T')[0], new Set());
    }

    const userIds = await getUserIdsForAuthority(authorityId); // cached
    console.log(`[Trend] authority=${authorityId} | userCount=${userIds.length} | days=${days}`);

    if (userIds.length === 0) {
      return Array.from(dateMap.entries()).map(([date]) => ({ date, dau: 0 }));
    }

    const startTs = Timestamp.fromDate(startDate);
    const endTs   = Timestamp.fromDate(endDate);

    // ONE range query per user-batch (parallel), aggregate by date in memory
    await Promise.all(chunk(userIds, 30).map(async (batch) => {
      try {
        const q = query(
          collection(db, WORKOUTS_COLLECTION),
          where('userId', 'in', batch),
          where('date', '>=', startTs),
          where('date', '<=', endTs)
        );
        const snap = await getDocs(q);
        console.log(`[Trend] batch(${batch.length} users) → ${snap.size} workout docs`);
        snap.docs.forEach(d => {
          const { userId, date: rawDate } = d.data();
          if (!userId || !rawDate) return;
          const dateKey = (rawDate as Timestamp).toDate().toISOString().split('T')[0];
          dateMap.get(dateKey)?.add(userId);
        });
      } catch (err) {
        if (isIndexBuildingError(err)) _workoutsIndexBuilding = true;
        else console.error('[Trend] batch error:', err);
      }
    }));

    return Array.from(dateMap.entries()).map(([date, users]) => ({ date, dau: users.size }));
  } catch (error) {
    console.error('Error calculating activity trend:', error);
    return [];
  }
}

// ── Neighborhood Performance Breakdown ───────────────────────────────────────

export interface NeighborhoodBreakdownRow {
  neighborhoodId: string;
  neighborhoodName: string;
  totalUsers: number;
  activeUsers: number;
  workouts: number;
  totalActiveMinutes: number;
  targetAudienceCount: number;
  targetAudiencePercent: number;
}

/**
 * Per-neighborhood stats using fully parallel batch queries.
 * Old approach: 14 neighborhoods × sequential per-neighborhood queries ≈ 42 reads.
 * New approach: 1 users query + 2 parallel workout queries (all batched) ≈ 13 reads.
 */
export async function getNeighborhoodBreakdown(
  cityId: string,
  ageRange?: { min: number; max: number }
): Promise<NeighborhoodBreakdownRow[]> {
  try {
    const children = await getChildrenByParent(cityId);
    if (children.length === 0) return [];

    const now = new Date();
    const currentYear = now.getFullYear();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const startTs = Timestamp.fromDate(startOfMonth);
    const endTs   = Timestamp.fromDate(now);

    const ageMin = ageRange?.min ?? 35;
    const ageMax = ageRange?.max ?? 55;

    const childIds = children.map(c => c.id);

    // 1. Fetch ALL users across all neighborhoods in parallel batches
    const allUserDocs: { id: string; authorityId: string; birthYear: number | null }[] = [];
    await Promise.all(chunk(childIds, 30).map(async (batch) => {
      const snap = await getDocs(query(
        collection(db, USERS_COLLECTION),
        where('core.authorityId', 'in', batch)
      ));
      snap.docs.forEach(d => {
        const data = d.data() as Record<string, unknown>;
        const core = data.core as Record<string, unknown> | undefined;
        const birthDate = core?.birthDate;
        let birthYear: number | null = null;
        if (birthDate) {
          if (birthDate instanceof Date) birthYear = birthDate.getFullYear();
          else if (typeof birthDate === 'string') {
            const parsed = new Date(birthDate);
            if (!isNaN(parsed.getTime())) birthYear = parsed.getFullYear();
          } else if (typeof (birthDate as Timestamp).toDate === 'function') {
            birthYear = (birthDate as Timestamp).toDate().getFullYear();
          }
        }
        allUserDocs.push({
          id: d.id,
          authorityId: (core?.authorityId as string) ?? '',
          birthYear,
        });
      });
    }));

    console.log(`[Neighborhood] ${children.length} neighborhoods | ${allUserDocs.length} total users`);

    // 2. Group users by neighborhood in memory
    const usersByNeighborhood = new Map<string, typeof allUserDocs>();
    children.forEach(c => usersByNeighborhood.set(c.id, []));
    allUserDocs.forEach(u => usersByNeighborhood.get(u.authorityId)?.push(u));

    const allUserIds = allUserDocs.map(d => d.id);
    if (allUserIds.length === 0) {
      return children.map(c => ({
        neighborhoodId: c.id,
        neighborhoodName: typeof c.name === 'string' ? c.name : String(c.name),
        totalUsers: 0, activeUsers: 0, workouts: 0,
        totalActiveMinutes: 0, targetAudienceCount: 0, targetAudiencePercent: 0,
      }));
    }

    // 3. Fetch monthly + all-time workouts in FULLY PARALLEL batch queries
    const monthlyActiveByUser = new Map<string, boolean>();
    const totalWorkoutsByUser = new Map<string, number>();
    const totalMinutesByUser = new Map<string, number>();

    await Promise.all([
      Promise.all(chunk(allUserIds, 30).map(async (batch) => {
        const snap = await getDocs(query(
          collection(db, WORKOUTS_COLLECTION),
          where('userId', 'in', batch),
          where('date', '>=', startTs),
          where('date', '<=', endTs)
        ));
        snap.docs.forEach(d => {
          const raw = d.data();
          const uid = raw.userId as string | undefined;
          if (uid) {
            monthlyActiveByUser.set(uid, true);
            const dur = (raw.duration as number) ?? 0;
            totalMinutesByUser.set(uid, (totalMinutesByUser.get(uid) ?? 0) + dur / 60);
          }
        });
        console.log(`[Neighborhood] monthly batch(${batch.length}) → ${snap.size} docs`);
      })),

      Promise.all(chunk(allUserIds, 30).map(async (batch) => {
        const snap = await getDocs(query(
          collection(db, WORKOUTS_COLLECTION),
          where('userId', 'in', batch)
        ));
        snap.docs.forEach(d => {
          const uid = d.data().userId as string | undefined;
          if (uid) totalWorkoutsByUser.set(uid, (totalWorkoutsByUser.get(uid) ?? 0) + 1);
        });
      })),
    ]);

    // 4. Aggregate per neighbourhood in memory
    return children
      .map(child => {
        const users = usersByNeighborhood.get(child.id) ?? [];
        const userIds = users.map(u => u.id);
        const totalUsers = userIds.length;
        const activeUsers = userIds.filter(uid => monthlyActiveByUser.get(uid) === true).length;
        const workouts = userIds.reduce((sum, uid) => sum + (totalWorkoutsByUser.get(uid) ?? 0), 0);
        const totalActiveMinutes = Math.round(
          userIds.reduce((sum, uid) => sum + (totalMinutesByUser.get(uid) ?? 0), 0)
        );

        const targetAudienceCount = users.filter(u => {
          if (u.birthYear == null) return false;
          const age = currentYear - u.birthYear;
          return age >= ageMin && age <= ageMax;
        }).length;

        const targetAudiencePercent = totalUsers > 0
          ? Math.round((targetAudienceCount / totalUsers) * 1000) / 10
          : 0;

        return {
          neighborhoodId: child.id,
          neighborhoodName: typeof child.name === 'string' ? child.name : String(child.name),
          totalUsers,
          activeUsers,
          workouts,
          totalActiveMinutes,
          targetAudienceCount,
          targetAudiencePercent,
        };
      })
      .sort((a, b) => b.activeUsers - a.activeUsers);
  } catch (error) {
    console.error('Error calculating neighborhood breakdown:', error);
    return [];
  }
}

// ── Authority Stats (WHO health ROI) ─────────────────────────────────────────

export interface AuthorityStats {
  totalUsers: number;
  totalMinutes: number;
  usersMeetingWHOThreshold: number;
  whoPercentage: number;
}

const WHO_WEEKLY_TARGET_MINUTES = 150;

function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { start: monday, end: sunday };
}

// ── Cross-Reference Filter Types ──────────────────────────────────────────────

export interface DashboardFilters {
  timeRange: 'day' | 'week' | 'month' | 'year';
  gender: 'all' | 'male' | 'female';
  persona: string;
  neighborhoodId: string;
  compareNeighborhoodId: string | null;
}

export const DEFAULT_FILTERS: DashboardFilters = {
  timeRange: 'month',
  gender: 'all',
  persona: 'all',
  neighborhoodId: 'all',
  compareNeighborhoodId: null,
};

// ── Date-range resolver ───────────────────────────────────────────────────────

export function getDateRangeForFilter(
  timeRange: DashboardFilters['timeRange']
): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  const start = new Date(now);
  switch (timeRange) {
    case 'day':
      start.setHours(0, 0, 0, 0);
      break;
    case 'week': {
      const day = start.getDay();
      start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
      start.setHours(0, 0, 0, 0);
      break;
    }
    case 'month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      break;
    case 'year':
      start.setMonth(0, 1);
      start.setHours(0, 0, 0, 0);
      break;
  }
  return { start, end };
}

// ── Filtered user IDs (in-memory, zero Firestore reads on cache hit) ─────────

export async function getFilteredUserIds(
  authorityId: string,
  filters: Pick<DashboardFilters, 'gender' | 'persona' | 'neighborhoodId'>
): Promise<string[]> {
  const docs = await getUserDocsForAuthority(authorityId);

  return docs
    .filter(({ data }) => {
      const core = data.core as Record<string, unknown> | undefined;
      if (!core) return false;

      if (filters.gender !== 'all' && core.gender !== filters.gender) return false;

      if (filters.neighborhoodId !== 'all' && core.authorityId !== filters.neighborhoodId) return false;

      if (filters.persona !== 'all') {
        const answers = data.onboardingAnswers as Record<string, unknown> | undefined;
        const personas = (answers?.personas ?? []) as string[];
        const personaId = data.personaId as string | undefined;
        if (!personas.includes(filters.persona) && personaId !== filters.persona) return false;
      }

      return true;
    })
    .map(d => d.id);
}

// ── Activity by Hour (stacked bar data) ──────────────────────────────────────

export interface HourlyBucket {
  hour: number;
  label: string;
  total: number;
  strength: number;
  running: number;
  walking: number;
}

export async function getActivityByHour(
  userIds: string[],
  dateRange: { start: Date; end: Date }
): Promise<HourlyBucket[]> {
  const buckets = new Map<number, HourlyBucket>();
  for (let h = 0; h < 24; h++) {
    buckets.set(h, {
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      total: 0, strength: 0, running: 0, walking: 0,
    });
  }

  if (userIds.length === 0) return Array.from(buckets.values());

  const startTs = Timestamp.fromDate(dateRange.start);
  const endTs   = Timestamp.fromDate(dateRange.end);

  await Promise.all(chunk(userIds, 30).map(async (batch) => {
    try {
      const q = query(
        collection(db, WORKOUTS_COLLECTION),
        where('userId', 'in', batch),
        where('date', '>=', startTs),
        where('date', '<=', endTs)
      );
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
        const raw = d.data();
        const ts = raw.date as Timestamp | undefined;
        if (!ts) return;
        const hour = ts.toDate().getHours();
        const bucket = buckets.get(hour)!;
        bucket.total++;
        const type = (raw.activityType ?? raw.workoutType ?? 'strength') as string;
        if (type === 'running') bucket.running++;
        else if (type === 'walking') bucket.walking++;
        else bucket.strength++;
      });
    } catch (err) {
      if (isIndexBuildingError(err)) _workoutsIndexBuilding = true;
      else console.error('[HourlyActivity] batch error:', err);
    }
  }));

  return Array.from(buckets.values());
}

// ── Persona Distribution ──────────────────────────────────────────────────────

export interface PersonaCount { personaId: string; label: string; count: number }

const PERSONA_LABELS: Record<string, string> = {
  mothers: 'אמהות פעילות', seniors: 'גיל הזהב', soldiers: 'חיילים/משוחררים',
  students: 'סטודנטים', runners: 'רצים', gym_goers: 'מתאמנים בחדר כושר',
  wellness_seekers: 'מחפשי בריאות', dog_walkers: 'מטיילי כלבים', general: 'כללי',
};

export async function getPersonaDistribution(authorityId: string): Promise<PersonaCount[]> {
  try {
    const docs = await getUserDocsForAuthority(authorityId);
    const tally = new Map<string, number>();

    docs.forEach(({ data }) => {
      const answers = data.onboardingAnswers as Record<string, unknown> | undefined;
      const personas = (answers?.personas ?? []) as string[];
      const fallback = data.personaId as string | undefined;

      if (personas.length > 0) {
        personas.forEach(p => tally.set(p, (tally.get(p) ?? 0) + 1));
      } else if (fallback) {
        tally.set(fallback, (tally.get(fallback) ?? 0) + 1);
      }
    });

    return Array.from(tally.entries())
      .map(([personaId, count]) => ({ personaId, label: PERSONA_LABELS[personaId] ?? personaId, count }))
      .sort((a, b) => b.count - a.count);
  } catch (error) {
    console.error('Error calculating persona distribution:', error);
    return [];
  }
}

// ── Entry Route Distribution ──────────────────────────────────────────────────

export interface EntryRouteDistribution {
  FULL_PROGRAM: number;
  MAP_ONLY: number;
  RUNNING: number;
  unknown: number;
}

export async function getEntryRouteDistribution(authorityId: string): Promise<EntryRouteDistribution> {
  try {
    const docs = await getUserDocsForAuthority(authorityId);
    const dist: EntryRouteDistribution = { FULL_PROGRAM: 0, MAP_ONLY: 0, RUNNING: 0, unknown: 0 };

    docs.forEach(({ data }) => {
      const path = data.onboardingPath as string | undefined;
      const mode = ((data.lifestyle as Record<string, unknown> | undefined)?.dashboardMode) as string | undefined;

      if (path === 'RUNNING' || mode === 'RUNNING') dist.RUNNING++;
      else if (path === 'MAP_ONLY') dist.MAP_ONLY++;
      else if (path === 'FULL_PROGRAM') dist.FULL_PROGRAM++;
      else dist.unknown++;
    });

    return dist;
  } catch (error) {
    console.error('Error calculating entry route distribution:', error);
    return { FULL_PROGRAM: 0, MAP_ONLY: 0, RUNNING: 0, unknown: 0 };
  }
}

// ── Running Stats (mileage + target distance) ────────────────────────────────

export interface RunningStats {
  totalCityKm: number;
  targetDistribution: { label: string; count: number }[];
}

export async function getRunningStats(
  authorityId: string,
  userIds: string[],
  dateRange: { start: Date; end: Date }
): Promise<RunningStats> {
  try {
    let totalCityKm = 0;

    if (userIds.length > 0) {
      const startTs = Timestamp.fromDate(dateRange.start);
      const endTs   = Timestamp.fromDate(dateRange.end);

      await Promise.all(chunk(userIds, 30).map(async (batch) => {
        try {
          const q = query(
            collection(db, WORKOUTS_COLLECTION),
            where('userId', 'in', batch),
            where('date', '>=', startTs),
            where('date', '<=', endTs)
          );
          const snap = await getDocs(q);
          snap.docs.forEach(d => {
            const raw = d.data();
            const type = (raw.activityType ?? raw.workoutType ?? '') as string;
            if (type === 'running' || type === 'walking') {
              totalCityKm += (raw.distance as number) ?? 0;
            }
          });
        } catch (err) {
          if (!isIndexBuildingError(err)) console.error('[RunningStats] batch error:', err);
        }
      }));
    }

    // Target distance from user docs (cached, zero Firestore reads on hit)
    const allDocs = await getUserDocsForAuthority(authorityId);
    const uidSet = new Set(userIds);
    const targetTally = new Map<string, number>();

    allDocs.filter(d => uidSet.has(d.id)).forEach(({ data }) => {
      const running = data.running as Record<string, unknown> | undefined;
      const onboarding = running?.onboardingData as Record<string, unknown> | undefined;
      const td = onboarding?.targetDistance as string | undefined;
      if (td) targetTally.set(td, (targetTally.get(td) ?? 0) + 1);
    });

    const distLabels: Record<string, string> = { '3k': '3K', '5k': '5K', '10k': '10K', '2k': '2K', maintenance: 'מינטננס' };
    const targetDistribution = Array.from(targetTally.entries())
      .map(([key, count]) => ({ label: distLabels[key] ?? key, count }))
      .sort((a, b) => b.count - a.count);

    return { totalCityKm: Math.round(totalCityKm * 10) / 10, targetDistribution };
  } catch (error) {
    console.error('Error calculating running stats:', error);
    return { totalCityKm: 0, targetDistribution: [] };
  }
}

// ── Neighborhood list helper (for filter dropdowns) ──────────────────────────

export async function getNeighborhoodList(
  cityId: string
): Promise<{ id: string; name: string }[]> {
  try {
    const children = await getChildrenByParent(cityId);
    return children.map(c => ({
      id: c.id,
      name: typeof c.name === 'string' ? c.name : String(c.name),
    }));
  } catch {
    return [];
  }
}

// ── Authority Stats (WHO health ROI) ─────────────────────────────────────────

export async function getAuthorityStats(authorityId: string): Promise<AuthorityStats> {
  try {
    const userIds = await getUserIdsForAuthority(authorityId);
    const totalUsers = userIds.length;

    if (totalUsers === 0) {
      return { totalUsers: 0, totalMinutes: 0, usersMeetingWHOThreshold: 0, whoPercentage: 0 };
    }

    const now = new Date();
    const weekRange = getWeekRange(now);
    const startTs = Timestamp.fromDate(weekRange.start);
    const endTs   = Timestamp.fromDate(weekRange.end);

    const userMinutes = new Map<string, number>();

    await Promise.all(chunk(userIds, 30).map(async (batch) => {
      const q = query(
        collection(db, WORKOUTS_COLLECTION),
        where('userId', 'in', batch),
        where('date', '>=', startTs),
        where('date', '<=', endTs)
      );
      const snap = await getDocs(q);
      snap.docs.forEach(d => {
        const { userId, duration } = d.data();
        if (userId) {
          userMinutes.set(userId, (userMinutes.get(userId) || 0) + (duration || 0) / 60);
        }
      });
    }));

    let totalMinutes = 0;
    let usersMeetingWHOThreshold = 0;

    for (const mins of userMinutes.values()) {
      totalMinutes += mins;
      if (mins >= WHO_WEEKLY_TARGET_MINUTES) usersMeetingWHOThreshold++;
    }

    const whoPercentage =
      totalUsers > 0
        ? Math.round((usersMeetingWHOThreshold / totalUsers) * 1000) / 10
        : 0;

    return {
      totalUsers,
      totalMinutes: Math.round(totalMinutes),
      usersMeetingWHOThreshold,
      whoPercentage,
    };
  } catch (error) {
    console.error('Error calculating authority stats:', error);
    return { totalUsers: 0, totalMinutes: 0, usersMeetingWHOThreshold: 0, whoPercentage: 0 };
  }
}
