'use client';

/**
 * Hides the global BottomNavbar while the calling component is mounted.
 * The counter lives in src/lib/bottom-nav-suppression.ts (shared with the v2
 * sheets); this path stays for the map layers that already import it.
 */
export { useSuppressBottomNav } from '@/lib/bottom-nav-suppression';
