/**
 * Pillar 3 — Group Service
 *
 * Handles all Firestore writes for community group lifecycle:
 *   createGroup, joinGroup, leaveGroup, getMyGroups
 *
 * Firestore paths:
 *   community_groups/{groupId}
 *   community_groups/{groupId}/members/{uid}
 *   users/{uid}  (social.groupIds array)
 */

import {
  doc,
  collection,
  addDoc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  increment,
  serverTimestamp,
  Timestamp,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CommunityGroup, CommunityGroupType, GroupMember } from '@/types/community.types';
import {
  createGroupChat,
  addMemberToGroupChat,
  removeMemberFromGroupChat,
} from '@/features/social/services/chat.service';
import {
  addCommunitySessionsToPlanner,
  removeCommunitySessionsFromPlanner,
} from '@/features/user/scheduling/services/communitySchedule.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateGroupInput {
  name: string;
  description: string;
  category: CommunityGroup['category'];
  groupType: CommunityGroupType;
  scopeId: string;
  authorityId: string;
  isPublic: boolean;
  schedule?: CommunityGroup['schedule'];
  scheduleSlots?: CommunityGroup['scheduleSlots'];
  meetingLocation?: CommunityGroup['meetingLocation'];
  ageRestriction?: 'minor' | 'adult' | 'all';
  rules?: string;
  images?: string[];
  /** Origin tier: 'user' for wizard-created groups, 'authority' for admin panel */
  source?: CommunityGroup['source'];
  isOfficial?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function tsToDate(ts: unknown): Date {
  if (ts instanceof Timestamp) return ts.toDate();
  if (ts instanceof Date) return ts;
  return new Date();
}

/**
 * Recursively removes keys whose value is `undefined` from a plain object.
 * Firestore's addDoc / setDoc / updateDoc reject any payload that contains
 * `undefined` — including values nested inside sub-objects.
 */
function stripUndefined<T extends object>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      out[key] = stripUndefined(val as object);
    } else {
      out[key] = val;
    }
  }
  return out as T;
}

// ─── createGroup ─────────────────────────────────────────────────────────────

/**
 * Creates a new community group, writes the creator as the first member,
 * and initializes a group chat thread in the chats collection.
 *
 * Returns the new group's Firestore document ID.
 */
export async function createGroup(
  creatorUid: string,
  creatorName: string,
  input: CreateGroupInput,
): Promise<string> {
  const groupsRef = collection(db, 'community_groups');

  const minimumMembers = 1;

  const newGroup = {
    authorityId: input.authorityId,
    name: input.name,
    description: input.description,
    category: input.category,
    groupType: input.groupType,
    scopeId: input.scopeId,
    isPublic: input.isPublic,
    ageRestriction: input.ageRestriction ?? 'all',
    schedule: input.schedule ?? null,
    scheduleSlots: input.scheduleSlots ?? [],
    meetingLocation: input.meetingLocation ?? null,
    rules: input.rules ?? null,
    images: input.images ?? [],
    source: input.source ?? 'authority',
    isOfficial: input.isOfficial ?? false,

    currentParticipants: 1,
    memberCount: 1,
    minimumMembers,
    isActive: minimumMembers <= 1,
    // Always generate an invite code so share links work for all groups
    inviteCode: generateInviteCode(),

    createdBy: creatorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const groupRef = await addDoc(groupsRef, stripUndefined(newGroup));
  const groupId = groupRef.id;

  // Write creator as admin member in sub-collection
  await setDoc(doc(db, 'community_groups', groupId, 'members', creatorUid), {
    uid: creatorUid,
    name: creatorName,
    joinedAt: serverTimestamp(),
    role: 'admin',
  });

  // Mirror groupId in user's social.groupIds array
  await updateDoc(doc(db, 'users', creatorUid), {
    'social.groupIds': arrayUnion(groupId),
  });

  // Auto-create group chat thread so it appears in Messages/Inbox
  await createGroupChat(groupId, input.name, creatorUid, creatorName);

  return groupId;
}

// ─── joinGroup ────────────────────────────────────────────────────────────────

export interface JoinGroupOptions {
  addToPlanner?: boolean;
}

export async function joinGroup(
  groupId: string,
  uid: string,
  name: string,
  options?: JoinGroupOptions,
): Promise<void> {
  // Step 1 (critical): write member document
  await setDoc(doc(db, 'community_groups', groupId, 'members', uid), {
    uid,
    name,
    joinedAt: serverTimestamp(),
    role: 'member',
  });

  // Step 2 (critical): mirror groupId in user's social.groupIds
  await updateDoc(doc(db, 'users', uid), {
    'social.groupIds': arrayUnion(groupId),
  });

  // Step 3 (non-fatal): increment member counters on the group document
  try {
    await updateDoc(doc(db, 'community_groups', groupId), {
      memberCount: increment(1),
      currentParticipants: increment(1),
      updatedAt: serverTimestamp(),
    });
  } catch (countErr) {
    console.warn('[joinGroup] memberCount increment failed (non-fatal):', countErr);
  }

  // Step 4 (non-fatal): sync to group chat — self-healing, never blocks join
  try {
    await addMemberToGroupChat(groupId, uid, name);
  } catch {
    try {
      const groupSnap = await getDoc(doc(db, 'community_groups', groupId));
      const groupName = groupSnap.data()?.name ?? groupId;
      await createGroupChat(groupId, groupName, uid, name);
    } catch (createErr) {
      console.warn('[joinGroup] chat creation also failed (non-fatal):', createErr);
    }
  }

  // Step 5 (non-fatal): populate Training Planner with community sessions
  if (options?.addToPlanner !== false) {
    try {
      const groupSnap = await getDoc(doc(db, 'community_groups', groupId));
      const data = groupSnap.data();
      const slots = data?.scheduleSlots ?? (data?.schedule ? [data.schedule] : []);
      if (slots.length > 0) {
        await addCommunitySessionsToPlanner(
          uid,
          groupId,
          data?.name ?? groupId,
          data?.category ?? 'other',
          slots,
        );
      }
    } catch (planErr) {
      console.warn('[joinGroup] planner sync failed (non-fatal):', planErr);
    }
  }
}

// ─── leaveGroup ───────────────────────────────────────────────────────────────

export async function leaveGroup(groupId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, 'community_groups', groupId, 'members', uid));

  await updateDoc(doc(db, 'users', uid), {
    'social.groupIds': arrayRemove(groupId),
  });

  try {
    await removeMemberFromGroupChat(groupId, uid);
  } catch {
    console.warn('[leaveGroup] chat removal failed (non-fatal)');
  }

  // Clean up Training Planner — remove community sessions for this group
  try {
    const groupSnap = await getDoc(doc(db, 'community_groups', groupId));
    const data = groupSnap.data();
    const slots = data?.scheduleSlots ?? (data?.schedule ? [data.schedule] : []);
    if (slots.length > 0) {
      await removeCommunitySessionsFromPlanner(uid, groupId, slots);
    }
  } catch (planErr) {
    console.warn('[leaveGroup] planner cleanup failed (non-fatal):', planErr);
  }
}

// ─── getMyGroups ──────────────────────────────────────────────────────────────

/**
 * Fetches the full group documents for a user's joined groups.
 * Uses the denormalized social.groupIds array for fast lookup (no sub-collection query).
 */
export async function getMyGroups(groupIds: string[]): Promise<CommunityGroup[]> {
  if (!groupIds.length) return [];

  const results = await Promise.all(
    groupIds.map((id) => getDoc(doc(db, 'community_groups', id))),
  );

  return results
    .filter((snap) => snap.exists())
    .map((snap) => ({
      id: snap.id,
      ...(snap.data() as Omit<CommunityGroup, 'id' | 'createdAt' | 'updatedAt'>),
      createdAt: tsToDate(snap.data()?.createdAt),
      updatedAt: tsToDate(snap.data()?.updatedAt),
    }));
}

// ─── getGroupsByScopeId ───────────────────────────────────────────────────────

/**
 * Returns public, active groups for a given scopeId (city, org, or park).
 * Used in the League Discover section.
 */
// ─── getGroupMembers ──────────────────────────────────────────────────────────

/**
 * Fetches the full member list from the community_groups/{groupId}/members subcollection.
 * Used by the group drawer to display 'חברי הקהילה' and enable creator moderation.
 */
export async function getGroupMembers(groupId: string): Promise<GroupMember[]> {
  const colRef = collection(db, 'community_groups', groupId, 'members');
  const snap = await getDocs(colRef);
  return snap.docs.map((d) => ({
    uid: d.id,
    name: d.data().name ?? 'משתמש',
    role: d.data().role ?? 'member',
    joinedAt: tsToDate(d.data().joinedAt),
  }));
}

// ─── getGroupById ─────────────────────────────────────────────────────────────

/**
 * Fetches a single community group document by its ID.
 * Used by the edit wizard to pre-fill form fields.
 */
export async function getGroupById(groupId: string): Promise<CommunityGroup | null> {
  const snap = await getDoc(doc(db, 'community_groups', groupId));
  if (!snap.exists()) return null;
  return {
    id: snap.id,
    ...(snap.data() as Omit<CommunityGroup, 'id' | 'createdAt' | 'updatedAt'>),
    createdAt: tsToDate(snap.data()?.createdAt),
    updatedAt: tsToDate(snap.data()?.updatedAt),
  };
}

// ─── updateGroup ──────────────────────────────────────────────────────────────

export interface UpdateGroupInput {
  name?: string;
  description?: string;
  category?: CommunityGroup['category'];
  scheduleSlots?: CommunityGroup['scheduleSlots'];
  meetingLocation?: CommunityGroup['meetingLocation'];
  isPublic?: boolean;
  rules?: string | null;
  images?: string[];
}

/**
 * Updates editable fields of a community group document.
 * Called by the wizard in Edit Mode after the creator saves changes.
 * Firestore rule: only the creator (createdBy === auth.uid) can write.
 */
export async function updateGroup(
  groupId: string,
  input: UpdateGroupInput,
): Promise<void> {
  const ref = doc(db, 'community_groups', groupId);
  await updateDoc(ref, stripUndefined({
    ...input,
    updatedAt: serverTimestamp(),
  }));
}

// ─── updateGroupLocation ──────────────────────────────────────────────────────

/**
 * Patches only the meetingLocation.location field on a community group.
 * Used by the creator to fix incorrect coordinates saved at creation time.
 * Firestore rule: creator (resource.data.createdBy === auth.uid) can update.
 */
export async function updateGroupLocation(
  groupId: string,
  coords: { lat: number; lng: number },
): Promise<void> {
  const ref = doc(db, 'community_groups', groupId);
  await updateDoc(ref, {
    'meetingLocation.location': coords,
    updatedAt: serverTimestamp(),
  });
}

export async function getGroupsByScopeId(scopeId: string): Promise<CommunityGroup[]> {
  const q = query(
    collection(db, 'community_groups'),
    where('scopeId', '==', scopeId),
    where('isActive', '==', true),
    where('isPublic', '==', true),
    orderBy('createdAt', 'desc'),
  );

  const snap = await getDocs(q);
  return snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<CommunityGroup, 'id' | 'createdAt' | 'updatedAt'>),
    createdAt: tsToDate(d.data().createdAt),
    updatedAt: tsToDate(d.data().updatedAt),
  }));
}

/**
 * Looks up a community group by its invite code.
 * Used by the /join/[inviteCode] deep-link landing page.
 * Returns null if the code is invalid or the group no longer exists.
 */
export async function getGroupByInviteCode(inviteCode: string): Promise<CommunityGroup | null> {
  const q = query(
    collection(db, 'community_groups'),
    where('inviteCode', '==', inviteCode),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return {
    id: d.id,
    ...(d.data() as Omit<CommunityGroup, 'id' | 'createdAt' | 'updatedAt'>),
    createdAt: tsToDate(d.data().createdAt),
    updatedAt: tsToDate(d.data().updatedAt),
  };
}
