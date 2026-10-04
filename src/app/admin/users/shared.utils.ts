/**
 * Shared pure helpers for the admin "users" surface — the list
 * (`/admin/users/all`) and the per-user detail page
 * (`/admin/users/[uid]`, rework 04.10.2026) both need these, so they live
 * here once instead of drifting apart as two copies (exactly the class of
 * bug this project's program-identity/persona-vocabulary history has been
 * burned by repeatedly — see axioms.md §28/§29 and
 * program-identity-unification-status.md).
 *
 * No JSX here on purpose — every export is a plain data function, safe to
 * import from either a 'use client' page or (if ever needed) a server
 * context.
 */

import type { Program } from '@/features/content/programs';
import type { UserFullProfile } from '@/types/user-profile';
import { MASTER_PROGRAM_ID_TO_SLUG } from '@/features/content/programs';
import {
  resolveToSlug,
  ensureIdSlugMapWarm,
  FULL_BODY_CHILD_DOMAINS,
  UPPER_BODY_CHILD_DOMAINS,
} from '@/features/workout-engine/services/program-hierarchy.utils';

// ── Push history (detail page only, but kept here for one home for all
// of this surface's shared types) ──────────────────────────────────────

export interface PushHistoryEntry {
  pushId: string;
  sentAt?: Date;
  category?: string;
  channel?: string;
  persona?: string;
  variantId?: string;
  copyText?: string;
  delivered?: boolean;
  openedAt?: Date;
  landingPath?: string;
  outcomeChecked?: boolean;
  outcomeAchieved?: boolean;
  outcomeType?: string;
}

/** Merge push_events docs (already filtered to one uid) into one row per
 * pushId. Pure — no I/O — so the grouping logic itself is easy to reason
 * about separately from the Firestore fetch that produces its input. */
export function groupPushEventsByPushId(
  docs: Array<{ data: () => Record<string, unknown> }>,
): PushHistoryEntry[] {
  const byPushId = new Map<string, PushHistoryEntry>();
  const toDateSafe = (v: unknown): Date | undefined => {
    if (v && typeof (v as { toDate?: () => Date }).toDate === 'function') {
      return (v as { toDate: () => Date }).toDate();
    }
    return undefined;
  };

  for (const doc of docs) {
    const d = doc.data();
    const pushId = d.pushId as string | undefined;
    if (!pushId) continue;
    const entry = byPushId.get(pushId) ?? { pushId };

    switch (d.eventType as string) {
      case 'push_sent':
        entry.sentAt = toDateSafe(d.sentAt);
        entry.category = (d.category as string) ?? entry.category;
        entry.channel = (d.channel as string) ?? entry.channel;
        entry.persona = (d.persona as string) ?? entry.persona;
        entry.variantId = (d.variantId as string) ?? entry.variantId;
        entry.delivered = d.delivered as boolean | undefined;
        break;
      case 'push_opened':
        entry.openedAt = toDateSafe(d.openedAt);
        entry.channel = entry.channel ?? (d.channel as string);
        break;
      case 'landing_screen':
        entry.landingPath = d.landingPath as string | undefined;
        break;
      case 'post_push_outcome':
        entry.outcomeChecked = true;
        entry.outcomeAchieved = d.goalCompleted as boolean | undefined;
        entry.outcomeType = d.outcomeType as string | undefined;
        break;
      default:
        break;
    }
    byPushId.set(pushId, entry);
  }

  return Array.from(byPushId.values()).sort((a, b) => (b.sentAt?.getTime() ?? 0) - (a.sentAt?.getTime() ?? 0));
}

/** "If derivable" per the task — null when there are zero opens to derive
 * an hour from, not a misleading 0/00:00 default. */
export function mostCommonOpenHourIsrael(entries: PushHistoryEntry[]): number | null {
  const hours = entries
    .filter((e) => e.openedAt)
    .map((e) => Number(new Date(e.openedAt!.toLocaleString('en-US', { timeZone: 'Asia/Jerusalem' })).getHours()));
  if (hours.length === 0) return null;
  const counts = new Map<number, number>();
  hours.forEach((h) => counts.set(h, (counts.get(h) ?? 0) + 1));
  let bestHour = hours[0];
  let bestCount = -1;
  counts.forEach((count, hour) => {
    if (count > bestCount) {
      bestHour = hour;
      bestCount = count;
    }
  });
  return bestHour;
}

// ── Last-activity recency (list column + detail KPI tile) ──────────────

/**
 * Recency bucketing (David, 04.10.2026 design brief): ≤1 day = active,
 * 2-7 = calm, 8-29 = cooling, 30+ = churn-risk.
 */
export function formatLastActivity(lastActive: Date | undefined): { label: string; dotColor: string; textClass: string } {
  if (!lastActive) {
    return { label: 'אין נתון', dotColor: 'bg-gray-300', textClass: 'text-gray-400' };
  }
  const daysSince = Math.floor((Date.now() - lastActive.getTime()) / 86_400_000);
  if (daysSince <= 1) {
    return { label: daysSince <= 0 ? 'היום' : 'אתמול', dotColor: 'bg-green-500', textClass: 'text-green-700 font-bold' };
  }
  if (daysSince <= 7) {
    return { label: `לפני ${daysSince} ימים`, dotColor: 'bg-teal-500', textClass: 'text-teal-700' };
  }
  if (daysSince <= 29) {
    return { label: `לפני ${daysSince} ימים`, dotColor: 'bg-amber-500', textClass: 'text-amber-700' };
  }
  return { label: `סיכון נטישה · לפני ${daysSince} ימים`, dotColor: 'bg-red-500', textClass: 'text-red-700 font-bold' };
}

// ── Security badge (identity cell + detail header) ──────────────────────

/**
 * Simplified 3-state security badge (David's brief: "verified / registered
 * / guest"). Collapses the richer 4-state/method breakdown the old
 * standalone "אבטחת חשבון" column used to show (secured-by-google/phone/
 * email vs. unsecured vs. guest vs. registered) — the finer detail moves
 * into this badge's `title` tooltip instead of its own column.
 */
export function securityBadge(user: { accountStatus?: string; accountMethod?: string; isAnonymous?: boolean; email?: string }): {
  label: string;
  className: string;
  title: string;
} {
  const hasEmail = !!user.email;
  const isAnon = user.isAnonymous === true;
  const methodLabel = user.accountMethod === 'google' ? 'גוגל'
    : user.accountMethod === 'phone' ? 'טלפון'
    : user.accountMethod === 'email' ? 'אימייל' : undefined;

  if (user.accountStatus === 'secured') {
    return {
      label: 'מאומת',
      className: 'bg-green-100 text-green-700',
      title: methodLabel ? `מאומת דרך ${methodLabel}` : 'מאומת',
    };
  }
  if (isAnon && !hasEmail) {
    return { label: 'אורח', className: 'bg-gray-100 text-gray-600', title: 'משתמש אורח — ללא אימייל' };
  }
  if (hasEmail) {
    return {
      label: 'רשום',
      className: 'bg-blue-100 text-blue-700',
      title: user.accountStatus === 'unsecured' ? 'רשום, ללא גיבוי חשבון' : 'רשום',
    };
  }
  return { label: 'רשום', className: 'bg-gray-100 text-gray-500', title: 'ללא אימייל, לא אורח מפורש' };
}

// ── Effective level (list row + detail KPI/hierarchy) ───────────────────

/** Effective level: tracks (highest) > domains > globalLevel > 1.
 * `safeLevel` guards against a non-numeric currentLevel silently
 * propagating NaN through Math.max (fixed 04.10.2026 — a single corrupt
 * track/domain entry would otherwise poison classification for that user
 * across the whole page). */
function safeLevel(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function computeEffectiveLevel(progression: Record<string, unknown> | undefined): number {
  let effectiveLevel = 1;
  const tracks = progression?.tracks as Record<string, { currentLevel?: number }> | undefined;
  const domains = progression?.domains as Record<string, { currentLevel?: number }> | undefined;
  if (tracks) {
    const trackLevels = Object.values(tracks).map((t) => safeLevel(t?.currentLevel));
    effectiveLevel = Math.max(effectiveLevel, ...trackLevels);
  }
  if (domains) {
    const domainLevels = Object.values(domains).map((d) => safeLevel(d?.currentLevel));
    effectiveLevel = Math.max(effectiveLevel, ...domainLevels);
  }
  effectiveLevel = Math.max(effectiveLevel, safeLevel(progression?.globalLevel) || 1);
  return effectiveLevel;
}

// ── Program hierarchy (detail page's progression tab) ────────────────────

/**
 * Program-identity audit §06 Stage 7: resolve a Firestore program id to its
 * canonical track/domain slug BEFORE using it as a Firestore field-path key.
 * resolveToSlug is tried first (reads the real Program.slug/movementPattern
 * off Firestore via its own cache); the static map stays as a fallback for
 * a cold cache. No backfill — this only changes what NEW writes look like.
 */
export async function resolveTrackSlug(programId: string): Promise<string> {
  await ensureIdSlugMapWarm();
  const resolved = resolveToSlug(programId);
  return resolved !== programId ? resolved : (MASTER_PROGRAM_ID_TO_SLUG[programId] ?? programId);
}

/**
 * Program hierarchy (04.10.2026) — read-only אב→בן tree, self-contained
 * resolution using only an already-loaded `programs` array (no dependency
 * on program-hierarchy.utils's separate module-level cache/async warm-up —
 * this is a display-only read path, not a write path).
 *
 * DELIBERATE 2-LEVEL TREE, not 3 (David confirmed 04.10.2026 — the design
 * mockup's skill-under-domain nesting isn't backed by a real stored
 * relationship in this data model; see skill-domain-parent-nesting-backlog
 * memory / PR #118's description for the full investigation). Only
 * full_body/upper_body have a REAL static children relationship
 * (FULL_BODY_CHILD_DOMAINS/UPPER_BODY_CHILD_DOMAINS); any other master
 * (e.g. calisthenics_upper) renders its actual stored subPrograms as flat
 * direct children — domains and skills together, matching the real data.
 */
export function resolveProgramByIdOrSlug(idOrSlug: string | undefined, programs: Program[]): Program | undefined {
  if (!idOrSlug) return undefined;
  return programs.find((p) => p.id === idOrSlug || p.slug === idOrSlug || p.movementPattern === idOrSlug);
}

/** Never returns a raw id/slug as the name — a miss is explicitly flagged,
 * never silently passed through (the one hard rule for this screen). */
export function programDisplayName(idOrSlug: string, programs: Program[]): { name: string; resolved: boolean; raw: string } {
  const prog = resolveProgramByIdOrSlug(idOrSlug, programs);
  return prog?.name
    ? { name: prog.name, resolved: true, raw: idOrSlug }
    : { name: '⚠️ לא זוהה', resolved: false, raw: idOrSlug };
}

/** Checks the tracks object under every representation a key might take
 * (as given, as the resolved Program's id, slug, or movementPattern). */
export function getTrackLevel(idOrSlug: string, tracks: Record<string, { currentLevel?: number }> | undefined, programs: Program[]): number {
  if (!tracks) return 0;
  const direct = tracks[idOrSlug]?.currentLevel;
  if (typeof direct === 'number') return direct;
  const prog = resolveProgramByIdOrSlug(idOrSlug, programs);
  if (prog) {
    const byId = tracks[prog.id]?.currentLevel;
    if (typeof byId === 'number') return byId;
    if (prog.slug) {
      const bySlug = tracks[prog.slug]?.currentLevel;
      if (typeof bySlug === 'number') return bySlug;
    }
    if (prog.movementPattern) {
      const byPattern = tracks[prog.movementPattern]?.currentLevel;
      if (typeof byPattern === 'number') return byPattern;
    }
  }
  return 0;
}

export interface HierarchyNode {
  idOrSlug: string;
  name: string;
  resolved: boolean;
  level: number;
  isMaster: boolean;
  children: HierarchyNode[];
}

export function buildProgramHierarchy(fullProfile: UserFullProfile, programs: Program[]): HierarchyNode[] {
  const tracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number }> | undefined;
  const activePrograms = fullProfile.progression?.activePrograms ?? [];

  const masterIds = Array.from(
    new Set(activePrograms.map((ap: any) => ap.templateId || ap.id).filter((id: unknown): id is string => typeof id === 'string')),
  );

  return masterIds.map((masterIdOrSlug): HierarchyNode => {
    const { name, resolved } = programDisplayName(masterIdOrSlug, programs);
    const masterProg = resolveProgramByIdOrSlug(masterIdOrSlug, programs);
    const masterSlug = masterProg?.slug ?? masterProg?.movementPattern ?? masterIdOrSlug;

    let childKeys: string[];
    if (masterSlug === 'full_body') childKeys = [...FULL_BODY_CHILD_DOMAINS];
    else if (masterSlug === 'upper_body') childKeys = [...UPPER_BODY_CHILD_DOMAINS];
    else childKeys = masterProg?.subPrograms ?? [];

    const children: HierarchyNode[] = childKeys.map((childKey) => {
      const childDisplay = programDisplayName(childKey, programs);
      const childProg = resolveProgramByIdOrSlug(childKey, programs);
      return {
        idOrSlug: childKey,
        name: childDisplay.name,
        resolved: childDisplay.resolved,
        level: getTrackLevel(childKey, tracks, programs),
        isMaster: childProg?.isMaster === true,
        children: [],
      };
    });

    const MASTER_EXCLUDED: Record<string, string[]> = { full_body: ['core'] };
    const MASTER_CAP: Record<string, number> = { full_body: 15 };
    const excluded = MASTER_EXCLUDED[masterSlug] ?? [];
    const childLevels = children
      .filter((c) => !c.isMaster && !excluded.includes(c.idOrSlug))
      .map((c) => c.level)
      .filter((l) => l > 0);
    const masterLevel = childLevels.length > 0
      ? Math.min(MASTER_CAP[masterSlug] ?? Infinity, Math.round(childLevels.reduce((a, b) => a + b, 0) / childLevels.length))
      : getTrackLevel(masterIdOrSlug, tracks, programs);

    return { idOrSlug: masterIdOrSlug, name, resolved, level: masterLevel, isMaster: true, children };
  });
}

// ── Chart data bucketing (Phase B rework, 04.10.2026) ─────────────────────

export interface DailyTrendPoint {
  label: string;
  value: number;
}

/**
 * Buckets a workout list into the last `days` calendar days (today
 * inclusive), summing `valueFn` per day. Days with zero matching workouts
 * still appear with value 0 — a real "no activity" signal for the chart,
 * not a gap to drop.
 *
 * Shared by both the retention (workout count/day) and economy (coins/day)
 * trend charts so the two can't drift into different bucketing rules.
 *
 * Input is whatever workoutHistory the caller already fetched — on the
 * user-detail page that's getUserWorkoutHistory's 50-doc cap, comfortably
 * more than 14 days for any real user, but the chart is only as complete
 * as that fetch.
 */
export function bucketWorkoutsByDay<W extends { date: Date }>(
  workoutHistory: W[],
  days: number,
  valueFn: (w: W) => number,
): DailyTrendPoint[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const points: DailyTrendPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const bucketStart = new Date(today);
    bucketStart.setDate(bucketStart.getDate() - i);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketEnd.getDate() + 1);
    const value = workoutHistory
      .filter((w) => w.date.getTime() >= bucketStart.getTime() && w.date.getTime() < bucketEnd.getTime())
      .reduce((sum, w) => sum + valueFn(w), 0);
    points.push({
      label: bucketStart.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' }),
      value,
    });
  }
  return points;
}
