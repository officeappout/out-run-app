/**
 * Community Groups and Events Types
 * For Authority Manager Dashboard and user-created groups
 */

// Scope of a community group (maps to affiliation types)
export type CommunityGroupType = 'neighborhood' | 'work' | 'university' | 'park';

// Member document stored in community_groups/{groupId}/members/{uid}
export interface GroupMember {
  uid: string;
  name: string;
  joinedAt: Date;
  role: 'member' | 'admin';
}

export interface CommunityGroup {
  id: string;
  authorityId: string; // Which authority manages this group
  name: string; // e.g., "קבוצת הליכה הרצליה"
  description: string;
  category: CommunityGroupCategory;
  meetingLocation?: {
    parkId?: string; // Link to park
    address?: string;
    location?: { lat: number; lng: number };
  };
  schedule?: {
    dayOfWeek: number; // 0-6 (Sunday-Saturday)
    time: string; // e.g., "18:00"
    frequency: 'weekly' | 'biweekly' | 'monthly';
  };
  maxParticipants?: number;
  currentParticipants: number;
  isActive: boolean;
  createdBy: string; // Manager or user UID
  createdAt: Date;
  updatedAt: Date;

  // ── Pillar 1 additions ────────────────────────────────────────────────────
  /** Scope type: neighborhood uses authorityId, others use their affiliation id */
  groupType?: CommunityGroupType;
  /** scopeId mirrors groupType: authorityId | companyId | schoolId | parkId */
  scopeId?: string;
  /** Age restriction for the group (default 'all') */
  ageRestriction?: 'minor' | 'adult' | 'all';
  /** Denormalized count for fast list rendering without sub-collection reads */
  memberCount?: number;
  /** Group is hidden in discovery until memberCount >= minimumMembers (anti-ghost) */
  minimumMembers?: number;
  /** Discoverable in global listing when true; invite-only when false */
  isPublic?: boolean;
  /** 6-char alphanumeric code for private group invites */
  inviteCode?: string;
  /** Snapshot of creator's referralCount at creation time (audit field) */
  creatorReferralCount?: number;
}

export type CommunityGroupCategory = 
  | 'walking' 
  | 'running' 
  | 'yoga' 
  | 'calisthenics' 
  | 'cycling' 
  | 'other';

export interface CommunityEvent {
  id: string;
  authorityId: string; // Which authority manages this event
  name: string; // e.g., "מרוץ הרצליה 2026"
  description: string;
  category: EventCategory;
  date: Date;
  startTime: string; // e.g., "07:00"
  endTime?: string;
  location: {
    parkId?: string;
    address: string;
    location: { lat: number; lng: number };
  };
  registrationRequired: boolean;
  maxParticipants?: number;
  currentRegistrations: number;
  isActive: boolean;
  createdBy: string; // Manager user ID
  createdAt: Date;
  updatedAt: Date;

  // ── Pillar 1 additions ────────────────────────────────────────────────────
  /** Mirrors groupType of the group this event belongs to */
  groupType?: CommunityGroupType;
  /** Link to a specific group (optional — events can be city-wide) */
  groupId?: string;
  /** Age restriction (default 'all') */
  ageRestriction?: 'minor' | 'adult' | 'all';
}

// ─── Pillar 5 — Activity Feed ─────────────────────────────────────────────────

export type ActivityEventType = 'high_five' | 'group_join' | 'leaderboard_badge';

/**
 * Stored in activity/{uid}/feed/{eventId}.
 * Written by Cloud Functions / kudos.service.ts; clients read only.
 */
export interface ActivityFeedItem {
  id: string;
  type: ActivityEventType;
  fromUid?: string;
  fromName?: string;
  groupId?: string;
  groupName?: string;
  /** Pre-rendered Hebrew message string for display */
  message: string;
  createdAt: Date;
  read: boolean;
}

export type EventCategory = 
  | 'race' 
  | 'fitness_day' 
  | 'workshop' 
  | 'community_meetup' 
  | 'other';
