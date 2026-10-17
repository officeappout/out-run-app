'use client';

/**
 * EdgeSwipeBack — iOS-style interactive back swipe for the Capacitor iOS app.
 * Behind enable_home_v2. Renders nothing.
 *
 * Why JS and not WKWebView's own gesture: ios/App/App/ViewController.swift
 * already sets `allowsBackForwardNavigationGestures = true`, but that class
 * never runs — it is not in the App target (project.pbxproj has no
 * ViewController.swift) and Main.storyboard instantiates Capacitor's own
 * CAPBridgeViewController. Wiring it needs Xcode + a TestFlight build (see the
 * PR). This handler ships with a web deploy instead. If the native gesture is
 * ever wired, turn this one off on iOS — both at once would go back twice.
 *
 * Gesture (RTL — see edge-swipe-back.ts): a touch that starts in the right
 * edge strip and moves left drags the page (<main>) with the finger; release
 * past ~35% of the width or a quick flick → router.back(), else it springs
 * back. Only iOS native: Android has its own system back gesture (handled in
 * src/lib/native/init.ts), and mobile Safari has its own browser swipe.
 *
 * Never starts when:
 *   • the route has no back / owns horizontal drags (isSwipeBackRoute),
 *   • there is no in-app page to go back to (cold start on a deep link),
 *   • a workout/run is active or paused,
 *   • the touch is inside a fixed element (sheets, modals, overlays, bars),
 *     a horizontal scroller (carousels, chip rows), a range input, a map
 *     canvas, or anything marked data-no-swipe-back,
 *   • the page scroll is locked (a modal is open) or a dialog is open.
 */

import { useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import { useSessionStore } from '@/features/workout-engine/core/store/useSessionStore';
import {
  LOCK_SLOP_PX,
  isSwipeBackRoute,
  nextNavStack,
  shouldCommitSwipe,
  startsAtBackEdge,
} from '@/lib/native/edge-swipe-back';

const EASE = 'cubic-bezier(0.23, 1, 0.32, 1)'; // ease-v2

function isIOSNative(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as unknown as {
    Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string };
  }).Capacitor;
  return Boolean(cap?.isNativePlatform?.()) && cap?.getPlatform?.() === 'ios';
}

/** Something under the finger that owns horizontal drags, or sits above the page. */
function touchBlocked(target: EventTarget | null, main: HTMLElement): boolean {
  if (!(target instanceof Element) || !main.contains(target)) return true;
  if (document.body.style.overflow === 'hidden') return true;
  if (document.querySelector('[aria-modal="true"], [role="dialog"]')) return true;
  for (let el: Element | null = target; el && el !== main; el = el.parentElement) {
    if (el instanceof HTMLElement) {
      if (el.dataset.noSwipeBack !== undefined) return true;
      if (el instanceof HTMLInputElement && el.type === 'range') return true;
      if (el.tagName === 'CANVAS' || el.classList.contains('mapboxgl-map')) return true;
      const cs = window.getComputedStyle(el);
      if (cs.position === 'fixed') return true;
      if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) return true;
    }
  }
  return false;
}

export default function EdgeSwipeBack() {
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;

  const stackRef = useRef<string[]>([]);
  const navigatingRef = useRef(false);

  // In-app history + finishing a committed swipe once the previous page is in.
  useEffect(() => {
    stackRef.current = nextNavStack(stackRef.current, pathname);
    if (!navigatingRef.current) return;
    navigatingRef.current = false;
    const main = document.getElementById('main-content');
    if (!main) return;
    main.style.transition = 'none';
    main.style.transform = '';
    main.style.boxShadow = '';
    main.animate?.([{ opacity: 0.6 }, { opacity: 1 }], { duration: 160, easing: EASE });
  }, [pathname]);

  useEffect(() => {
    if (!v2 || !isIOSNative()) return;
    const main = document.getElementById('main-content');
    if (!main) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    let tracking = false; // touch began at the edge, direction not decided yet
    let dragging = false; // locked as a horizontal back swipe
    let startX = 0;
    let startY = 0;
    let dx = 0;
    let lastX = 0;
    let lastT = 0;
    let vx = 0;

    const reset = (animate: boolean) => {
      main.style.transition = animate ? `transform 260ms ${EASE}` : 'none';
      main.style.transform = '';
      if (animate) {
        window.setTimeout(() => {
          if (!dragging) { main.style.transition = ''; main.style.boxShadow = ''; }
        }, 280);
      } else {
        main.style.boxShadow = '';
      }
    };

    const onStart = (e: TouchEvent) => {
      tracking = false;
      dragging = false;
      if (navigatingRef.current || e.touches.length !== 1) return;
      const t = e.touches[0];
      if (!startsAtBackEdge(t.clientX, window.innerWidth)) return;
      if (!isSwipeBackRoute(window.location.pathname)) return;
      if (stackRef.current.length < 2) return;
      const { status } = useSessionStore.getState();
      if (status === 'active' || status === 'paused') return;
      if (touchBlocked(e.target, main)) return;
      tracking = true;
      startX = lastX = t.clientX;
      startY = t.clientY;
      lastT = e.timeStamp;
      dx = 0;
      vx = 0;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const t = e.touches[0];
      const mx = t.clientX - startX;
      const my = t.clientY - startY;
      if (!dragging) {
        if (Math.abs(mx) < LOCK_SLOP_PX && Math.abs(my) < LOCK_SLOP_PX) return;
        // Vertical first, or moving the wrong way → leave it to the page.
        if (Math.abs(my) > Math.abs(mx) || mx > 0) { tracking = false; return; }
        dragging = true;
        if (!reduceMotion) {
          main.style.transition = 'none';
          main.style.boxShadow = '14px 0 28px -14px rgba(9,30,50,0.35)';
        }
      }
      e.preventDefault(); // the page must not scroll under a back swipe
      dx = Math.min(0, mx);
      const dt = e.timeStamp - lastT;
      if (dt > 0) vx = (t.clientX - lastX) / dt;
      lastX = t.clientX;
      lastT = e.timeStamp;
      if (!reduceMotion) main.style.transform = `translate3d(${dx}px,0,0)`;
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;
      const width = window.innerWidth;
      if (shouldCommitSwipe(dx, vx, width)) {
        navigatingRef.current = true;
        if (reduceMotion) {
          router.back();
          return;
        }
        main.style.transition = `transform 200ms ${EASE}`;
        main.style.transform = `translate3d(${-width}px,0,0)`;
        window.setTimeout(() => router.back(), 200);
        // Safety: if the route never changes (nothing to go back to after
        // all), bring the page back instead of leaving it off-screen.
        window.setTimeout(() => {
          if (navigatingRef.current) { navigatingRef.current = false; reset(true); }
        }, 1200);
      } else {
        reset(!reduceMotion);
      }
    };

    const onCancel = () => {
      if (dragging) reset(!reduceMotion);
      tracking = false;
      dragging = false;
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
      main.style.transition = '';
      main.style.transform = '';
      main.style.boxShadow = '';
    };
  }, [v2, router]);

  return null;
}
