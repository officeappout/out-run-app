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

export const CATEGORIES: { value: CommunityGroupCategory; label: string; emoji: string }[] = [
  { value: 'running',      label: 'ריצה',       emoji: '🏃' },
  { value: 'walking',      label: 'הליכה',      emoji: '🚶' },
  { value: 'calisthenics', label: 'קליסתניקס', emoji: '💪' },
  { value: 'yoga',         label: 'יוגה',       emoji: '🧘' },
  { value: 'cycling',      label: 'רכיבה',      emoji: '🚴' },
  { value: 'other',        label: 'אחר',        emoji: '⭐' },
];

export const DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export const DAYS_FULL = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

export const STEPS = ['סוג קבוצה', 'בסיסים', 'סוג אימון', 'מתי ואיפה', 'פרטיות', 'סיום'];

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

export const GROUP_TYPES: { value: CommunityGroupType; emoji: string; label: string; sub: string }[] = [
  { value: 'neighborhood', emoji: '🏘️', label: 'שכונה',    sub: 'קבוצת אימון מקומית' },
  { value: 'friends',      emoji: '👥', label: 'חברים',    sub: 'קבוצה פרטית לחברים' },
  { value: 'family',       emoji: '👨‍👩‍👧', label: 'משפחה',    sub: 'אתגר משפחתי' },
  { value: 'work',         emoji: '💼', label: 'עבודה',    sub: 'אתגר ספורט בעבודה' },
  { value: 'university',   emoji: '🎓', label: 'קמפוס',   sub: 'קהילת סטודנטים' },
  { value: 'park',         emoji: '🌳', label: 'פארק',     sub: 'קהילת פארק' },
  { value: 'school',       emoji: '🏫', label: 'ביה״ס',   sub: 'קהילת בית ספר' },
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
