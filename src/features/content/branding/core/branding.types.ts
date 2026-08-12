/**
 * Branding & Messaging Types
 * Defines the structure for workout metadata, messaging, and psychological triggers
 */

/**
 * Psychological trigger families.
 * The first 4 are the original motivational angles applied to any notification
 * type; the last 2 ('Social_Proof', 'Loss_Aversion') were added with the
 * Social Engagement Engine and pair specifically with the social triggers
 * below (e.g. League_Overtake → Loss_Aversion, Social_Matchmaking → Social_Proof).
 */
export type PsychologicalTrigger =
  | 'FOMO'
  | 'Challenge'
  | 'Support'
  | 'Reward'
  | 'Social_Proof'
  | 'Loss_Aversion';

/**
 * All supported notification trigger categories.
 *
 * Legacy (single-user behavioural) triggers:
 *   • Inactivity        — user has been offline N days
 *   • Scheduled         — fixed calendar/cron reminder
 *   • Location_Based    — geofence on a park or gym
 *   • Habit_Maintenance — routine reinforcement / streak defence
 *   • Proximity         — proximate to a specific equipment fixture
 *
 * Social Engagement Engine triggers (introduced for the gamified
 * community mechanics in Duolingo/Strava style retention loops):
 *   • League_Overtake      — peer overtook the user on the weekly leaderboard
 *   • Social_Matchmaking   — peer with matching level/program is exercising nearby
 *   • Future_Partner_Plan  — peer scheduled the user's primary park at a future slot
 *   • Community_Group_New  — a new public group launched in the user's geofence
 *
 * Daily-goal trigger (Wave 1, notification-engine):
 *   • Daily_Goal — how much of TODAY's activity goal remains, independent of the
 *     multi-week `progressRange` field below. See `dailyGoalBucket`/`activityType`.
 */
export type NotificationTriggerType =
  | 'Inactivity'
  | 'Scheduled'
  | 'Location_Based'
  | 'Habit_Maintenance'
  | 'Proximity'
  | 'League_Overtake'
  | 'Social_Matchmaking'
  | 'Future_Partner_Plan'
  | 'Community_Group_New'
  | 'Daily_Goal';

export type DaysInactive = 1 | 2 | 7 | 30;

/**
 * Daily-goal completion bucket (Wave 1) — how much of TODAY's resettable
 * activity goal remains. Distinct from `progressRange` (0-20/20-90/90-100),
 * which measures progress within a multi-week training PROGRAM, not a daily
 * goal. Only meaningful when `triggerType === 'Daily_Goal'`.
 */
export type DailyGoalBucket = 'start' | 'mid' | 'close' | 'hit' | 'over';

/**
 * Which daily goal this message targets — makes `dailyGoalBucket` agnostic
 * across activities so the SAME axis/buckets serve steps and strength (and
 * future running) goals. Only meaningful when `triggerType === 'Daily_Goal'`.
 */
export type DailyGoalActivityType = 'walking' | 'strength' | 'running';

/**
 * Notification (Enhanced with Trigger Types)
 * Can be triggered by inactivity, schedule, location, or habit maintenance
 */
export interface Notification {
  id: string;
  triggerType: NotificationTriggerType;
  daysInactive?: DaysInactive; // Only for Inactivity trigger type
  persona: string; // e.g., 'parent', 'student', 'office_worker'
  gender?: 'male' | 'female' | 'both'; // Gender targeting
  psychologicalTrigger: PsychologicalTrigger;
  text: string; // The notification message
  calendarIntegration?: boolean; // Placeholder for future calendar sync
  clickCount?: number; // Performance tracking placeholder
  completionRate?: number; // Performance tracking placeholder (0-1)
  createdAt?: Date;
  updatedAt?: Date;
  /** Only for Daily_Goal trigger type. See `DailyGoalBucket`'s doc comment. */
  dailyGoalBucket?: DailyGoalBucket;
  /** Only for Daily_Goal trigger type. See `DailyGoalActivityType`'s doc comment. */
  activityType?: DailyGoalActivityType;
}

/**
 * @deprecated Use Notification instead
 * Legacy interface for backward compatibility
 */
export interface InactivityNotification extends Notification {
  daysInactive: DaysInactive;
  triggerType: 'Inactivity';
}

/**
 * Social Notification — extends the base Notification with the contextual
 * payload fields required by the four Social Engagement Engine triggers.
 *
 * Every field is optional because a single SocialNotification document only
 * uses the subset relevant to its `triggerType`:
 *   • League_Overtake      → overtakingUserId, newRank, stepDelta
 *   • Social_Matchmaking   → matchedUserId, matchedUserName, matchedUserLevel
 *   • Future_Partner_Plan  → matchedUser* + plannedWorkoutTime
 *   • Community_Group_New  → groupId, groupName, groupCategory,
 *                            meetingLocationName, meetingTime, meetingDay
 *
 * Timestamps are stored as ISO strings (not Firestore Timestamp) so the
 * document round-trips cleanly through the push queue without server-side
 * timestamp coercion.
 */
export interface SocialNotification extends Notification {
  triggerType:
    | 'League_Overtake'
    | 'Social_Matchmaking'
    | 'Future_Partner_Plan'
    | 'Community_Group_New';

  // ── League_Overtake context ─────────────────────────────────────────
  /** UID of the peer who just passed the recipient on the leaderboard. */
  overtakingUserId?: string;
  /** Recipient's new rank position (integer). */
  newRank?: number;
  /** Step/point delta needed to retake the previous rank. */
  stepDelta?: number;

  // ── Matchmaking / Partner-Plan context ─────────────────────────────
  /** UID of the matched peer (Matchmaking or Future_Partner_Plan). */
  matchedUserId?: string;
  /** Display name of the matched peer. */
  matchedUserName?: string;
  /** Global progression level of the matched peer. */
  matchedUserLevel?: number;
  /** ISO timestamp of the peer's planned workout slot (Future_Partner_Plan). */
  plannedWorkoutTime?: string;

  // ── Community_Group_New context ────────────────────────────────────
  /** Firestore ID of the newly launched community group. */
  groupId?: string;
  /** Display name of the newly launched group. */
  groupName?: string;
  /** Group activity category (walking / running / yoga / ...). */
  groupCategory?: import('@/types/community.types').CommunityGroupCategory;
  /** Display name or address of the meeting fixture. */
  meetingLocationName?: string;
  /** ISO timestamp of the next scheduled meeting. */
  meetingTime?: string;
  /** Pre-formatted Hebrew day string (e.g. "יום שלישי"). */
  meetingDay?: string;
}

/**
 * Smart Description
 * Context-aware workout description based on Location + Persona
 */
export interface SmartDescription {
  id: string;
  location: string; // e.g., 'home', 'park', 'office'
  persona: string; // e.g., 'parent', 'student', 'office_worker'
  gender?: 'male' | 'female' | 'both'; // Gender targeting
  description: string; // The smart description text
  clickCount?: number; // Performance tracking placeholder
  completionRate?: number; // Performance tracking placeholder (0-1)
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Workout Title (Enhanced with Smart Description support)
 */
export interface WorkoutTitle {
  id: string;
  category: 'strength' | 'volume' | 'endurance' | 'skills' | 'mobility' | 'hiit' | 'general';
  text: string;
  smartDescriptions?: SmartDescription[]; // Linked descriptions by Location + Persona
  clickCount?: number; // Performance tracking placeholder
  completionRate?: number; // Performance tracking placeholder (0-1)
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Motivational Phrase (Daily Phrase)
 */
export interface MotivationalPhrase {
  id: string;
  location: string;
  persona: string;
  timeOfDay?: string; // 'morning', 'afternoon', 'evening', 'any'
  gender?: 'male' | 'female' | 'both'; // Gender targeting
  phrase: string;
  clickCount?: number; // Performance tracking placeholder
  completionRate?: number; // Performance tracking placeholder (0-1)
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Description Template
 * Dynamic template for generating contextual workout descriptions
 * Supports variables: {category}, {muscles}, {persona}, {location}
 */
export interface DescriptionTemplate {
  id: string;
  template: string; // e.g., "אימון {category} שמתמקד ב-{muscles} עבור {persona}."
  category?: string; // Optional: specific category this template applies to
  location?: string; // Optional: specific location this template applies to
  persona?: string; // Optional: specific persona this template applies to
  priority?: number; // Higher priority templates are used first
  clickCount?: number; // Performance tracking placeholder
  completionRate?: number; // Performance tracking placeholder (0-1)
  createdAt?: Date;
  updatedAt?: Date;
}
