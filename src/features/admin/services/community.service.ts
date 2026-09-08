/**
 * Community Groups and Events Service
 * For Authority Manager Dashboard
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  deleteField,
  arrayRemove,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  increment,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { CommunityGroup, CommunityEvent, EventRegistration, PersonaKey, PERSONA_KEYS, AUDIENCE_SENSITIVE_FIELDS } from '@/types/community.types';
import { addMemberToGroupChat, createGroupChat } from '@/features/social/services/chat.service';

const GROUPS_COLLECTION = 'community_groups';
const EVENTS_COLLECTION = 'community_events';

// ── Persona-gated audience (military-persona-unified-architecture.md, §"צו כושר") ──
//
// A persona-gated group's sensitive fields (AUDIENCE_SENSITIVE_FIELDS) live
// ONLY in community_groups_{persona}/{groupId} — one document per targeted
// persona — never as a field on the public community_groups/{groupId} doc.
// Firestore rules cannot gate a single field within a document for a `list`
// query (proven empirically against the emulator, twice now in this
// project — first feed_posts, then a nested audience-subcollection +
// collectionGroup design that failed identically for a completely
// different reason: a wildcard path segment cannot be compared against
// anything inside an `allow list` rule at all — it errors for every
// caller, matching persona or not). A whole separate top-level collection
// per persona, gated by nothing but a get() on the REQUESTER's own
// military_declarations doc, is the only shape that is both correct
// (denies existence, not just fields) and functional (proven working for
// both `list` and `get`) — see firestore.rules' community_groups_reserve
// match block for the deployed rule.
//
// This is a SINGLE, atomic multi-document write for exactly the reason
// CLAUDE.md's "All-or-nothing writes" law states: a group whose sensitive
// details live in N+1 documents must never end up with some written and
// others not — that's not a partial save, it's a group with a location
// nobody can find, or a stale copy nobody deleted. A writeBatch (not a
// transaction) is correct here specifically because every write in it is
// unconditional given the caller's own input — it never needs to read
// existing state first to decide what to do (every known persona slot is
// either set-to-the-new-value or deleted, full stop) — so there is no
// concurrent-read-then-write race for a transaction to protect against.
// batch.commit() is all-or-nothing: on any failure NOTHING in the batch is
// applied, so a thrown error here can never leave an orphaned persona copy
// or a stale one behind — the caller must surface that error to the admin,
// never swallow it.
//
// createGroup/updateGroup/deleteGroup are the ONLY functions in this
// codebase permitted to write to a community_groups_{persona} collection —
// enforced by scripts/safety-check.sh (see AUTHORIZED_ROUTE_WRITERS-style
// check for 'community_groups_' prefixed collections). Do not add a second
// write path, even for a "quick fix" — that is exactly the shape of bug
// axioms.md §17 was written to prevent for social.groupIds.

function personaCollectionName(persona: PersonaKey): string {
  return `community_groups_${persona}`;
}

/**
 * Splits raw group form data into {public, sensitive} per AUDIENCE_SENSITIVE_FIELDS.
 * Pure plain-data split ONLY — no FieldValue sentinels here. cleanForFirestore
 * (below) recurses with Object.entries/spread and does not special-case
 * FieldValue instances, so a serverTimestamp()/deleteField() passed through
 * it comes out the other side as a mangled plain object ({_methodName: ...}),
 * not a real sentinel — verified empirically (deleteField().constructor
 * !== cleaned.constructor after a round-trip). Callers must clean first,
 * THEN add createdAt/updatedAt/deleteField() markers on the clean result —
 * see createGroup/updateGroup below. This matters more here than it would
 * elsewhere in this file: a mis-cleaned deleteField() on a sensitive field
 * doesn't just fail to update a timestamp, it silently leaves the OLD
 * address/schedule sitting on the public doc forever.
 *
 * targetPersonas.length === 0 (the default — every existing municipal
 * group): sensitive keys stay on publicFields completely untouched, exactly
 * today's behavior — this is NOT a no-op path to skip, it's the path every
 * existing group's save goes through, and it must not regress.
 *
 * targetPersonas.length > 0: sensitive keys are moved into sensitiveFields
 * for the persona-collection write and removed from publicFields — the
 * caller is responsible for stamping deleteField() onto the cleaned public
 * payload for each key in AUDIENCE_SENSITIVE_FIELDS afterward, so a group
 * that was ever public before being tagged doesn't keep a stale copy of
 * its own sensitive fields on the doc every reader can already see.
 */
function splitAudienceFields(
  data: Partial<CommunityGroup>,
  targetPersonas: PersonaKey[]
): { publicFields: Record<string, unknown>; sensitiveFields: Record<string, unknown> } {
  const publicFields: Record<string, unknown> = { ...data };
  const sensitiveFields: Record<string, unknown> = {};
  const gated = targetPersonas.length > 0;

  for (const key of AUDIENCE_SENSITIVE_FIELDS) {
    if (!gated) continue;
    if (key in publicFields) sensitiveFields[key] = publicFields[key];
    delete publicFields[key];
  }
  return { publicFields, sensitiveFields };
}

/**
 * Which personas currently have a copy of this group's sensitive details.
 * There is no field to read this from (deliberately — see the block comment
 * above) — existence of community_groups_{persona}/{groupId} IS the tag.
 * Bounded by PERSONA_KEYS.length reads; fine for an admin edit-form load,
 * never call this from a list screen.
 *
 * getGroup() (below) — and therefore this function — is called from BOTH
 * the admin panel AND app-facing pages (src/app/community/[id]/page.tsx).
 * For every caller who is neither an admin nor declared for a given
 * persona, that persona's getDoc is DENIED by the rule regardless of
 * whether the document exists (the rule never depends on resource.data —
 * see firestore.rules' community_groups_reserve comment), so each read
 * must be caught INDIVIDUALLY, not as one Promise.all that would reject
 * the whole call the moment any single persona doesn't match. A regular
 * user viewing an ordinary, non-gated municipal group must never see this
 * throw — permission-denied here just means "not tagged with this
 * persona", not an error.
 */
export async function getGroupAudienceTags(groupId: string): Promise<PersonaKey[]> {
  const exists = await Promise.all(
    PERSONA_KEYS.map(async (persona) => {
      try {
        const snap = await getDoc(doc(db, personaCollectionName(persona), groupId));
        return snap.exists();
      } catch {
        return false;
      }
    })
  );
  return PERSONA_KEYS.filter((_, i) => exists[i]);
}

/**
 * Fetches a group's sensitive fields for the admin edit form. Admins bypass
 * persona rules (isAdmin()), so this can read any targeted persona's copy —
 * all targeted personas are expected to hold identical sensitive content
 * (a group with two audiences is two duplicate copies, not two different
 * schedules — see the "מסמך מרכז" spec), so the first one found is enough.
 */
async function getGroupAudienceSensitiveFields(
  groupId: string,
  tags: PersonaKey[]
): Promise<Partial<CommunityGroup>> {
  for (const persona of tags) {
    try {
      const snap = await getDoc(doc(db, personaCollectionName(persona), groupId));
      if (snap.exists()) return snap.data() as Partial<CommunityGroup>;
    } catch {
      // Access changed between getGroupAudienceTags() confirming this tag
      // and this read (e.g. persona declaration just changed) — try the
      // next targeted persona rather than failing the whole group fetch.
    }
  }
  return {};
}

/**
 * The single atomic write primitive for a group's public doc + every
 * persona-collection copy of its sensitive fields. Used by create, update,
 * AND delete below — never call writeBatch against a community_groups_*
 * collection anywhere else.
 */
function applyGroupAudienceBatch(
  batch: ReturnType<typeof writeBatch>,
  groupRef: ReturnType<typeof doc>,
  publicData: Record<string, unknown> | null,
  targetPersonas: PersonaKey[],
  sensitiveData: Record<string, unknown>
): void {
  if (publicData) {
    batch.set(groupRef, publicData, { merge: true });
  } else {
    batch.delete(groupRef);
  }

  const groupId = groupRef.id;
  for (const persona of PERSONA_KEYS) {
    const ref = doc(db, personaCollectionName(persona), groupId);
    if (publicData && targetPersonas.includes(persona)) {
      batch.set(ref, { ...sensitiveData, updatedAt: serverTimestamp() }, { merge: true });
    } else {
      // Idempotent no-op when it never existed — covers both "never targeted"
      // and "targeted before, un-targeted now" in one unconditional delete.
      batch.delete(ref);
    }
  }
}

/**
 * Safely convert any timestamp-like value to a JS Date.
 * Handles: Firestore Timestamp, JS Date, serialised {seconds,nanoseconds},
 * numeric epoch-ms, and ISO strings.
 */
function toDate(timestamp: any): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp?.toDate === 'function') return timestamp.toDate();
  if (typeof timestamp === 'number') return new Date(timestamp);
  if (typeof timestamp === 'string') {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof timestamp?.seconds === 'number') {
    return new Date(timestamp.seconds * 1000);
  }
  return undefined;
}

/**
 * Normalize community group data
 */
function normalizeGroup(docId: string, data: any): CommunityGroup {
  return {
    id: docId,
    authorityId: data?.authorityId ?? '',
    name: data?.name ?? '',
    description: data?.description ?? '',
    category: data?.category ?? 'other',
    meetingLocation: data?.meetingLocation ?? undefined,
    schedule: data?.schedule ?? undefined,
    scheduleSlots: data?.scheduleSlots ?? undefined,
    maxParticipants: data?.maxParticipants ?? undefined,
    currentParticipants: data?.currentParticipants ?? 0,
    isActive: data?.isActive ?? true,
    createdBy: data?.createdBy ?? '',
    createdAt: toDate(data?.createdAt) ?? new Date(),
    updatedAt: toDate(data?.updatedAt) ?? new Date(),
    groupType: data?.groupType ?? undefined,
    scopeId: data?.scopeId ?? undefined,
    ageRestriction: data?.ageRestriction ?? undefined,
    memberCount: data?.memberCount ?? undefined,
    minimumMembers: data?.minimumMembers ?? undefined,
    isPublic: data?.isPublic ?? undefined,
    inviteCode: data?.inviteCode ?? undefined,
    targetMuscles: data?.targetMuscles ?? undefined,
    equipment: data?.equipment ?? undefined,
    price: data?.price ?? undefined,
    isOfficial: data?.isOfficial ?? false,
    // source drives tier-filtering in the feed — must be read from Firestore.
    source: data?.source ?? undefined,
    targetGender: data?.targetGender ?? undefined,
    targetAgeRange: data?.targetAgeRange ?? undefined,
    images: data?.images ?? undefined,
    rules: data?.rules ?? undefined,
    allowJoinRequests: data?.allowJoinRequests ?? undefined,
    isLocked: data?.isLocked ?? undefined,
    organizationId: data?.organizationId ?? undefined,
    requiredAccessCodeType: data?.requiredAccessCodeType ?? undefined,
    isCityOnly: data?.isCityOnly ?? false,
    restrictedNeighborhoodId: data?.restrictedNeighborhoodId ?? undefined,
    hasMeetups: data?.hasMeetups ?? undefined,
    groupSubtype: data?.groupSubtype ?? undefined,
    challengeMetric: data?.challengeMetric ?? undefined,
    startsAt: data?.startsAt ?? undefined,
    endsAt: data?.endsAt ?? undefined,
    creatorReferralCount: data?.creatorReferralCount ?? undefined,
    // 07.09.2026: these 4 were missing from this allowlist, so re-opening an
    // EXISTING, non-persona-gated group for edit silently dropped them from
    // the form on reload (found while wiring registrationLink onto the app-
    // facing card — getGroup()'s persona-gated path already re-merges these
    // from the sensitive-fields fetch, which is why this went unnoticed).
    leaderUserId: data?.leaderUserId ?? undefined,
    leaderName: data?.leaderName ?? undefined,
    phone: data?.phone ?? undefined,
    registrationLink: data?.registrationLink ?? undefined,
  };
}

/**
 * Normalize community event data
 */
function normalizeEvent(docId: string, data: any): CommunityEvent {
  return {
    id: docId,
    authorityId: data?.authorityId ?? '',
    name: data?.name ?? '',
    description: data?.description ?? '',
    category: data?.category ?? 'other',
    date: toDate(data?.date) ?? new Date(),
    startTime: data?.startTime ?? '09:00',
    endTime: data?.endTime ?? undefined,
    location: data?.location ?? { address: '', location: { lat: 0, lng: 0 } },
    registrationRequired: data?.registrationRequired ?? false,
    maxParticipants: data?.maxParticipants ?? undefined,
    currentRegistrations: data?.currentRegistrations ?? 0,
    isActive: data?.isActive ?? true,
    createdBy: data?.createdBy ?? '',
    createdAt: toDate(data?.createdAt) ?? new Date(),
    updatedAt: toDate(data?.updatedAt) ?? new Date(),
    groupType: data?.groupType ?? undefined,
    groupId: data?.groupId ?? undefined,
    ageRestriction: data?.ageRestriction ?? undefined,
    isOfficial: data?.isOfficial ?? false,
    authorityLogoUrl: data?.authorityLogoUrl ?? undefined,
    targetMuscles: data?.targetMuscles ?? undefined,
    equipment: data?.equipment ?? undefined,
    price: data?.price ?? undefined,
    specialNotice: data?.specialNotice ?? undefined,
    targetGender: data?.targetGender ?? undefined,
    targetAgeRange: data?.targetAgeRange ?? undefined,
    images: data?.images ?? undefined,
    externalLink: data?.externalLink ?? undefined,
    source: data?.source ?? undefined,
    isCityOnly: data?.isCityOnly ?? false,
    restrictedNeighborhoodId: data?.restrictedNeighborhoodId ?? undefined,
  };
}

/**
 * Upload a community image to Firebase Storage and return its download URL.
 */
export async function uploadCommunityImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('רק קבצי תמונה נתמכים');
  const MAX = 10 * 1024 * 1024; // 10 MB
  if (file.size > MAX) throw new Error('גודל הקובץ חורג מ-10MB');

  const ts = Date.now();
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
  const storagePath = `communities/${ts}-${safeName}`;
  const storageRef = ref(storage, storagePath);

  // Convert to ArrayBuffer before upload: Capacitor Android's WebView bridges
  // File/Blob objects differently from a desktop browser. Passing a raw File to
  // uploadBytes can silently produce a 0-byte upload or throw on Android.
  // Reading the bytes eagerly via arrayBuffer() gives Firebase a plain buffer
  // that serialises safely across the native bridge.
  const buffer = await file.arrayBuffer();
  await uploadBytes(storageRef, buffer, { contentType: file.type });
  return getDownloadURL(storageRef);
}

/**
 * Recursively strip `undefined` values (Firestore rejects them).
 * Replaces `undefined` with `null` for top-level keys and nested objects.
 */
function cleanForFirestore(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      result[key] = null;
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === 'object' && !Array.isArray(item) && !(item instanceof Date)
          ? cleanForFirestore(item)
          : item === undefined ? null : item,
      );
    } else if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
      result[key] = cleanForFirestore(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ==========================================
// Community Groups
// ==========================================

export async function getGroupsByAuthority(authorityId: string, tenantId?: string): Promise<CommunityGroup[]> {
  try {
    const scopeField = tenantId ? 'tenantId' : 'authorityId';
    const scopeValue = tenantId ?? authorityId;
    const q = query(
      collection(db, GROUPS_COLLECTION),
      where(scopeField, '==', scopeValue),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => normalizeGroup(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching groups:', error);
    throw error;
  }
}

/**
 * Every group in the system, regardless of authority — the "what exists
 * at all" screen David asked for (08.09.2026) after tzav-cosher's 12
 * branches turned out invisible in the per-authority list. Deliberately a
 * plain, unfiltered getDocs() at today's scale (~65 docs) — no pagination
 * infrastructure until the count actually demands it.
 *
 * audiencePersonas is populated cheaply: ONE extra read per known persona
 * collection (not per-group — community.types.ts's own getGroupAudienceTags
 * comment explicitly warns against that for a list screen), building an
 * id-set to test membership against.
 */
export async function getAllGroupsForAdmin(): Promise<CommunityGroup[]> {
  // No orderBy('updatedAt') here on purpose — Firestore's orderBy silently
  // EXCLUDES any doc missing the sorted-on field, which is exactly the
  // invisible-groups failure mode this screen exists to eliminate (found by
  // review before shipping). Every known writer stamps updatedAt today, but
  // a plain fetch + client-side sort costs nothing and doesn't depend on
  // that staying true forever.
  const [groupsSnap, personaSnapsByKey] = await Promise.all([
    getDocs(collection(db, GROUPS_COLLECTION)),
    Promise.all(PERSONA_KEYS.map((p) => getDocs(collection(db, `community_groups_${p}`)))),
  ]);

  const personaByGroupId = new Map<string, PersonaKey[]>();
  PERSONA_KEYS.forEach((persona, i) => {
    personaSnapsByKey[i].docs.forEach((d) => {
      const existing = personaByGroupId.get(d.id) ?? [];
      existing.push(persona);
      personaByGroupId.set(d.id, existing);
    });
  });

  const groups = groupsSnap.docs
    // 08.09.2026 — the one deliberate exception to this screen's own
    // "no filtering, that's the whole point" design: type:'ephemeral'
    // run-invite groups (/api/invite/run-session) aren't community groups
    // in any sense this screen is for — they're single-session artifacts,
    // 21+ of which were found cluttering this exact list. Excluded by
    // explicit request, not a silent re-introduction of the
    // invisible-groups failure mode this screen exists to catch.
    .filter((d) => d.data()?.type !== 'ephemeral')
    .map((d) => ({
      ...normalizeGroup(d.id, d.data()),
      audiencePersonas: personaByGroupId.get(d.id) ?? [],
    }));
  return groups.sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0));
}

export async function getGroup(groupId: string): Promise<CommunityGroup | null> {
  try {
    const docRef = doc(db, GROUPS_COLLECTION, groupId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    const tags = await getGroupAudienceTags(groupId);
    const sensitive = tags.length ? await getGroupAudienceSensitiveFields(groupId, tags) : {};
    return { ...normalizeGroup(docSnap.id, docSnap.data()), ...sensitive, audiencePersonas: tags };
  } catch (error) {
    console.error('Error fetching group:', error);
    throw error;
  }
}

export async function createGroup(
  data: Omit<CommunityGroup, 'id' | 'createdAt' | 'updatedAt'>,
  targetPersonas: PersonaKey[] = []
): Promise<string> {
  try {
    const { audiencePersonas: _ignored, ...rest } = data as CommunityGroup;
    const { publicFields, sensitiveFields } = splitAudienceFields(rest, targetPersonas);
    const cleanedPublic = cleanForFirestore({
      ...publicFields,
      // Ensure every group has an inviteCode so share links always work.
      inviteCode: data.inviteCode ?? generateInviteCode(),
      // Admin panel always creates authority-managed groups.
      // Enforcing here prevents any missing-source issue at the service level.
      source: 'authority',
      isOfficial: data.isOfficial ?? true,
      // The panel form has no isPublic toggle, so this field was previously
      // just absent on every admin-created group — harmless for the admin's
      // OWN dashboard (getGroupsByAuthority has no isPublic filter) but
      // fatal for app-facing discovery, which filters isPublic==true
      // (arena/services/group.service.ts's getPublicGroups/getGroupsByScopeId
      // — exactly the queries NearbyGroupsRow and the park page use). Default
      // applied on CREATE only — an existing doc's isPublic is never
      // silently flipped by an unrelated edit.
      isPublic: data.isPublic ?? true,
    });
    // FieldValue sentinels added AFTER cleanForFirestore — see splitAudienceFields'
    // comment on why cleanForFirestore must never see a serverTimestamp()/deleteField().
    cleanedPublic.createdAt = serverTimestamp();
    cleanedPublic.updatedAt = serverTimestamp();
    if (targetPersonas.length > 0) {
      for (const key of AUDIENCE_SENSITIVE_FIELDS) cleanedPublic[key] = deleteField();
    }
    const cleanedSensitive = cleanForFirestore(sensitiveFields);

    const groupRef = doc(collection(db, GROUPS_COLLECTION));
    const batch = writeBatch(db);
    applyGroupAudienceBatch(batch, groupRef, cleanedPublic, targetPersonas, cleanedSensitive);
    await batch.commit();
    return groupRef.id;
  } catch (error) {
    console.error('Error creating group:', error);
    throw error;
  }
}

export async function updateGroup(
  groupId: string,
  data: Partial<Omit<CommunityGroup, 'id' | 'createdAt' | 'updatedAt'>>,
  targetPersonas: PersonaKey[] = []
): Promise<void> {
  try {
    const { audiencePersonas: _ignored, ...rest } = data as CommunityGroup;
    const { publicFields, sensitiveFields } = splitAudienceFields(rest, targetPersonas);
    const cleanedPublic = cleanForFirestore({
      ...publicFields,
      // Re-stamp source on every admin save to repair any legacy document
      // that was missing this field.
      source: data.source ?? 'authority',
    });
    // FieldValue sentinels added AFTER cleanForFirestore — see splitAudienceFields'
    // comment on why cleanForFirestore must never see a serverTimestamp()/deleteField().
    cleanedPublic.updatedAt = serverTimestamp();
    if (targetPersonas.length > 0) {
      for (const key of AUDIENCE_SENSITIVE_FIELDS) cleanedPublic[key] = deleteField();
    }
    const cleanedSensitive = cleanForFirestore(sensitiveFields);

    const groupRef = doc(db, GROUPS_COLLECTION, groupId);
    const batch = writeBatch(db);
    applyGroupAudienceBatch(batch, groupRef, cleanedPublic, targetPersonas, cleanedSensitive);
    await batch.commit();
  } catch (error) {
    console.error('[updateGroup] FAILED for', groupId, ':', error);
    throw error;
  }
}

const DELETE_BATCH_OP_LIMIT = 500;

/**
 * Full delete contract (agreed with David, 08.09.2026, after two group
 * deletions were found to orphan member data): a group's document,
 * persona-collection copies, `members` subcollection, its
 * `chats/group_{groupId}` thread (chat.service.ts's makeGroupChatId) and
 * that thread's `messages`, and — for every member — the deleted-groupId
 * reference in `users/{uid}.social.groupIds` and `user_memberships/{uid}`.
 * The two user-doc writes mirror joinEngine.ts's exact 4b/4c write shape
 * in reverse (arrayRemove instead of arrayUnion), including its precise
 * mergeFields scoping, so a delete undoes exactly what a join wrote.
 *
 * Reads members/chat/messages BEFORE building the batch, which makes this
 * idempotent: calling it again on an already-deleted group (main doc
 * gone) still finds and cleans up any dangling members/chat/messages/user
 * references from an earlier incomplete delete — no separate repair path
 * needed.
 *
 * Firestore batches cap at 500 operations. A group needing more than that
 * (many members and/or a long chat history) is refused outright rather
 * than silently split into multiple non-atomic batches — a partial
 * multi-batch delete is exactly the "partial success = silent corruption"
 * failure mode the write rules forbid elsewhere (axioms.md §4).
 */
export async function deleteGroup(groupId: string): Promise<void> {
  try {
    const groupRef = doc(db, GROUPS_COLLECTION, groupId);

    const membersSnap = await getDocs(collection(db, GROUPS_COLLECTION, groupId, 'members'));
    const memberUids = membersSnap.docs.map((d) => d.id);

    const chatId = `group_${groupId}`;
    const chatRef = doc(db, 'chats', chatId);
    const chatSnap = await getDoc(chatRef);
    const messagesSnap = chatSnap.exists()
      ? await getDocs(collection(db, 'chats', chatId, 'messages'))
      : null;
    const messageCount = messagesSnap?.size ?? 0;

    const opCount =
      2 /* group doc + its one persona-collection copy, via applyGroupAudienceBatch */ +
      membersSnap.size /* member doc deletes */ +
      memberUids.length * 2 /* user_memberships set + users set, per member */ +
      (chatSnap.exists() ? 1 : 0) /* chat doc delete */ +
      messageCount; /* message doc deletes */

    if (opCount > DELETE_BATCH_OP_LIMIT) {
      throw new Error(
        `[deleteGroup] ${groupId} needs ${opCount} write ops (limit ${DELETE_BATCH_OP_LIMIT}) — ` +
        `refusing to split into multiple non-atomic batches. ` +
        `members=${memberUids.length}, messages=${messageCount}.`
      );
    }

    const batch = writeBatch(db);
    // publicData=null → applyGroupAudienceBatch deletes the group doc AND
    // unconditionally deletes every persona-collection copy (idempotent
    // no-op for personas that never had one).
    applyGroupAudienceBatch(batch, groupRef, null, [], {});

    for (const memberDoc of membersSnap.docs) {
      batch.delete(memberDoc.ref);
    }
    for (const uid of memberUids) {
      // Mirrors joinEngine.ts's 4b/4c write shape exactly, reversed.
      batch.set(
        doc(db, 'user_memberships', uid),
        { groupIds: arrayRemove(groupId), updatedAt: serverTimestamp() },
        { merge: true },
      );
      // batch.update(), not batch.set(..., {merge:true}) — verified by an
      // isolated synthetic-doc test (08.09.2026): setDoc/batch.set treats a
      // dotted string key like 'social.groupIds' as a LITERAL top-level
      // field name (creating a decoy field with a dot in its name) rather
      // than a nested path, so the real nested field was silently left
      // untouched. Only update()/batch.update() parses dotted keys as
      // nested paths. The nested-object + mergeFields form joinEngine.ts
      // uses for the reverse (arrayUnion) write was tried first and found
      // to wipe the entire array instead of removing one element — a real
      // user's social.groupIds was corrupted by it before this was caught.
      batch.update(doc(db, 'users', uid), {
        'social.groupIds': arrayRemove(groupId),
        updatedAt: serverTimestamp(),
      });
    }
    if (messagesSnap) {
      for (const msgDoc of messagesSnap.docs) {
        batch.delete(msgDoc.ref);
      }
    }
    if (chatSnap.exists()) {
      batch.delete(chatRef);
    }

    await batch.commit();
  } catch (error) {
    console.error('Error deleting group:', error);
    throw error;
  }
}

/**
 * One-time data migration: stamps source:'authority' on every community group
 * belonging to this authority that is missing a source field (or has source: null).
 *
 * Safe to run multiple times — skips any group that already has a source.
 * Must be called from an admin-authenticated session (Firestore rule: isAdmin()).
 *
 * Returns the number of documents that were updated.
 */
export async function migrateLegacyGroupsToAuthority(authorityId: string): Promise<number> {
  const q = query(
    collection(db, GROUPS_COLLECTION),
    where('authorityId', '==', authorityId),
  );
  const snap = await getDocs(q);

  let count = 0;
  const promises = snap.docs
    .filter((d) => !d.data().source)          // only docs without a source field
    .map(async (d) => {
      await updateDoc(doc(db, GROUPS_COLLECTION, d.id), {
        source: 'authority',
        isOfficial: d.data().isOfficial ?? true,
        updatedAt: serverTimestamp(),
      });
      count++;
    });

  await Promise.all(promises);
  return count;
}

/**
 * Get members of a group (from the members sub-collection).
 */
export async function getGroupMembers(
  groupId: string,
  maxResults = 20,
): Promise<{ uid: string; name: string; photoURL?: string; joinedAt: Date; role: 'member' | 'admin' }[]> {
  try {
    const q = query(
      collection(db, GROUPS_COLLECTION, groupId, 'members'),
      orderBy('joinedAt', 'desc'),
      firestoreLimit(maxResults),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => {
      const data = d.data();
      return {
        uid: d.id,
        name: data.name ?? 'משתמש',
        photoURL: data.photoURL ?? undefined,
        joinedAt: toDate(data.joinedAt) ?? new Date(),
        role: (data.role === 'admin' ? 'admin' : 'member') as 'member' | 'admin',
      };
    });
  } catch (error) {
    console.error('Error fetching group members:', error);
    return [];
  }
}

/**
 * Assign a coach/leader to a group (admin panel).
 * Writes leaderUserId + leaderName on the group doc and promotes the member to role='admin'.
 * Passing uid=null clears the leader fields without changing any member role.
 */
/**
 * Promotes the assigned leader to admin in the members sub-collection.
 * Does NOT write leaderUserId/leaderName to the group doc — the caller's
 * updateGroup() call already includes those fields in its own payload (they
 * come from the same form state) and is the only place permitted to decide
 * whether they land on the public doc or a persona-collection copy. This
 * function writing them directly here would silently bypass that split for
 * any audience-gated group — see updateGroup's AUDIENCE_SENSITIVE_FIELDS
 * handling in this file.
 */
export async function assignGroupLeader(
  groupId: string,
  uid: string | null,
): Promise<void> {
  if (!uid) return;
  // Promote to admin in members sub-collection (fire-and-forget; member may not exist yet)
  try {
    await updateDoc(doc(db, GROUPS_COLLECTION, groupId, 'members', uid), { role: 'admin' });
  } catch {
    // Member doc may not exist — not fatal; role will be set when they join
  }
}

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Write a fresh inviteCode to an existing group that is missing one.
 * Called lazily when the admin copies a join link for the first time.
 * Returns the newly written code.
 */
export async function generateGroupInviteCode(groupId: string): Promise<string> {
  const code = generateInviteCode();
  await updateDoc(doc(db, GROUPS_COLLECTION, groupId), { inviteCode: code });
  return code;
}

/**
 * Promote or demote a group member's role.
 * Allowed by Firestore rules for: OUT root admins (isAdmin) + existing group admins (promote only) + group owner.
 */
export async function setMemberRole(
  groupId: string,
  uid: string,
  role: 'member' | 'admin',
): Promise<void> {
  const memberRef = doc(db, GROUPS_COLLECTION, groupId, 'members', uid);
  await updateDoc(memberRef, { role });
}

/**
 * Get events linked to a specific group via groupId field.
 */
export async function getEventsByGroup(groupId: string): Promise<CommunityEvent[]> {
  try {
    const q = query(
      collection(db, EVENTS_COLLECTION),
      where('groupId', '==', groupId),
      orderBy('date', 'asc'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => normalizeEvent(d.id, d.data()));
  } catch (error) {
    console.error('Error fetching events by group:', error);
    return [];
  }
}

// ==========================================
// Community Events
// ==========================================

export async function getEventsByAuthority(authorityId: string): Promise<CommunityEvent[]> {
  try {
    const q = query(
      collection(db, EVENTS_COLLECTION),
      where('authorityId', '==', authorityId),
      orderBy('date', 'asc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => normalizeEvent(doc.id, doc.data()));
  } catch (error) {
    console.error('Error fetching events:', error);
    throw error;
  }
}

/**
 * Fetch only standalone/admin-created events (excludes auto-materialized ones).
 * Used by the Admin Events tab so virtual_materialized events only appear
 * inside their parent Group's accordion.
 */
export async function getStandaloneEventsByAuthority(authorityId: string): Promise<CommunityEvent[]> {
  try {
    const all = await getEventsByAuthority(authorityId);
    return all.filter((e) => e.source !== 'virtual_materialized');
  } catch (error) {
    console.error('Error fetching standalone events:', error);
    throw error;
  }
}

/**
 * Delete stale materialized events older than 48 hours with 0 registrations.
 * Returns the number of deleted documents.
 */
export async function cleanupStaleMaterializedEvents(authorityId: string): Promise<number> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const all = await getEventsByAuthority(authorityId);
  const stale = all.filter(
    (e) =>
      e.source === 'virtual_materialized' &&
      e.date < cutoff &&
      (e.currentRegistrations ?? 0) === 0,
  );

  let deleted = 0;
  for (const ev of stale) {
    await deleteDoc(doc(db, EVENTS_COLLECTION, ev.id));
    deleted++;
  }
  console.log(`[cleanupStaleMaterializedEvents] Deleted ${deleted} stale events for ${authorityId}`);
  return deleted;
}

export async function getEvent(eventId: string): Promise<CommunityEvent | null> {
  try {
    const docRef = doc(db, EVENTS_COLLECTION, eventId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return normalizeEvent(docSnap.id, docSnap.data());
  } catch (error) {
    console.error('Error fetching event:', error);
    throw error;
  }
}

export async function createEvent(
  data: Omit<CommunityEvent, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  try {
    const cleaned = cleanForFirestore({
      ...data,
      date: data.date instanceof Date ? Timestamp.fromDate(data.date) : data.date,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const docRef = await addDoc(collection(db, EVENTS_COLLECTION), cleaned);
    return docRef.id;
  } catch (error) {
    console.error('Error creating event:', error);
    throw error;
  }
}

export async function updateEvent(
  eventId: string,
  data: Partial<Omit<CommunityEvent, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  try {
    const updateData: any = {
      ...data,
      updatedAt: serverTimestamp(),
    };
    if (data.date instanceof Date) {
      updateData.date = Timestamp.fromDate(data.date);
    }
    const cleaned = cleanForFirestore(updateData);
    const docRef = doc(db, EVENTS_COLLECTION, eventId);
    await updateDoc(docRef, cleaned);
  } catch (error) {
    console.error('Error updating event:', error);
    throw error;
  }
}

export async function deleteEvent(eventId: string): Promise<void> {
  try {
    const docRef = doc(db, EVENTS_COLLECTION, eventId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting event:', error);
    throw error;
  }
}

// ==========================================
// Event Registration (RSVP)
// ==========================================

/**
 * Register a user for a community event.
 *
 * Each step is isolated so a permission error in one (e.g. chat)
 * never kills the others (counter, feed). Only Step 1 is critical —
 * if the registration doc write fails, the whole function throws.
 */
export async function joinEvent(
  eventId: string,
  uid: string,
  name: string,
  photoURL?: string,
): Promise<void> {
  console.log('[joinEvent] START', { eventId, uid, name });

  // ── Step 1 (CRITICAL): Write registration doc ──────────────────
  const regRef = doc(db, EVENTS_COLLECTION, eventId, 'registrations', uid);
  await setDoc(regRef, {
    uid,
    name,
    photoURL: photoURL ?? null,
    joinedAt: serverTimestamp(),
  });
  console.log('[joinEvent] ✅ Step 1 — registration doc written');

  // ── Step 2: Increment counter ──────────────────────────────────
  const eventRef = doc(db, EVENTS_COLLECTION, eventId);
  try {
    await updateDoc(eventRef, {
      currentRegistrations: increment(1),
      updatedAt: serverTimestamp(),
    });
    console.log('[joinEvent] ✅ Step 2 — counter incremented');
  } catch (counterErr) {
    console.warn('[joinEvent] ⚠️ Step 2 — counter increment failed (non-fatal):', counterErr);
  }

  // ── Step 3: Read event data for chat & feed ────────────────────
  let eventName = '';
  let isOfficial = false;
  let groupId: string | undefined;
  let authorityId: string | undefined;

  try {
    const eventSnap = await getDoc(eventRef);
    const eventData = eventSnap.data();
    eventName = eventData?.name ?? '';
    isOfficial = eventData?.isOfficial === true;
    groupId = eventData?.groupId;
    authorityId = eventData?.authorityId;
    console.log('[joinEvent] ✅ Step 3 — event data read', { eventName, isOfficial });
  } catch (readErr) {
    console.warn('[joinEvent] ⚠️ Step 3 — event read failed (non-fatal):', readErr);
  }

  // ── Step 4: Chat Auto-Sync ────────────────────────────────────
  const chatGroupId = groupId ?? eventId;
  try {
    await addMemberToGroupChat(chatGroupId, uid, name);
    console.log('[joinEvent] ✅ Step 4 — added to existing chat');
  } catch {
    try {
      await createGroupChat(chatGroupId, eventName, uid, name);
      console.log('[joinEvent] ✅ Step 4 — created new event chat');
    } catch (createErr) {
      console.warn('[joinEvent] ⚠️ Step 4 — chat sync failed (non-fatal):', createErr);
    }
  }

  // ── Step 5: Activity Feed ─────────────────────────────────────
  try {
    const feedType = isOfficial ? 'official_event_join' : 'group_join';
    const feedMessage = isOfficial
      ? `🏛️ ${name} הצטרף/ה לאירוע הרשמי "${eventName}"!`
      : `${name} נרשם/ה לאירוע "${eventName}"`;

    const feedItem = {
      type: feedType,
      fromUid: uid,
      fromName: name,
      groupId: eventId,
      groupName: eventName,
      message: feedMessage,
      createdAt: serverTimestamp(),
      read: false,
      ...(isOfficial && { isOfficial: true, authorityId: authorityId ?? '' }),
    };

    await addDoc(collection(db, 'activity', uid, 'feed'), feedItem);

    if (isOfficial && authorityId) {
      await addDoc(
        collection(db, 'activity', `city_${authorityId}`, 'feed'),
        feedItem,
      );
    }
    console.log('[joinEvent] ✅ Step 5 — activity feed written');
  } catch (feedErr) {
    console.warn('[joinEvent] ⚠️ Step 5 — feed write failed (non-fatal):', feedErr);
  }

  console.log('[joinEvent] DONE — all steps completed');
}

/**
 * Unregister a user from a community event.
 */
export async function leaveEvent(
  eventId: string,
  uid: string,
): Promise<void> {
  try {
    const regRef = doc(db, EVENTS_COLLECTION, eventId, 'registrations', uid);
    await deleteDoc(regRef);

    const eventRef = doc(db, EVENTS_COLLECTION, eventId);
    await updateDoc(eventRef, {
      currentRegistrations: increment(-1),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error leaving event:', error);
    throw error;
  }
}

/**
 * Fetch registrations for an event (for AttendeesPreview avatars).
 * Returns the most recent registrations, limited for performance.
 */
export async function getEventRegistrations(
  eventId: string,
  maxResults = 5,
): Promise<EventRegistration[]> {
  try {
    const q = query(
      collection(db, EVENTS_COLLECTION, eventId, 'registrations'),
      orderBy('joinedAt', 'desc'),
      firestoreLimit(maxResults),
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        uid: data.uid ?? d.id,
        name: data.name ?? '',
        photoURL: data.photoURL ?? undefined,
        joinedAt: toDate(data.joinedAt) ?? new Date(),
      };
    });
  } catch (error) {
    console.error('Error fetching event registrations:', error);
    return [];
  }
}

/**
 * Check if a specific user is registered for an event.
 */
export async function isUserRegistered(
  eventId: string,
  uid: string,
): Promise<boolean> {
  try {
    const regRef = doc(db, EVENTS_COLLECTION, eventId, 'registrations', uid);
    const snap = await getDoc(regRef);
    return snap.exists();
  } catch {
    return false;
  }
}

// ==========================================
// Data Cleanup Utilities
// ==========================================

/**
 * Delete all community groups and events for a given authority.
 * Call from browser console: await import('/path').then(m => m.purgeAuthorityData('sderot'))
 */
export async function purgeAuthorityData(authorityId: string): Promise<{ groups: number; events: number }> {
  let groupCount = 0;
  let eventCount = 0;

  const groupSnap = await getDocs(
    query(collection(db, GROUPS_COLLECTION), where('authorityId', '==', authorityId)),
  );
  for (const d of groupSnap.docs) {
    // deleteGroup() (not a raw deleteDoc) — atomically clears any
    // community_groups_{persona} copies too, same as a single-group delete
    // from the panel. A bulk purge is exactly where a raw deleteDoc would
    // orphan persona-collection docs silently.
    await deleteGroup(d.id);
    groupCount++;
  }

  const eventSnap = await getDocs(
    query(collection(db, EVENTS_COLLECTION), where('authorityId', '==', authorityId)),
  );
  for (const d of eventSnap.docs) {
    await deleteDoc(doc(db, EVENTS_COLLECTION, d.id));
    eventCount++;
  }

  console.log(`✅ Purged ${groupCount} groups + ${eventCount} events for authority "${authorityId}"`);
  return { groups: groupCount, events: eventCount };
}

/**
 * Delete ALL community groups and events across the entire system.
 * Use with caution — intended for wiping ghost/mock data before seeding fresh.
 */
export async function purgeAllCommunityData(): Promise<{ groups: number; events: number }> {
  let groupCount = 0;
  let eventCount = 0;

  const groupSnap = await getDocs(collection(db, GROUPS_COLLECTION));
  for (const d of groupSnap.docs) {
    // deleteGroup() (not a raw deleteDoc) — see purgeAuthorityData's comment.
    await deleteGroup(d.id);
    groupCount++;
  }

  const eventSnap = await getDocs(collection(db, EVENTS_COLLECTION));
  for (const d of eventSnap.docs) {
    await deleteDoc(doc(db, EVENTS_COLLECTION, d.id));
    eventCount++;
  }

  console.log(`✅ Purged ALL community data: ${groupCount} groups + ${eventCount} events`);
  return { groups: groupCount, events: eventCount };
}

// ==========================================
// Virtual Session Materialization
// ==========================================

/**
 * Materializes a recurring/virtual group schedule slot into a real
 * community_events document and registers the joining user.
 *
 * Called when a user taps "Join" on a session that exists only as a
 * virtual slot (sourced from a community_groups scheduleSlot).
 *
 * Returns the newly created eventId.
 */
export async function materializeVirtualSession(
  groupId: string,
  date: string,
  time: string,
  uid: string,
  displayName: string,
  photoURL?: string,
): Promise<string> {
  console.log('[materializeVirtualSession] START', { groupId, date, time, uid });

  const groupSnap = await getDoc(doc(db, GROUPS_COLLECTION, groupId));
  if (!groupSnap.exists()) throw new Error('Group not found');
  const group = groupSnap.data();

  const eventDate = new Date(`${date}T${time}:00`);

  const eventData: Record<string, unknown> = {
    authorityId: group.authorityId ?? '',
    name: group.name ?? 'מפגש קבוצתי',
    description: group.description ?? '',
    category: 'community_meetup',
    date: Timestamp.fromDate(eventDate),
    startTime: time,
    location: {
      parkId: group.meetingLocation?.parkId ?? null,
      routeId: group.meetingLocation?.routeId ?? null,
      address: group.meetingLocation?.address ?? '',
      location: group.meetingLocation?.location ?? { lat: 0, lng: 0 },
    },
    registrationRequired: false,
    maxParticipants: group.maxParticipants ?? null,
    currentRegistrations: 1,
    isActive: true,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    groupId,
    isOfficial: group.isOfficial ?? false,
    source: 'virtual_materialized',
  };

  const cleaned = cleanForFirestore(eventData);
  const docRef = await addDoc(collection(db, EVENTS_COLLECTION), cleaned);
  console.log('[materializeVirtualSession] ✅ Event created:', docRef.id);

  const regRef = doc(db, EVENTS_COLLECTION, docRef.id, 'registrations', uid);
  await setDoc(regRef, {
    uid,
    name: displayName,
    photoURL: photoURL ?? null,
    joinedAt: serverTimestamp(),
  });
  console.log('[materializeVirtualSession] ✅ User registered');

  return docRef.id;
}
