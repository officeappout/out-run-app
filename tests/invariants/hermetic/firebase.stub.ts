/**
 * STUB of '@/lib/firebase' for the hermetic gate / offline benchmark.
 *
 * The real src/lib/firebase.ts has the PRODUCTION project hardcoded — importing it
 * from a test or an audit script means every read/write goes to prod. This stub
 * never initializes a Firebase app. Wired in via TS `paths` (tsx) or `vi.mock`
 * (vitest); `__HERMETIC_FIREBASE__` lets a runner assert the stub is really live.
 */
export const HERMETIC = true;
(globalThis as Record<string, unknown>).__HERMETIC_FIREBASE__ = true;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = { __stub: 'firestore' } as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const auth = { currentUser: null, onAuthStateChanged: () => () => {} } as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const storage = { __stub: 'storage' } as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const app = { __stub: 'app', options: {} } as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const analytics = null as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const appCheck = null as any;
