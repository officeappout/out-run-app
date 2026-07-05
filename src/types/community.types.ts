/**
 * Community Groups and Events Types
 * For Authority Manager Dashboard and user-created groups
 */

// ── Live session phase ──────────────────────────────────────────────────────
/** Computed client-side (far/approaching/lobby) or written by leader (active/ended). */
export type LiveSessionPhase = 'far' | 'approaching' | 'lobby' | 'active' | 'ended';

/**
 * Goal specification for a group session or personal override.
 *
 * kind: 'goal'       — simple distance/time target (built now).
 *                      value units: km (distance) | seconds (time).
 * kind: 'structured' — reserved for future interval-workout reference.
 */
export type SessionGoalSpec =
  | { kind: 'goal'; type: 'distance' | 'time'; value: number }
  // future: | { kind: 'structured'; workoutId: string }
  ;

/**
 * Per-member travel status — written by the member herself to
 * community_groups/{groupId}/attendance/{sessionId}/member_statuses/{uid}
 */
export interface MemberSessionStatus {
  uid: string;
  /** skip = "מתאמנת לבד" — removes the session from home screen without leaving the group */
  status: 'rsvp' | 'otw' | 'here' | 'late' | 'skip';
  lateMinutes?: 2 | 5 | 10 | 15;
  updatedAt: import('firebase/firestore').Timestamp;
  /**
   * Personal goal override for this session.
   * undefined → inherit SessionAttendance.sessionGoal (case C default).
   * SessionGoalSpec → explicit override (case B).
   * null → solo / no goal (case A).
   */
  personalGoal?: SessionGoalSpec | null;
}

/**
 * Per-user preferences scoped to a single group.
 * Stored in user profile at profile.groupPreferences[groupId].
 */
export interface GroupPreference {
  /** "מתאמנת לבד" — silences meeting reminders without leaving the group */
  meetingRemindersMuted: boolean;
}

// Scope of a community group (maps to affiliation types)
export type CommunityGroupType = 'neighborhood' | 'work' | 'university' | 'park' | 'friends' | 'family' | 'school' | 'military' | 'youth_movement';

export type TargetGender = 'male' | 'female' | 'all';

export interface AgeRange {
  min?: number;
  max?: number;
}

// Member document stored in community_groups/{groupId}/members/{uid}
export interface GroupMember {
  uid: string;
  name: string;
  joinedAt: Date;
  role: 'member' | 'admin';
}

export interface ScheduleSlot {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  time: string; // e.g., "18:00"
  frequency: 'weekly' | 'biweekly' | 'monthly';
  /** Session length in minutes — drives banner visibility and auto-ended threshold. Fallback: 60. */
  durationMinutes?: number;
  /** Per-slot overrides (Booking & RSVP engine) */
  maxParticipants?: number;
  price?: number | null;
  requiredEquipment?: string[];
  targetMuscles?: string[];
  /** Optional label for this specific slot, e.g. "יוגה" vs "ריצה" */
  label?: string;
  /** Sport-type tags for categorisation (כדורגל, יוגה, ריצה, etc.) */
  tags?: string[];
  /** Per-slot images — falls back to group.images when absent */
  images?: string[];
  /** Per-slot location override — falls back to group.meetingLocation when absent */
  location?: {
    address?: string;
    lat?: number;
    lng?: number;
    /** FK → official_routes or curated_routes. Mutually exclusive with parkId on the parent. */
    routeId?: string;
  };
  /**
   * Default session goal for this recurring slot.
   * Copied into SessionAttendance.sessionGoal at booking creation time.
   * Source-of-truth at run time is always the attendance doc, not this field.
   */
  workoutGoal?: SessionGoalSpec;
}

/** Attendance doc stored at community_groups/{groupId}/attendance/{YYYY-MM-DD_HH-mm} */
export interface SessionAttendance {
  groupId: string;
  date: string;
  time: string;
  attendees: string[];
  currentCount: number;
  maxParticipants?: number;
  /** UID → basic profile for avatar display */
  attendeeProfiles?: Record<string, { name: string; photoURL?: string }>;
  /** Users waiting for a spot when session is full */
  waitlist?: string[];
  waitlistProfiles?: Record<string, { name: string; photoURL?: string }>;

  // ── Live phase (written by leader or 'auto' fallback) ─────────────────────
  /** Only 'active' | 'ended' are stored; far/approaching/lobby are computed client-side. */
  sessionPhase?: 'active' | 'ended';
  sessionPhaseUpdatedAt?: import('firebase/firestore').Timestamp;
  /** uid of the leader who triggered, or the constant 'auto' */
  sessionPhaseUpdatedBy?: string;

  /** Leader extends the lobby window when a member marks herself late */
  lobbyExtendedUntil?: import('firebase/firestore').Timestamp;

  /**
   * Session-level goal set by the session creator (coach, peer, or system).
   * Written at attendance-doc creation time (from ScheduleSlot.workoutGoal for scheduled
   * sessions; directly by the creator for peer/ad-hoc sessions).
   * Members without a personalGoal in member_statuses inherit this value.
   */
  sessionGoal?: SessionGoalSpec;

  /** Optional — filled during / after the session */
  collectiveProgress?: {
    totalXP?: number;
    activeCount?: number;
  };
}

export interface CommunityGroup {
  id: string;
  authorityId: string;
  name: string;
  description: string;
  category: CommunityGroupCategory;
  meetingLocation?: {
    parkId?: string;
    /** FK → official_routes or curated_routes. Mutually exclusive with parkId. */
    routeId?: string;
    address?: string;
    location?: { lat: number; lng: number };
  };
  /** @deprecated Use `scheduleSlots` for multi-slot support */
  schedule?: ScheduleSlot;
  /** Multiple recurring sessions per group */
  scheduleSlots?: ScheduleSlot[];
  maxParticipants?: number;
  currentParticipants: number;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;

  // ── Pillar 1 additions ────────────────────────────────────────────────────
  groupType?: CommunityGroupType;
  scopeId?: string;
  ageRestriction?: 'minor' | 'adult' | 'all';
  memberCount?: number;
  minimumMembers?: number;
  isPublic?: boolean;
  inviteCode?: string;
  creatorReferralCount?: number;

  // ── Content & enrichment ──────────────────────────────────────────────────
  targetMuscles?: string[];
  equipment?: string[];
  /** null = free, number = cost in credits or currency */
  price?: number | null;
  isOfficial?: boolean;

  // ── Target audience ────────────────────────────────────────────────────
  targetGender?: TargetGender;
  targetAgeRange?: AgeRange;

  // ── Visuals ────────────────────────────────────────────────────────────
  images?: string[];

  // ── Origin / Tier ─────────────────────────────────────────────────────────────
  /**
   * Who created this group:
   *  'authority'    — created by an authority manager in the admin panel
   *  'professional' — created by a verified coach / paid instructor
   *  'user'         — created by a regular user via the in-app wizard
   *
   * Undefined means legacy data; treat as 'authority' when isOfficial is true.
   */
  source?: 'authority' | 'professional' | 'user';

    // ── Community Rules ────────────────────────────────────────────────────
  /** Free-text community rules shown in the group drawer (Hebrew) */
  rules?: string;

  // ── Access Control ───────────────────────────────────────────────────
  /** When true, non-members can submit a join request (private groups only) */
  allowJoinRequests?: boolean;
  /** When true, users must provide a valid access code to join */
  isLocked?: boolean;
  /** Links this group to a specific tenant / organization */
  organizationId?: string;
  /** Hint for which code vertical to expect (e.g. 'military', 'school') */
  requiredAccessCodeType?: string;

  // ── Geo-restrictions ──────────────────────────────────────────────────
  /** Restrict visibility to the group's authority city only */
  isCityOnly?: boolean;
  /** Restrict visibility to users of a specific neighborhood authority */
  restrictedNeighborhoodId?: string;

  // ── Session mode ──────────────────────────────────────────────────────
  /**
   * true  = "אימון משותף" — group has scheduled meetups, shows session banners
   * false = "כל אחד בקצב שלו" — league/competition mode, no session banners
   * undefined = legacy group; treated as true (meetups assumed)
   */
  hasMeetups?: boolean;

  // ── Challenge subtype ─────────────────────────────────────────────────
  /**
   * 'challenge' = single-metric competition (L-sit, push-ups, etc.)
   * Requires hasMeetups: false. Adds challenge_submissions sub-collection.
   */
  groupSubtype?: 'challenge';
  challengeMetric?: {
    type: 'time' | 'reps' | 'distance';
    unit: 'seconds' | 'reps' | 'km';
    /** true = higher value wins (time hold, distance); false = lower wins (pace) */
    higherIsBetter: boolean;
    /** Soft target in the timer UI — count-up continues past it (overtime) */
    targetValue?: number;
  };
  /** ISO date strings bounding the active challenge window (display only) */
  startsAt?: string;
  endsAt?: string;

  // ── Leader / Coach ────────────────────────────────────────────────────────
  /** UID of the assigned coach / leader (set via admin panel). Also holds role='admin' in members sub-collection. */
  leaderUserId?: string;
  /** Display name of the assigned coach / leader (denormalised for reads). */
  leaderName?: string;
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
    /** FK → official_routes or curated_routes. Mutually exclusive with parkId. */
    routeId?: string;
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

  // ── Social & Community Layer ──────────────────────────────────────────────
  isOfficial?: boolean;
  authorityLogoUrl?: string;

  // ── Content & enrichment ──────────────────────────────────────────────────
  targetMuscles?: string[];
  equipment?: string[];
  /** null = free, number = cost in credits or currency */
  price?: number | null;
  /** Prominent one-time notice, e.g. "Today we meet at the indoor hall due to rain" */
  specialNotice?: string;

  // ── Target audience ────────────────────────────────────────────────────
  targetGender?: TargetGender;
  targetAgeRange?: AgeRange;

  // ── Visuals ────────────────────────────────────────────────────────────
  images?: string[];
  /** External registration / info URL */
  externalLink?: string;

  // ── Origin / Source ──────────────────────────────────────────────────
  /**
   * 'virtual_materialized' — auto-created when a user joins a recurring group slot
   * undefined / absent      — manually created by admin or standalone event
   */
  source?: 'virtual_materialized' | string;

  // ── Geo-restrictions ──────────────────────────────────────────────────
  isCityOnly?: boolean;
  restrictedNeighborhoodId?: string;
}

/**
 * Registration document stored in community_events/{eventId}/registrations/{uid}.
 * Mirrors the GroupMember pattern from community_groups/{groupId}/members/{uid}.
 */
export interface EventRegistration {
  uid: string;
  name: string;
  photoURL?: string;
  joinedAt: Date;
}

// ─── Pillar 5 — Activity Feed ─────────────────────────────────────────────────

export type ActivityEventType = 'high_five' | 'group_join' | 'official_event_join' | 'leaderboard_badge';

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

// ─── Planned Sessions — Ephemeral Social Layer ────────────────────────────────

import type { ActivityType } from '@/features/parks/core/types/route.types';

export type PlannedSessionStatus = 'planned' | 'active' | 'completed' | 'cancelled';
export type PrivacyMode = 'ghost' | 'squad' | 'verified_global';
export type FitnessLevel = 'beginner' | 'intermediate' | 'advanced';

/**
 * Firestore: planned_sessions/{sessionId}
 * Lightweight spontaneous "I'm heading to this route/park" declarations.
 *
 * `routeId` and `parkId` are mutually exclusive — exactly one is set
 * depending on whether the user is announcing arrival at a route start
 * (RouteDetailSheet) or at a park (ParkDetailSheet). Consumers query by
 * the field that matches their context (e.g. useParkEvents queries by
 * `parkId == X`, partner-finder queries by `routeId in [...]`), so a
 * doc with the wrong field would simply not surface in the wrong UI.
 */
export interface PlannedSession {
  id: string;
  userId: string;
  displayName: string;
  photoURL: string | null;
  /** FK → routes (when announcing arrival at a route start). */
  routeId?: string;
  /** FK → parks (when announcing arrival at a park). */
  parkId?: string;
  /**
   * Denormalised display name of the park (only when `parkId` is set) —
   * persisted at write time so partner-finder cards can render the
   * arrival's location ("📍 פארק הלל") without a per-card Firestore
   * lookup. Optional for backwards compatibility with sessions written
   * before this field existed.
   */
  parkName?: string;
  /**
   * Denormalised display name of the route (only when `routeId` is set).
   * Same rationale as `parkName` — avoids N+1 reads in the partner UI.
   */
  routeName?: string;
  /**
   * Denormalised active strength program metadata captured from the
   * publisher's profile at write time. Mirrors the
   * `programName`/`programLevel` fields the live `presence/{uid}`
   * heartbeat persists, so scheduled cards can show the same
   * "🎯 program · רמה N" line live cards already render.
   */
  programName?: string;
  programLevel?: number;
  activityType: ActivityType;
  level: FitnessLevel;
  startTime: Date;
  /**
   * End of the announced arrival window. Replaces the single-point
   * "I'll be there at 18:00" model with a range ("18:00–20:00")
   * surfaced via the dual-handle time slider in ParkDetailSheet.
   * Older docs without this field fall back to `startTime + 1h` at
   * read-time inside `planned-sessions.service` — consumers can
   * therefore treat it as effectively required.
   */
  endTime: Date;
  expiresAt: Date;
  status: PlannedSessionStatus;
  privacyMode: PrivacyMode;
  createdAt: Date;
  /** Geographic coordinates of the intended workout location */
  lat?: number | null;
  lng?: number | null;
  /** Shared key linking multiple sessions into a group run */
  groupSessionId?: string;
  groupName?: string;
  isGroupLeader?: boolean;
}

// ─── Group Sessions — Live Group Interaction ──────────────────────────────────

export type GroupSessionStatus = 'forming' | 'active' | 'completed';

/**
 * Firestore: group_sessions/{groupSessionId}
 * Links multiple planned_sessions into a shared workout.
 */
export interface GroupSession {
  id: string;
  routeId: string;
  activityType: ActivityType;
  leaderUserId: string;
  leaderName: string;
  startTime: Date;
  status: GroupSessionStatus;
  memberIds: string[];
  memberCount: number;
  /** Stable color assignment per member for map avatars */
  memberColors: Record<string, string>;
  createdAt: Date;
  expiresAt: Date;
}
