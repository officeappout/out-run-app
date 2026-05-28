'use client';

/**
 * PushForegroundToast — in-app banner overlay for foreground push notifications.
 *
 * When the Capacitor `notificationReceived` event fires while the app is in the
 * foreground, the native OS intentionally suppresses the system tray banner.
 * This component replaces that missing feedback by rendering a rich banner at
 * the top of the screen that matches the Out design language.
 *
 * Architecture:
 *   • `push.ts` writes to `usePushToastStore` (Zustand, callable outside React).
 *   • This component subscribes to that store and renders one card per toast.
 *   • Each card auto-dismisses after AUTO_DISMISS_MS and can be closed early.
 *   • Mounted inside `NativeBootstrap` so it lives in the root layout and is
 *     always available regardless of the active page route.
 *
 * Z-index: z-[190] — sits below the global `ToastProvider` (z-[200]) but above
 * all map overlays and drawers. See `.cursorrules` Z-Index Budget.
 */

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellRing, X } from 'lucide-react';

import {
  usePushToastStore,
  type ForegroundPushToast,
} from '@/lib/native/usePushToastStore';

const AUTO_DISMISS_MS = 5000;

// ─── Single banner card ──────────────────────────────────────────────────────

function PushToastCard({ toast }: { toast: ForegroundPushToast }) {
  const dismiss = usePushToastStore((s) => s.dismiss);

  // Auto-dismiss timer — reset if the same toast re-mounts (shouldn't happen
  // in practice since each toast has a unique `id`).
  useEffect(() => {
    const timer = setTimeout(() => dismiss(toast.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [toast.id, dismiss]);

  const isSystem = toast.channel === 'system';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.96 }}
      animate={{ opacity: 1,  y: 0,   scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.96 }}
      transition={{ type: 'spring', damping: 22, stiffness: 300 }}
      className="w-full max-w-sm pointer-events-auto"
      dir="rtl"
    >
      <div
        className={`
          flex items-start gap-3 px-4 py-3.5 rounded-2xl shadow-floating
          border backdrop-blur-sm
          ${isSystem
            ? 'bg-slate-900/95 border-slate-700 text-white'
            : 'bg-white/95 border-slate-200 text-slate-900'}
        `}
      >
        {/* Icon */}
        <div
          className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center"
          style={{
            background: 'linear-gradient(135deg,#00BAF7 0%,#0CF2E3 100%)',
          }}
        >
          {isSystem
            ? <Bell className="w-4 h-4 text-white" />
            : <BellRing className="w-4 h-4 text-white" />
          }
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          {toast.title ? (
            <p className={`text-sm font-bold leading-snug truncate ${isSystem ? 'text-white' : 'text-slate-900'}`}>
              {toast.title}
            </p>
          ) : null}
          {toast.body ? (
            <p className={`text-xs mt-0.5 leading-relaxed line-clamp-2 ${isSystem ? 'text-slate-300' : 'text-slate-500'}`}>
              {toast.body}
            </p>
          ) : null}
        </div>

        {/* Dismiss */}
        <button
          onClick={() => dismiss(toast.id)}
          className={`
            shrink-0 p-1 rounded-lg transition-colors
            ${isSystem ? 'hover:bg-white/10' : 'hover:bg-slate-100'}
          `}
          aria-label="סגור התראה"
        >
          <X className={`w-4 h-4 ${isSystem ? 'text-slate-400' : 'text-slate-400'}`} />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Container ───────────────────────────────────────────────────────────────

/**
 * Render this at the root layout level. It occupies no layout space and is
 * entirely pointer-events-none except for the interactive card areas.
 */
export default function PushForegroundToast() {
  const queue = usePushToastStore((s) => s.queue);

  return (
    <div
      className="fixed top-0 inset-x-0 z-[190] flex flex-col items-center gap-2 pointer-events-none px-4 pt-14"
      aria-live="polite"
      aria-label="התראות פוש בזמן אמת"
    >
      <AnimatePresence mode="sync">
        {queue.map((toast) => (
          <PushToastCard key={toast.id} toast={toast} />
        ))}
      </AnimatePresence>
    </div>
  );
}
