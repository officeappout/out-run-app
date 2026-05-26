/**
 * Public barrel for the WorkoutPreviewDrawer module.
 *
 * The orchestrator is the only public surface — every internal hook,
 * type, util, and sub-component is reached via the orchestrator's
 * composition (or via direct relative imports if a downstream feature
 * truly needs one of them, but no external import path should land
 * here without an explicit re-export below).
 */
export { default } from './WorkoutPreviewDrawer';
