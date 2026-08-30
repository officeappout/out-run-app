import {
  type PrioritizedSkill,
  type ProgramId,
  type ScheduleItemId,
  type SkillId,
  ALL_SKILL_IDS,
  ALL_PROGRAM_IDS,
  MOVEMENT_OF,
  MIN_REST_HOURS,
  SKILL_DISPLAY,
} from '@/features/schedule/types/smartSchedule.types';

/**
 * Extracted from ScheduleStep.tsx (onboarding), 30.08.2026 — this was the
 * `useMemo` that derived a user's seed programs/skills for the schedule
 * grid, inline in the wizard step. Pulled out so a future post-onboarding
 * "rebuild my schedule" surface can reuse the exact same derivation instead
 * of forking a copy (this repo has a documented history of costly
 * duplication bugs from forked copies — hasKnownIdentity,
 * healthDeclarationAccepted, the two dashboardMode tables).
 *
 * Deliberately has NO `sessionStorage`/`window` reads inside it — the
 * original inline version read `sessionStorage` directly in the memo body,
 * which would make this function untestable under this repo's vitest
 * (`environment: 'node'`, no jsdom) and unusable by a drawer caller opened
 * weeks after onboarding (no fresh sessionStorage to read). Callers resolve
 * their own `overrides` and pass them in already-parsed.
 */

// ── Smart Schedule v1.3 — Wizard catalog ─────────────────────────────────
// The popover lets users pick from a curated v1.3 menu. These IDs match
// SkillId / ProgramId verbatim and are written into recurringTemplate as-is.
export type WizardOption = {
  id: ScheduleItemId;
  kind: 'program' | 'skill';
  labelHe: string;
  labelEn: string;
};

export const WIZARD_OPTIONS: WizardOption[] = [
  { id: 'UPPER_BODY', kind: 'program', labelHe: 'פלג גוף עליון', labelEn: 'Upper Body' },
  { id: 'FULL_BODY', kind: 'program', labelHe: 'כל הגוף', labelEn: 'Full Body' },
  { id: 'PLANCHE', kind: 'skill', labelHe: "פלאנץ׳", labelEn: 'Planche' },
  { id: 'FRONT_LEVER', kind: 'skill', labelHe: 'פרונט לבר', labelEn: 'Front Lever' },
  { id: 'HSPU', kind: 'skill', labelHe: 'HSPU', labelEn: 'HSPU' },
  { id: 'OAPU', kind: 'skill', labelHe: 'מתח יד אחת', labelEn: 'OAPU' },
  { id: 'MUSCLE_UP', kind: 'skill', labelHe: 'עליית כוח', labelEn: 'Muscle-Up' },
  { id: 'HANDSTAND', kind: 'skill', labelHe: 'עמידת ידיים', labelEn: 'Handstand' },
];

// ── Active-program → ScheduleItemId resolver ─────────────────────────────
// Maps a Firestore UserActiveProgram's name or templateId to our internal
// SkillId / ProgramId taxonomy. This is the bridge between what Firestore
// stores and what the rule engine understands.

// Maps every slug that can appear in the caller's `skillFocusSlugs` override
// or in a UserActiveProgram.templateId to our internal ScheduleItemId taxonomy.
const SLUG_TO_SCHEDULE_ID: Record<string, ScheduleItemId> = {
  // ── Skills (exact slugs from program-path/page.tsx SKILL_PROGRAMS) ──
  planche: 'PLANCHE',
  front_lever: 'FRONT_LEVER',
  hspu: 'HSPU',
  oapu: 'OAPU',
  one_arm_pullup: 'OAPU',       // program-path slug
  muscle_up: 'MUSCLE_UP',
  handstand: 'HANDSTAND',
  // ── Programs ──
  calisthenics_upper: 'UPPER_CALISTHENICS',  // master chip in program-path
  upper_calisthenics: 'UPPER_CALISTHENICS',
  full_body: 'FULL_BODY',
  upper_body: 'UPPER_BODY',
};

function resolveScheduleId(name: string, templateId: string): ScheduleItemId | null {
  // 1. Exact slug match (covers both override slugs and templateId)
  const slug = templateId.toLowerCase().replace(/-/g, '_');
  const slugMatch = SLUG_TO_SCHEDULE_ID[slug];
  if (slugMatch) return slugMatch;

  // 2. Substring name matching (Hebrew + English) for legacy UserActiveProgram.name
  const n = name.toLowerCase();
  if (n.includes('פלאנץ') || n.includes('planche')) return 'PLANCHE';
  if (n.includes('פרונט') || n.includes('front lever') || n.includes('front_lever')) return 'FRONT_LEVER';
  if (n.includes('hspu') || n.includes('handstand push')) return 'HSPU';
  if (n.includes('מתח יד אחת') || n.includes('oapu') || n.includes('one arm')) return 'OAPU';
  if (n.includes('עליית כוח') || n.includes('muscle up') || n.includes('muscle-up')) return 'MUSCLE_UP';
  if (n.includes('עמידת ידיים') || n.includes('handstand')) return 'HANDSTAND';
  if (n.includes('כל הגוף') || n.includes('full body') || n.includes('full_body')) return 'FULL_BODY';
  if (n.includes('עליון') || n.includes('upper body') || n.includes('upper_body')) return 'UPPER_BODY';
  if (n.includes('קליסטניקס') || n.includes('calisthenics')) return 'UPPER_CALISTHENICS';
  return null;
}

// Default seed — only used if the caller has zero active programs and no overrides.
const DEFAULT_SEED_PROGRAMS: ProgramId[] = ['UPPER_BODY'];
const DEFAULT_SEED_SKILLS: PrioritizedSkill[] = [];

/**
 * Deliberately narrower than the real `UserActiveProgram` type
 * (`user.types.ts`) — this module must not import from `@/features/user/core/types`
 * to avoid a reverse layer dependency (schedule → user). Mirrors the
 * defensive `ap.name ?? ''` / `ap.templateId ?? ''` in the original code.
 */
export interface ScheduleSeedProfileInput {
  progression?: {
    activePrograms?: Array<{ name?: string; templateId?: string }>;
  } | null;
}

export interface ScheduleSeedOverrides {
  /** Already-parsed `onboarding_skill_focus` sessionStorage value (lowercase slugs). */
  skillFocusSlugs?: string[];
  /** Already-read `onboarding_program_path` sessionStorage value ('health' | 'body_focus'). */
  programPath?: string;
}

export interface ScheduleSeedResult {
  activeWizardOptions: WizardOption[];
  seedPrograms: ProgramId[];
  seedSkills: PrioritizedSkill[];
}

/**
 * Derive a user's seed programs/skills for the schedule grid.
 *
 * Data-source priority (first non-empty wins):
 *   1. `overrides.skillFocusSlugs` — set by program-path/page.tsx during
 *      FRESH onboarding. Lowercase slugs like ['planche', 'front_lever'].
 *   2. `overrides.programPath`     — fallback when no skills chosen
 *      (health → FULL_BODY, body_focus → UPPER_BODY).
 *   3. `profile.progression.activePrograms` — existing user re-entering.
 *   4. `DEFAULT_SEED_PROGRAMS`/`DEFAULT_SEED_SKILLS` — absolute last resort.
 */
export function resolveScheduleSeed(
  profile: ScheduleSeedProfileInput | null | undefined,
  overrides?: ScheduleSeedOverrides,
): ScheduleSeedResult {
  const resolved: Array<{ id: ScheduleItemId; source: 'skill' | 'program'; name: string }> = [];
  const seen = new Set<ScheduleItemId>();

  const addId = (id: ScheduleItemId) => {
    if (seen.has(id)) return;
    seen.add(id);
    const source = (ALL_SKILL_IDS as readonly string[]).includes(id) ? 'skill' : 'program';
    const label = SKILL_DISPLAY[id]?.shortName ?? id;
    resolved.push({ id, source, name: label });
  };

  // ── Source 1: skillFocusSlugs override ────────────────────────────────
  overrides?.skillFocusSlugs?.forEach((s) => {
    const id = SLUG_TO_SCHEDULE_ID[s.toLowerCase()];
    if (id) addId(id);
  });

  // ── Source 2: programPath override fallback ───────────────────────────
  if (resolved.length === 0 && overrides?.programPath) {
    if (overrides.programPath === 'health') addId('FULL_BODY');
    else if (overrides.programPath === 'body_focus') addId('UPPER_BODY');
  }

  // ── Source 3: existing user's Firestore active programs ────────────────
  if (resolved.length === 0) {
    for (const ap of profile?.progression?.activePrograms ?? []) {
      const id = resolveScheduleId(ap.name ?? '', ap.templateId ?? '');
      if (id) addId(id);
    }
  }

  // ── Build wizard option list (respects selection order) ────────────────
  const options: WizardOption[] = resolved.map((r) => {
    const baseOption = WIZARD_OPTIONS.find((o) => o.id === r.id);
    return baseOption ?? {
      id: r.id,
      kind: r.source,
      labelHe: SKILL_DISPLAY[r.id]?.shortName ?? r.name,
      labelEn: r.id,
    };
  });

  // ── Hybrid option (§4.3): inject UPPER_CALISTHENICS when 2+ hard skills ──
  // `buildDefaultTemplate` auto-fills overflow days with UPPER_CALISTHENICS.
  // The popover must include it as a selectable/deselectable row so the user
  // can see and manage that auto-filled state on Thursday (and any overflow day).
  const hardSkillCount = resolved.filter((r) =>
    (ALL_SKILL_IDS as readonly string[]).includes(r.id) && r.id !== 'HANDSTAND',
  ).length;
  const hybridAlreadyPresent = options.some((o) => o.id === 'UPPER_CALISTHENICS');
  if (hardSkillCount >= 2 && !hybridAlreadyPresent) {
    options.push(
      WIZARD_OPTIONS.find((o) => o.id === 'UPPER_CALISTHENICS') ?? {
        id: 'UPPER_CALISTHENICS',
        kind: 'program',
        labelHe: 'קליסט. עליון',
        labelEn: 'Upper Calisthenics',
      },
    );
  }

  // ── Typed seeds for the rule engine ─────────────────────────────────────
  const programs: ProgramId[] = resolved
    .filter((r) => (ALL_PROGRAM_IDS as readonly string[]).includes(r.id))
    .map((r) => r.id as ProgramId);

  const skills: PrioritizedSkill[] = resolved
    .filter((r) => (ALL_SKILL_IDS as readonly string[]).includes(r.id))
    .map((r, idx) => ({
      id: r.id as SkillId,
      priority: idx + 1,
      movementType: (MOVEMENT_OF[r.id] === 'MIXED' ? 'DYNAMIC' : MOVEMENT_OF[r.id]) as any,
      isFreeSlot: r.id === 'HANDSTAND',
      minRestHours: MIN_REST_HOURS[r.id] ?? 24,
      countsTowardCap: r.id !== 'HANDSTAND',
    }));

  return {
    activeWizardOptions: options.length > 0 ? options : WIZARD_OPTIONS,
    seedPrograms: programs.length > 0 ? programs : DEFAULT_SEED_PROGRAMS,
    seedSkills: skills,
  };
}
