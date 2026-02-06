/**
 * Workout Engine Core Barrel Export
 * Shared state, types, and services
 */

// Store
export { useSessionStore } from './store/useSessionStore';
export type { SessionMode, SessionStatus } from './store/useSessionStore';

// Types - Session
export type { GeoPoint, Lap, ActivityType } from './types/session.types';
export * from './types/running.types';

// Types - Tracking Matrix (Shadow Progression)
export * from './types/tracking-matrix.types';

// Types - Blueprint & Slots
export * from './types/blueprint.types';

// Services
export * from './services/storage.service';
