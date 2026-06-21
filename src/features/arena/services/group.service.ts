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
import { useUserStore } from '@/features/user/identity/store/useUserStore';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateGroupInput {
  name: string;
  description: string;
  category: CommunityGroup['category'];
  groupType: CommunityGroupType;
  /** null for social groups (friends/family) that are not city-scoped */
  scopeId: string | null;
  /** Omitted for social groups that are not bound to any authority */
  authorityId?: string;
  isPublic: boolean;
  /** When true, non-members may submit a join request (ignored when isPublic is true) */
  allowJoinRequests?: boolean;
  schedule?: CommunityGroup['schedule'];
  scheduleSlots?: CommunityGroup['scheduleSlots'];
  meetingLocation?: CommunityGroup['meetingLocation'];
  ageRestriction?: 'minor' | 'adult' | 'all';
  rules?: string;
  images?: string[];
  /** Origin tier: 'user' for wizard-created groups, 'authority' for admin panel */
  source?: CommunityGroup['source'];
  isOfficial?: boolean;
  /** true = scheduled meetups; false = league/competition (no session banners) */
  hasMeetups?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateInviteCode(): string {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Institutional group types are access-code gated: the group is locked
 * (`isLocked: true`) and members unlock it with a code managed by the
 * authority/admin. Social (friends/family) and geographic (neighborhood/park)
 * groups are never locked.
 */
const INSTITUTIONAL_GROUP_TYPES = new Set<CommunityGroupType>([
  'school',
  'military',
  'work',
  'university',
]);

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
 * Returns the new group's Firestore document ID and generated invite code.
 */
export async function createGroup(
  creatorUid: string,
  creatorName: string,
  input: CreateGroupInput,
): Promise<{ groupId: string; inviteCode: string }> {
  const groupsRef = collection(db, 'community_groups');

  const minimumMembers = 1;
  // Generate code locally so we can return it without an extra Firestore read.
  const inviteCode = generateInviteCode();

  const newGroup = {
    authorityId: input.authorityId,
    name: input.name,
    description: input.description,
    category: input.category,
    groupType: input.groupType,
    scopeId: input.scopeId,
    isPublic: input.isPublic,
    allowJoinRequests: input.allowJoinRequests ?? false,
    ageRestriction: input.ageRestriction ?? 'all',
    schedule: input.schedule ?? null,
    scheduleSlots: input.scheduleSlots ?? [],
    meetingLocation: input.meetingLocation ?? null,
    rules: input.rules ?? null,
    images: input.images ?? [],
    source: input.source ?? 'authority',
    isOfficial: input.isOfficial ?? false,
    // Institutional groups are locked behind an access code. Geographic and
    // social groups stay open. Firestore rules block self-setting this to true
    // on `source: 'user'` creates, so only admin/authority creates can lock.
    isLocked: INSTITUTIONAL_GROUP_TYPES.has(input.groupType),
    hasMeetups: input.hasMeetups ?? true,

    currentParticipants: 1,
    memberCount: 1,
    minimumMembers,
    isActive: minimumMembers <= 1,
    inviteCode,

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

  // Mirror groupId in user's social.groupIds array (non-fatal: rules may restrict
  // this field on first-write or the social sub-map may not exist yet)
  try {
    await updateDoc(doc(db, 'users', creatorUid), {
      'social.groupIds': arrayUnion(groupId),
    });
    // Diagnostic: verify the write landed in Firestore before store refresh
    const verifySnap = await getDoc(doc(db, 'users', creatorUid));
    console.log('[createGroup] social.groupIds after write:', verifySnap.data()?.social?.groupIds);
    // Refresh store so useMyGroups() sees the new group immediately
    useUserStore.getState().refreshProfile().catch(() => {});
  } catch (userErr) {
    console.warn('[createGroup] user social.groupIds update failed (non-fatal):', userErr);
  }

  // Auto-create group chat thread so it appears in Messages/Inbox (non-fatal:
  // Capacitor Android can throw PERMISSION_DENIED on chats collection writes
  // depending on the auth state at the moment of the first write — the group
  // document is already committed above, so we must not let this kill the flow)
  try {
    await createGroupChat(groupId, input.name, creatorUid, creatorName);
  } catch (chatErr) {
    console.warn('[createGroup] chat creation failed (non-fatal):', chatErr);
  }

  return { groupId, inviteCode };
}

// ─── joinGroup ────────────────────────────────────────────────────────────────

export interface JoinGroupOptions {
  addToPlanner?: boolean;
  /**
   * Invite code entered by the user.  When provided and the target group is
   * private (`isPublic === false`), the service validates the code before
   * writing the membership document.  Throws `Error('invalid-invite-code')`
   * on mismatch.
   */
  providedCode?: string;
}

export async function joinGroup(
  groupId: string,
  uid: string,
  name: string,
  options?: JoinGroupOptions,
): Promise<void> {
  // Validate invite code when the caller supplies one (private-group gate).
  // If the group is private and validation passes, store the uppercased code so
  // the Firestore rule (members/{uid} create) can verify it server-side.
  let validatedInviteCode: string | undefined;

  if (options?.providedCode !== undefined) {
    const groupSnap = await getDoc(doc(db, 'community_groups', groupId));
    if (!groupSnap.exists()) throw new Error('group-not-found');
    const data = groupSnap.data();
    if (data.isPublic === false) {
      const expected = ((data.inviteCode as string | undefined) ?? '').toUpperCase();
      const provided = options.providedCode.toUpperCase();
      if (provided !== expected) throw new Error('invalid-invite-code');
      validatedInviteCode = provided;
    }
  }

  // Step 1 (critical): write member document.
  // inviteCode is included for private groups so the Firestore rule can
  // validate it server-side (closes the self-add-without-code gap).
  await setDoc(doc(db, 'community_groups', groupId, 'members', uid), {
    uid,
    name,
    joinedAt: serverTimestamp(),
    role: 'member',
    ...(validatedInviteCode !== undefined ? { inviteCode: validatedInviteCode } : {}),
  });

  // Step 2 (critical): mirror groupId in user's social.groupIds
  await updateDoc(doc(db, 'users', uid), {
    'social.groupIds': arrayUnion(groupId),
  });
  // Refresh store so useMyGroups() sees the new group immediately
  useUserStore.getState().refreshProfile().catch(() => {});

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
  allowJoinRequests?: boolean;
  rules?: string | null;
  images?: string[];
  hasMeetups?: boolean;
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
 * Fetches all public active groups — used for cross-city discovery.
 * Client-side caller must filter by isCityOnly before displaying.
 */
export async function getPublicGroups(): Promise<CommunityGroup[]> {
  const q = query(
    collection(db, 'community_groups'),
    where('isPublic', '==', true),
    where('isActive', '==', true),
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
