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
import { CommunityGroup, CommunityEvent, EventRegistration } from '@/types/community.types';
import { addMemberToGroupChat, createGroupChat } from '@/features/social/services/chat.service';

const GROUPS_COLLECTION = 'community_groups';
const EVENTS_COLLECTION = 'community_events';

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
    isCityOnly: data?.isCityOnly ?? false,
    restrictedNeighborhoodId: data?.restrictedNeighborhoodId ?? undefined,
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
  await uploadBytes(storageRef, file, { contentType: file.type });
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

export async function getGroup(groupId: string): Promise<CommunityGroup | null> {
  try {
    const docRef = doc(db, GROUPS_COLLECTION, groupId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return null;
    return normalizeGroup(docSnap.id, docSnap.data());
  } catch (error) {
    console.error('Error fetching group:', error);
    throw error;
  }
}

export async function createGroup(
  data: Omit<CommunityGroup, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  try {
    const cleaned = cleanForFirestore({
      ...data,
      // Admin panel always creates authority-managed groups.
      // Enforcing here prevents any missing-source issue at the service level.
      source: 'authority',
      isOfficial: data.isOfficial ?? true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    const docRef = await addDoc(collection(db, GROUPS_COLLECTION), cleaned);
    return docRef.id;
  } catch (error) {
    console.error('Error creating group:', error);
    throw error;
  }
}

export async function updateGroup(
  groupId: string,
  data: Partial<Omit<CommunityGroup, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  try {
    const cleaned = cleanForFirestore({
      ...data,
      // Re-stamp source on every admin save to repair any legacy document
      // that was missing this field.
      source: data.source ?? 'authority',
      updatedAt: serverTimestamp(),
    });
    const docRef = doc(db, GROUPS_COLLECTION, groupId);
    await updateDoc(docRef, cleaned);
  } catch (error) {
    console.error('[updateGroup] FAILED for', groupId, ':', error);
    throw error;
  }
}

export async function deleteGroup(groupId: string): Promise<void> {
  try {
    const docRef = doc(db, GROUPS_COLLECTION, groupId);
    await deleteDoc(docRef);
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
): Promise<{ uid: string; name: string; photoURL?: string; joinedAt: Date }[]> {
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
      };
    });
  } catch (error) {
    console.error('Error fetching group members:', error);
    return [];
  }
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
    await deleteDoc(doc(db, GROUPS_COLLECTION, d.id));
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
    await deleteDoc(doc(db, GROUPS_COLLECTION, d.id));
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
