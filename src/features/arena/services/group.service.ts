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
  serverTimestamp,
  Timestamp,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { CommunityGroup, CommunityGroupType } from '@/types/community.types';
import {
  createGroupChat,
  addMemberToGroupChat,
  removeMemberFromGroupChat,
} from '@/features/social/services/chat.service';

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
  meetingLocation?: CommunityGroup['meetingLocation'];
  ageRestriction?: 'minor' | 'adult' | 'all';
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
    meetingLocation: input.meetingLocation ?? null,

    currentParticipants: 1,
    memberCount: 1,
    minimumMembers,
    isActive: minimumMembers <= 1,
    inviteCode: input.isPublic ? null : generateInviteCode(),

    createdBy: creatorUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const groupRef = await addDoc(groupsRef, newGroup);
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

export async function joinGroup(
  groupId: string,
  uid: string,
  name: string,
): Promise<void> {
  await setDoc(doc(db, 'community_groups', groupId, 'members', uid), {
    uid,
    name,
    joinedAt: serverTimestamp(),
    role: 'member',
  });

  await updateDoc(doc(db, 'users', uid), {
    'social.groupIds': arrayUnion(groupId),
  });

  await addMemberToGroupChat(groupId, uid, name);
}

// ─── leaveGroup ───────────────────────────────────────────────────────────────

export async function leaveGroup(groupId: string, uid: string): Promise<void> {
  await deleteDoc(doc(db, 'community_groups', groupId, 'members', uid));

  await updateDoc(doc(db, 'users', uid), {
    'social.groupIds': arrayRemove(groupId),
  });

  await removeMemberFromGroupChat(groupId, uid);
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
