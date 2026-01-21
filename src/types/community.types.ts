/**
 * Community Groups and Events Types
 * For Authority Manager Dashboard
 */

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
  createdBy: string; // Manager user ID
  createdAt: Date;
  updatedAt: Date;
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
}

export type EventCategory = 
  | 'race' 
  | 'fitness_day' 
  | 'workshop' 
  | 'community_meetup' 
  | 'other';
