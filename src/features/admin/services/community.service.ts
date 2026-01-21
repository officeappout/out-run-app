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
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { CommunityGroup, CommunityEvent } from '@/types/community.types';

const GROUPS_COLLECTION = 'community_groups';
const EVENTS_COLLECTION = 'community_events';

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
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
    maxParticipants: data?.maxParticipants ?? undefined,
    currentParticipants: data?.currentParticipants ?? 0,
    isActive: data?.isActive ?? true,
    createdBy: data?.createdBy ?? '',
    createdAt: toDate(data?.createdAt) ?? new Date(),
    updatedAt: toDate(data?.updatedAt) ?? new Date(),
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
  };
}

// ==========================================
// Community Groups
// ==========================================

export async function getGroupsByAuthority(authorityId: string): Promise<CommunityGroup[]> {
  try {
    const q = query(
      collection(db, GROUPS_COLLECTION),
      where('authorityId', '==', authorityId),
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
    const docRef = await addDoc(collection(db, GROUPS_COLLECTION), {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
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
    const docRef = doc(db, GROUPS_COLLECTION, groupId);
    await updateDoc(docRef, {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error updating group:', error);
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
    const docRef = await addDoc(collection(db, EVENTS_COLLECTION), {
      ...data,
      date: data.date instanceof Date ? Timestamp.fromDate(data.date) : data.date,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
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
    const docRef = doc(db, EVENTS_COLLECTION, eventId);
    const updateData: any = {
      ...data,
      updatedAt: serverTimestamp(),
    };
    
    if (data.date instanceof Date) {
      updateData.date = Timestamp.fromDate(data.date);
    }
    
    await updateDoc(docRef, updateData);
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
