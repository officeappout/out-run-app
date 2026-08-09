'use client';

import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import type { CompiledLegPlanRoute } from '../services/leg-plan.service';

const ACCENT = '#00ADEF';
const AUTO_START_MS = 1600;

/**
 * Lightweight "about to start" preview for a composed leg-plan run
 * (ג', 08.08 — David's settle-preview-lite recommendation after Phase 2
 * felt too sudden: jump straight into the active-workout HUD with no
 * glimpse of the route). Mounted by DiscoverLayer AFTER the drawer has
 * already exited (mapMode → 'idle') and the compiled route has been
 * drawn via logic.setFocusedRoute, so the map is genuinely visible
 * underneath this card.
 *
 * Deliberately NOT a copy of hybrid's settle-preview: no debounce, no
 * compose call, no cache, no flow-id race guard — compileLegPlan
 * already ran inside LegPlanSheet before this component ever mounts,
 * so there's nothing left to compute here, only to show and confirm.
 *
 * Auto-confirms after ~1.6s (visualised by the progress bar); a tap
 * anywhere on the card confirms immediately. z-[60] — same tier as
 * WorkoutDrawer/RoutePreviewCard (.cursorrules) since this is the same
 * kind of thing: a route-preview card floating over the map, mutually
 * exclusive with the drawer (already unmounted by the time this shows).
 */
export default function LegPlanStartPreview({
  compiled,
  onConfirm,
}: {
  compiled: CompiledLegPlanRoute;
  onConfirm: () => void;
}) {
  const firedRef = useRef(false);

  const confirmOnce = () => {
    if (firedRef.current) return;
    firedRef.current = true;
    onConfirm();
  };

  useEffect(() => {
    const t = setTimeout(confirmOnce, AUTO_START_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const legCount = compiled.legBreakdown.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed left-0 right-0 z-[60] px-5 pointer-events-none"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
    >
      <button
        type="button"
        onClick={confirmOnce}
        className="w-full bg-white rounded-3xl shadow-2xl overflow-hidden pointer-events-auto text-right active:scale-[0.98] transition-transform"
        dir="rtl"
        aria-label="התחל ריצה עכשיו"
      >
        {/* Auto-start progress bar */}
        <div className="h-1 bg-gray-100 overflow-hidden">
          <motion.div
            className="h-full"
            style={{ backgroundColor: ACCENT }}
            initial={{ width: '0%' }}
            animate={{ width: '100%' }}
            transition={{ duration: AUTO_START_MS / 1000, ease: 'linear' }}
          />
        </div>

        <div className="px-5 py-4 flex items-center justify-between gap-3">
          <div>
            <p className="text-[13px] font-black text-gray-900">🏁 המסלול מוכן — מתחילים...</p>
            <p className="text-[12px] text-gray-400 font-bold mt-0.5">
              {legCount} עצירות · {compiled.route.distance.toFixed(1)} ק״מ · {compiled.route.duration} דק׳
            </p>
          </div>
          <span
            className="shrink-0 text-[12px] font-black px-3 py-1.5 rounded-full text-white"
            style={{ backgroundColor: ACCENT }}
          >
            התחל עכשיו
          </span>
        </div>
      </button>
    </motion.div>
  );
}
