/**
 * WHO 2020 weekly strength target — ≥2 days/week. Extracted from
 * `weekly-load.service.ts` (which imports `firebase/firestore` at the top
 * level for its other exports) into its own pure, zero-import file so
 * modules that must stay import-graph-pure (crossDomainRules.ts's R7 floor
 * documentation, weaverInput.ts) can import the real constant instead of
 * carrying their own hardcoded copy of the same number.
 *
 * Approved 08.07.2026, per `weekly-load.service.ts`'s own original doc
 * comment — not re-derived here, just relocated.
 */
export const WHO_STRENGTH_TARGET_DAYS = 2;

/** WHO 2020 weekly aerobic target, moderate-equivalent minutes (relocated alongside the strength target, same reason). */
export const WHO_AEROBIC_TARGET_MIN = 150;
/** 1 vigorous (running) minute ≡ 2 moderate minutes (WHO equivalence, approved 08.07.2026). */
export const RUNNING_MODERATE_EQUIV_FACTOR = 2;
