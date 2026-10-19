import type { CommunityGroupCategory, CommunityGroupType, ScheduleSlot } from '@/types/community.types';

// ── Form state type ───────────────────────────────────────────────────────────

export interface WizardForm {
  name: string;
  description: string;
  category: CommunityGroupCategory;
  /** Group type — determines scope binding and privacy defaults. */
  groupType: CommunityGroupType;
  address: string;
  coords: { lat: number; lng: number };
  /** True once the user explicitly picks an address, park, or moves the map pin */
  locationSelected: boolean;
  scheduleSlots: ScheduleSlot[];
  isPublic: boolean;
  /** Only relevant when isPublic === false; lets non-members request to join */
  allowJoinRequests: boolean;
  rules: string;
  imageFile: File | null;
  imagePreviewUrl: string | null;
  /**
   * null  = not yet chosen (StepMode pending)
   * true  = "אימון משותף" — shows StepWhenWhere, creates group with scheduleSlots
   * false = "כל אחד בקצב שלו" — skips StepWhenWhere, hasMeetups=false in Firestore
   */
  hasMeetups: boolean | null;
}

/** The single-field setter every step receives. */
export type UpdateForm = <K extends keyof WizardForm>(k: K, v: WizardForm[K]) => void;

/** Shown on the post-creation success screen. */
export interface WizardSuccessInfo {
  groupId: string;
  inviteCode: string;
  name: string;
  isPrivate: boolean;
}

// ── Props ─────────────────────────────────────────────────────────────────────

export interface CreateGroupWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (groupId: string) => void;
  /** When provided the wizard opens in Edit Mode, pre-filled with Firestore data */
  editGroupId?: string;
}
