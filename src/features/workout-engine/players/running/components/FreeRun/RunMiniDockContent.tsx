'use client';

/**
 * RunMiniDockContent — shared between FreeRunOverlay (dock anchor) and
 * FreeRunLayer's minimized MiniDock (laps-open state).
 *
 * isLapsOpen=false → distance · time · goal % (no stop button)
 * isLapsOpen=true  → distance · time · goal % + stop button
 */

export { RunMiniDockContent } from './FreeRunOverlay';
