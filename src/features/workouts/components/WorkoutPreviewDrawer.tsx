/**
 * Non-breaking re-export shim.  The orchestrator now lives at
 * `./workout-preview-drawer/WorkoutPreviewDrawer.tsx` alongside its
 * types, hooks, utils, and sub-components.  Every legacy import path
 * (`@/features/workouts/components/WorkoutPreviewDrawer`) continues to
 * resolve to the same default export via this shim.
 */
export { default } from './workout-preview-drawer';
