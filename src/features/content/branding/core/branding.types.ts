/**
 * Branding & Messaging Types
 * Defines the structure for workout metadata, messaging, and psychological triggers
 */

export type PsychologicalTrigger = 'FOMO' | 'Challenge' | 'Support' | 'Reward';

export type NotificationTriggerType = 'Inactivity' | 'Scheduled' | 'Location_Based' | 'Habit_Maintenance' | 'Proximity';

export type DaysInactive = 1 | 2 | 7 | 30;

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
