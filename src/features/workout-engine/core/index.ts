/**
 * Workout Engine Core Barrel Export
 * Shared state, types, and services
 */

// Store
export { useSessionStore } from './store/useSessionStore';
export type { SessionMode, SessionStatus } from './store/useSessionStore';

// Types
export type { GeoPoint, Lap, ActivityType } from './types/session.types';
export * from './types/running.types';

// Services
export * from './services/storage.service';
