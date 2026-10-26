/**
 * minimized-layer — how the classic player's active view behaves while the
 * drawer is dragged down to the mini bar (pure).
 *
 * Pilot M20: the active view used to UNMOUNT when minimized, and its timer card
 * keeps its clock in local state, so dragging the drawer down and up restarted a
 * running tabata / hold interval from zero. The view now stays mounted and is
 * only hidden (display:none keeps its intervals running).
 */
export function keepActiveMounted(isMinimized: boolean): { mounted: true; className: string } {
  return {
    mounted: true,
    className: isMinimized ? 'hidden' : 'relative w-full h-full overflow-hidden',
  };
}
