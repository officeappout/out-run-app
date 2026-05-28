/**
 * usePushToastStore — module-level Zustand store for foreground push banners.
 *
 * Zustand's store works outside React components (`getState()` / `setState()`),
 * so the native push listener in `push.ts` can call `enqueue()` directly
 * without any React context. The `PushForegroundToast` component subscribes
 * to the queue and renders visible banners while the app is in the foreground.
 *
 * Lifecycle:
 *   1. `push.ts` `notificationReceived` handler calls `enqueue()`.
 *   2. `PushForegroundToast` reads the queue, renders each item, and auto-
 *      dismisses it after AUTO_DISMISS_MS via an internal timer.
 *   3. The user may also tap the × button to dismiss early.
 */

import { create } from 'zustand';

export interface ForegroundPushToast {
  /** Unique ID used as the React key and for dismissal. */
  id: string;
  /** Notification title (maps to FCM `notification.title`). */
  title: string;
  /** Notification body copy (maps to FCM `notification.body`). */
  body: string;
  /**
   * Delivery channel passed through FCM `data.channel` — e.g.
   * `'encouragement'`, `'system'`. Optional; used for icon tinting.
   */
  channel?: string;
}

interface PushToastState {
  queue: ForegroundPushToast[];
  /** Add a foreground toast to the tail of the display queue. */
  enqueue: (toast: ForegroundPushToast) => void;
  /** Remove a toast by ID (called by the overlay's auto-dismiss timer or user tap). */
  dismiss: (id: string) => void;
}

export const usePushToastStore = create<PushToastState>((set) => ({
  queue: [],
  enqueue: (toast) => set((s) => ({ queue: [...s.queue, toast] })),
  dismiss: (id) => set((s) => ({ queue: s.queue.filter((t) => t.id !== id) })),
}));
