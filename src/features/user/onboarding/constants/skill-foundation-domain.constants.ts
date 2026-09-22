/**
 * Skill → Foundation Domain Mapping ("David's Matrix")
 *
 * Maps a canonical skill program slug to the foundational movement domain
 * (push or pull) whose track level should be inferred from the assessed
 * skill level — see SKILL_TO_FOUNDATION_OFFSET in onboarding-sync.service.ts
 * for the actual level formula (Foundational Level = Skill Level + offset).
 *
 * Skills absent from this map (e.g. 'human_flag', 'calisthenics_upper') have
 * no direct foundational pairing — by design.
 *
 * Shared by:
 *  - onboarding-sync.service.ts (write-time: derives the paired push/pull
 *    foundation level from an assessed skill level)
 *  - assessment-path-config.service.ts (slider-time: D3 collision
 *    suppression — a push/pull-deriving skill suppresses the direct
 *    push/pull category slider for a same-domain muscle/Health selection)
 */
export const SKILL_TO_FOUNDATION_DOMAIN: Readonly<Record<string, 'push' | 'pull'>> = {
  planche:          'push',
  handstand:        'push',
  handstand_pushup: 'push',
  hspu:             'push',
  front_lever:      'pull',
  back_lever:       'pull',
  muscle_up:        'pull',
  one_arm_pullup:   'pull',
};
