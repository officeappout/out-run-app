/**
 * onPlannedActivityCreated — Phase 3 of the social-activities build plan
 * (.claude/plans/new-chat-investigation-stateful-fern.md), Foundation B.
 *
 * Trigger: onCreate planned_sessions/{sessionId}
 *
 * Modeled directly on onGroupMemberJoin.ts (the most complete existing
 * event-driven push dispatcher) — same shape: fetch context, resolve
 * recipients, send targeted pushes, log results per recipient group.
 *
 * TWO RECIPIENT AXES, merged and deduped, notified ONCE each:
 *
 *  1. PARTNERS axis (zero new schema) — connections/{creatorUid}.followers.
 *     People who follow the creator, regardless of distance.
 *
 *  2. RADIUS axis (genuinely new infra — see userLocations/{uid}, written
 *     client-side by useUserLocationSync) — geohashQueryBounds over
 *     userLocations within 3km of the activity's lat/lng. Only reached when
 *     the session is public (verified_global); a squad-only announcement
 *     must not surface to strangers.
 *
 * VISIBILITY GATE (session.privacyMode):
 *   verified_global (public)  → BOTH axes (a public post is visible to
 *                                everyone, partners included).
 *   squad (partners-only)     → PARTNERS axis only, no radius query.
 *   ghost                     → no recipients at all. Not reachable from the
 *                                v1 compose UI today (which only exposes
 *                                public/partners), handled defensively.
 *
 * PRECEDENCE / DEDUPE: recipients are merged into a single Set keyed by uid
 * before sending — a uid that is both a nearby stranger AND a follower
 * collapses to one entry and receives exactly one push. There is no
 * axis-specific copy variant; the same selected message serves both cases
 * (per the plan's "light filtering, don't over-engineer" v1 scope).
 *
 * CHANNEL: 'community' — reserved but previously unused (its own doc
 * comment in push.service.ts already says "people nearby, new group").
 *
 * DEEP LINK: '/map' with parkId/routeId riding along as decoration in
 * `data`, same pattern as the pre-existing training-reminder push's
 * deepLink:'/' + undecoded data fields — no client-side query-param
 * consumer exists yet for a specific park/route screen (confirmed: no
 * `openPark`/`openRoute` handling anywhere in src/app/map), and building
 * one is out of this task's scope (backend/function only). Flagged here,
 * not silently left as if it were fully wired.
 *
 * FLAG: app_config/feature_flags.socialActivityNearbyPushEnabled, same
 * doc/pattern as stepGoalNudgeScheduler.ts's socialActivityNearbyPushEnabled-
 * style master flag. Default false/absent — this function is a no-op until
 * explicitly flipped.
 */

import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import { geohashQueryBounds, distanceBetween } from 'geofire-common';
import { sendPush } from './services/push.service';
import { selectNotificationContent, personaliseNotificationText } from './services/notification-content.service';
import { resolveCanonicalPersona, type PersonaResolvableProfile } from './services/persona-alias-map.service';

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

const FEATURE_FLAGS_DOC = 'app_config/feature_flags';
const RADIUS_METERS = 3000;
const TRIGGER_TYPE = 'Future_Partner_Plan';
const CHANNEL = 'community';
// Judgment call, not empirically grounded (flagged, not silently assumed):
// short enough that a "someone's training near you" push stays timely, long
// enough that a burst of nearby session creates doesn't spam one recipient.
// Revisit once there's real send volume to look at.
const RATE_CAP_HOURS = 2;

// ─── Local mirrors (Admin SDK doesn't import src/ — see
// persona-alias-map.service.ts's header for the established convention) ───

interface PlannedSessionDoc {
  userId?: string;
  displayName?: string;
  parkId?: string;
  parkName?: string;
  routeId?: string;
  routeName?: string;
  activityType?: string; // ActivityType: 'running'|'walking'|'cycling'|'workout'
  privacyMode?: string; // PrivacyMode: 'ghost'|'squad'|'verified_global'
  lat?: number | null;
  lng?: number | null;
  geohash?: string;
}

// PlannedSession's ActivityType ('workout'|'running'|'walking'|'cycling') →
// the notification library's DailyGoalActivityType-shaped field
// ('strength'|'running'|'walking') — same field, reused beyond its original
// Daily_Goal-only doc comment (selectNotificationContent's activityType
// filter is a plain exact-match, agnostic to triggerType). 'cycling' has no
// bucket — omitted (undefined) rather than guessed, since selecting without
// an activityType filter is a safe, valid fallback (matches any/untagged
// copy) whereas guessing a bucket is not.
function toLibraryActivityType(activityType: string | undefined): string | undefined {
  if (activityType === 'workout') return 'strength';
  if (activityType === 'running' || activityType === 'walking') return activityType;
  return undefined;
}

/**
 * Radius axis — userLocations/{uid} within RADIUS_METERS of (lat, lng),
 * excluding excludeUid. geohashQueryBounds over-fetches at the box edges by
 * design (that's the point of a bounding-box prefilter); distanceBetween
 * does the real-circle filter after fetch, same two-step pattern
 * route-adjacency.service.ts's findCandidatePairsByGeohash already uses for
 * an in-memory prefilter — here applied to a live Firestore query instead.
 */
async function findNearbyUserIds(
  lat: number,
  lng: number,
  excludeUid: string,
): Promise<string[]> {
  const center: [number, number] = [lat, lng];
  const bounds = geohashQueryBounds(center, RADIUS_METERS);
  const uids = new Set<string>();

  try {
    const snapshots = await Promise.all(
      bounds.map(([start, end]) =>
        db
          .collection('userLocations')
          .orderBy('geohash')
          .startAt(start)
          .endAt(end)
          .get(),
      ),
    );

    for (const snap of snapshots) {
      for (const doc of snap.docs) {
        const uid = doc.id;
        if (uid === excludeUid) continue;
        const data = doc.data() as { lat?: number; lng?: number };
        if (typeof data.lat !== 'number' || typeof data.lng !== 'number') continue;
        const distanceKm = distanceBetween(center, [data.lat, data.lng]);
        if (distanceKm * 1000 <= RADIUS_METERS) uids.add(uid);
      }
    }
  } catch (err) {
    logger.warn('[onPlannedActivityCreated] userLocations radius query failed', err);
  }

  return Array.from(uids);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export const onPlannedActivityCreated = onDocumentCreated(
  {
    document: 'planned_sessions/{sessionId}',
    region: 'us-central1',
    timeoutSeconds: 60,
    memory: '256MiB',
  },
  async (event) => {
    const { sessionId } = event.params;

    // ── Flag gate — fail closed (abort) on a read error, same posture as
    // stepGoalNudgeScheduler.ts: a broken flag read must not silently let a
    // not-yet-approved feature start sending. ────────────────────────────
    let flagsData: Record<string, unknown> = {};
    try {
      const flagsSnap = await db.doc(FEATURE_FLAGS_DOC).get();
      flagsData = flagsSnap.exists ? (flagsSnap.data() as Record<string, unknown>) : {};
    } catch (err) {
      logger.error('[onPlannedActivityCreated] feature_flags read failed, aborting', err);
      return;
    }
    if (flagsData.socialActivityNearbyPushEnabled !== true) {
      logger.info(
        `[onPlannedActivityCreated] session=${sessionId} — socialActivityNearbyPushEnabled !== true, skipping`,
      );
      return;
    }

    const session = event.data?.data() as PlannedSessionDoc | undefined;
    if (!session) return;

    const creatorUid = session.userId;
    if (!creatorUid) {
      logger.warn(`[onPlannedActivityCreated] session=${sessionId} — no userId, skipping`);
      return;
    }

    const privacyMode = session.privacyMode ?? 'squad';
    if (privacyMode === 'ghost') {
      logger.info(`[onPlannedActivityCreated] session=${sessionId} — privacyMode=ghost, 0 recipients`);
      return;
    }

    // ── Partners axis (zero new schema) — every non-ghost session reaches
    // its creator's own followers, public or partners-only alike. ────────
    let partnerUids: string[] = [];
    try {
      const connSnap = await db.doc(`connections/${creatorUid}`).get();
      const followers = connSnap.exists ? connSnap.data()?.followers : undefined;
      partnerUids = Array.isArray(followers)
        ? followers.filter((v): v is string => typeof v === 'string' && v.length > 0)
        : [];
    } catch (err) {
      logger.warn('[onPlannedActivityCreated] connections read failed', err);
    }

    // ── Radius axis — public sessions only. ───────────────────────────────
    let nearbyUids: string[] = [];
    if (
      privacyMode === 'verified_global' &&
      typeof session.lat === 'number' &&
      typeof session.lng === 'number'
    ) {
      nearbyUids = await findNearbyUserIds(session.lat, session.lng, creatorUid);
    }

    // ── Merge + dedupe, exclude creator. A Set is the entire "precedence"
    // rule — membership in one or both axes collapses to a single send. ──
    const recipients = new Set<string>();
    for (const uid of partnerUids) if (uid !== creatorUid) recipients.add(uid);
    for (const uid of nearbyUids) if (uid !== creatorUid) recipients.add(uid);

    if (recipients.size === 0) {
      logger.info(
        `[onPlannedActivityCreated] session=${sessionId} creator=${creatorUid} — 0 recipients ` +
          `(partners=${partnerUids.length} nearby=${nearbyUids.length})`,
      );
      return;
    }

    const libraryActivityType = toLibraryActivityType(session.activityType);
    const deepLink = '/map';
    const baseData: Record<string, string> = {
      triggerType: TRIGGER_TYPE,
      sessionId,
      ...(session.parkId ? { parkId: session.parkId } : {}),
      ...(session.routeId ? { routeId: session.routeId } : {}),
    };

    // ── Per recipient: persona → content → send. Sequential (not
    // Promise.all) — v1 scale is small ("very few users right now" per the
    // plan), and sendPush's own per-call Firestore reads (prefs, rate cap,
    // tokens) make unbounded concurrency here more costly than useful. ───
    let sent = 0;
    let noContent = 0;
    let failed = 0;

    for (const uid of Array.from(recipients)) {
      try {
        const userSnap = await db.collection('users').doc(uid).get();
        if (!userSnap.exists) continue;
        const userData = userSnap.data() as Record<string, unknown>;

        const persona = resolveCanonicalPersona(userData as PersonaResolvableProfile);
        const selected = await selectNotificationContent({
          triggerType: TRIGGER_TYPE,
          persona,
          activityType: libraryActivityType,
          uid,
        });

        if (!selected) {
          noContent++;
          continue;
        }

        const recipientName =
          (userData?.core as Record<string, unknown> | undefined)?.name;
        const body = personaliseNotificationText(selected.text, {
          name: typeof recipientName === 'string' ? recipientName : undefined,
          creatorName: session.displayName,
          placeName: session.parkName ?? session.routeName,
        });

        const result = await sendPush({
          toUids: [uid],
          channel: CHANNEL,
          title: 'מישהו מתאמן לידך',
          body,
          deepLink,
          data: { ...baseData, messageDocId: selected.docId },
          rateCapHours: RATE_CAP_HOURS,
          measurement: {
            variantId: selected.bundleId,
            category: TRIGGER_TYPE,
            persona,
            activityType: libraryActivityType,
            framing: selected.psychologicalTrigger,
          },
        });

        if (result.delivered > 0) sent++;
        else failed++;
      } catch (err) {
        failed++;
        logger.error(`[onPlannedActivityCreated] send failed uid=${uid}`, err);
      }
    }

    logger.info(
      `[onPlannedActivityCreated] session=${sessionId} creator=${creatorUid} done — ` +
        `recipients=${recipients.size} sent=${sent} noContent=${noContent} failed=${failed}`,
    );
  },
);
