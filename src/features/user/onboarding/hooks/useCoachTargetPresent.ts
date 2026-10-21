'use client';

/**
 * Coach-mark target presence: is the `data-coach="…"` element on screen (in the DOM with a
 * non-zero box)? `coachTargetVisible` is the one check every tour host uses;
 * `useCoachTargetPresent` polls it while armed (stops when disarmed).
 */
import { useEffect, useState } from 'react';

const POLL_MS = 400;

export function coachTargetVisible(target: string): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.querySelector<HTMLElement>(`[data-coach="${target}"]`);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

export function useCoachTargetPresent(target: string, armed: boolean): boolean {
  const [present, setPresent] = useState(false);
  useEffect(() => {
    if (!armed) { setPresent(false); return; }
    const tick = () => setPresent(coachTargetVisible(target));
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [target, armed]);
  return present;
}
