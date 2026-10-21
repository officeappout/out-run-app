import type React from 'react';
import {
  Trees,
  Home as HomeIcon,
  Users as UsersIcon,
  Heart as HeartIcon,
  Briefcase,
  GraduationCap,
  School,
} from 'lucide-react';
import type { CommunityGroupCategory, CommunityGroupType } from '@/types/community.types';
import type { CommunityKey } from '@/messages/ns/community';
import type { WizardForm } from './wizard-types';

/** v2: the app's line icons instead of emoji for the community types. */
export const GROUP_TYPE_ICON: Record<string, React.ElementType> = {
  neighborhood: HomeIcon,
  friends: UsersIcon,
  family: HeartIcon,
  work: Briefcase,
  university: GraduationCap,
  park: Trees,
  school: School,
};

// ── Constants ─────────────────────────────────────────────────────────────────

export const CATEGORIES: { value: CommunityGroupCategory; labelKey: CommunityKey; emoji: string }[] = [
  { value: 'running',      labelKey: 'createGroup.category.running',      emoji: '🏃' },
  { value: 'walking',      labelKey: 'createGroup.category.walking',      emoji: '🚶' },
  { value: 'calisthenics', labelKey: 'createGroup.category.calisthenics', emoji: '💪' },
  { value: 'yoga',         labelKey: 'createGroup.category.yoga',         emoji: '🧘' },
  { value: 'cycling',      labelKey: 'createGroup.category.cycling',      emoji: '🚴' },
  { value: 'other',        labelKey: 'createGroup.category.other',        emoji: '⭐' },
];

export const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳']; // i18n-allow-hebrew: weekday names (wave 3, fmt)

export const DAYS_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת']; // i18n-allow-hebrew: weekday names (wave 3, fmt)

export const STEPS: readonly CommunityKey[] = [
  'createGroup.step.type',
  'createGroup.step.basics',
  'createGroup.step.mode',
  'createGroup.step.whenWhere',
  'createGroup.step.privacy',
  'createGroup.step.finalize',
];

// Types that default to private — toggle still shown, but isPublic initialises to false for these
export const ALWAYS_PRIVATE_TYPES = new Set<CommunityGroupType>(['friends', 'family', 'work', 'school', 'university']);

// 07.09.2026 — 'military' is NOT in GROUP_TYPES below (not a selectable
// card in this wizard's own type-picker today, confirmed by reading it),
// so this is currently unreachable via new-group creation through this
// UI. Kept anyway, deliberately separate from ALWAYS_PRIVATE_TYPES (not
// merged into it): David approved a DEFAULT of isPublic=false for
// military specifically, still user-changeable — ALWAYS_PRIVATE_TYPES has
// stronger, non-negotiable semantics elsewhere in this wizard (hard-forced
// at submit regardless of the toggle, and skips the location/schedule
// step entirely) that were not asked for here. Defensive: reachable today
// only via editing an existing military-type group's data in this wizard
// (e.g. the one real production doc, military_reserve_general).
export const DEFAULT_PRIVATE_TYPES = new Set<CommunityGroupType>([...Array.from(ALWAYS_PRIVATE_TYPES), 'military']);

// B2B/B2E types: after type selection, show an outreach nudge before StepBasics.
// User can still create a group by clicking "המשך ממילא".
export const OUTREACH_TYPES = new Set<CommunityGroupType>(['work', 'university']);

export const GROUP_TYPES: { value: CommunityGroupType; emoji: string; labelKey: CommunityKey; subKey: CommunityKey }[] = [
  { value: 'neighborhood', emoji: '🏘️', labelKey: 'createGroup.groupType.neighborhood.label', subKey: 'createGroup.groupType.neighborhood.sub' },
  { value: 'friends',      emoji: '👥', labelKey: 'createGroup.groupType.friends.label',      subKey: 'createGroup.groupType.friends.sub' },
  { value: 'family',       emoji: '👨‍👩‍👧', labelKey: 'createGroup.groupType.family.label',       subKey: 'createGroup.groupType.family.sub' },
  { value: 'work',         emoji: '💼', labelKey: 'createGroup.groupType.work.label',         subKey: 'createGroup.groupType.work.sub' },
  { value: 'university',   emoji: '🎓', labelKey: 'createGroup.groupType.university.label',   subKey: 'createGroup.groupType.university.sub' },
  { value: 'park',         emoji: '🌳', labelKey: 'createGroup.groupType.park.label',         subKey: 'createGroup.groupType.park.sub' },
  { value: 'school',       emoji: '🏫', labelKey: 'createGroup.groupType.school.label',       subKey: 'createGroup.groupType.school.sub' },
];

export const BLANK_FORM: WizardForm = {
  name: '',
  description: '',
  category: 'running',
  groupType: 'neighborhood',
  address: '',
  coords: { lat: 31.7683, lng: 35.2137 },
  locationSelected: false,
  scheduleSlots: [],
  isPublic: true,
  allowJoinRequests: false,
  rules: '',
  imageFile: null,
  imagePreviewUrl: null,
  hasMeetups: null,
};
