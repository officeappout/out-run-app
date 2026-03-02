/**
 * Dynamic Message Engine — Firestore schema for pressure_messages collection.
 *
 * Each document represents a gendered message template used in the Municipal
 * Pressure Engine or School Outreach flow.
 */

export type MessageCategory = 'city_pressure' | 'school_outreach';

export type PsychologyTag =
  | 'Health'
  | 'Competition'
  | 'Innovation'
  | 'Community'
  | 'Kids'
  | 'Pride';

export interface MessageTemplate {
  id: string;
  category: MessageCategory;
  psychologyTag: PsychologyTag;
  textMale: string;
  textFemale: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export const CATEGORY_LABELS: Record<MessageCategory, string> = {
  city_pressure: 'לחץ עירוני',
  school_outreach: 'פנייה לבית ספר',
};

export const PSYCHOLOGY_TAG_LABELS: Record<PsychologyTag, string> = {
  Health: 'בריאות',
  Competition: 'תחרותיות',
  Innovation: 'חדשנות',
  Community: 'קהילה',
  Kids: 'ילדים ונוער',
  Pride: 'גאווה עירונית',
};

export const ALL_PSYCHOLOGY_TAGS: PsychologyTag[] = [
  'Health',
  'Competition',
  'Innovation',
  'Community',
  'Kids',
  'Pride',
];
