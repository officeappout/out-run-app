/**
 * Unified search (flag enable_unified_search) — the result model shared by the providers, the
 * grouping and the UI. Pure types.
 */
import type { Exercise } from '@/features/content/exercises/core/exercise.types';
import type { CommunityEvent, CommunityGroup } from '@/types/community.types';
import type { UserSearchResult } from '@/features/social/services/user-search.service';
import type { ArticleItem } from '@/lib/content-items/types';

/** The chips, in visual (RTL) order. */
export const SEARCH_CATEGORIES = ['all', 'exercises', 'parks', 'routes', 'social', 'events', 'articles', 'help'] as const;
export type SearchCategory = (typeof SEARCH_CATEGORIES)[number];
export type ResultCategory = Exclude<SearchCategory, 'all'>;

export const CATEGORY_LABEL: Record<SearchCategory, string> = {
  all: 'הכל',
  exercises: 'תרגילים',
  parks: 'גינות',
  routes: 'מסלולים',
  social: 'אנשים וקבוצות',
  events: 'אירועים',
  articles: 'מאמרים',
  help: 'עזרה',
};

interface Base {
  /** Unique across all results (kind + id). */
  key: string;
  title: string;
  subtitle?: string;
  /** Higher = better. 0 never reaches the UI. */
  score: number;
}

export interface ExerciseHit extends Base { kind: 'exercise'; exercise: Exercise }
export interface ParkHit extends Base { kind: 'park'; id: string; distanceKm: number | null }
export interface RouteHit extends Base { kind: 'route'; id: string; distanceKm: number | null; lengthKm?: number }
export interface PersonHit extends Base { kind: 'person'; person: UserSearchResult }
export interface GroupHit extends Base { kind: 'group'; group: CommunityGroup; distanceKm: number | null }
export interface EventHit extends Base { kind: 'event'; event: CommunityEvent; distanceKm: number | null }
export interface ArticleHit extends Base { kind: 'article'; article: ArticleItem }
export interface QaHit extends Base { kind: 'faq' | 'help'; id: string; q: string; a: string[]; topic: string }

export type SearchHit = ExerciseHit | ParkHit | RouteHit | PersonHit | GroupHit | EventHit | ArticleHit | QaHit;
export type HitKind = SearchHit['kind'];

export const KIND_CATEGORY: Record<HitKind, ResultCategory> = {
  exercise: 'exercises',
  park: 'parks',
  route: 'routes',
  person: 'social',
  group: 'social',
  event: 'events',
  article: 'articles',
  faq: 'help',
  help: 'help',
};

export type LatLng = { lat: number; lng: number };
