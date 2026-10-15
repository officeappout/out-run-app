/**
 * recenter-control — the map's single centering/orientation control during an active session
 * (G2.6, Sderot pilot). Pure; MapShell renders it.
 *
 * Camera/follow state machine it sits on (unchanged, useCameraController):
 *   owner 'follow' ⇄ 'user': any touch/drag on the map → 'user' (camera stops, eases flat +
 *   north, owner's follow flag → false, 15 s idle timer armed); the timer, or this control,
 *   → 'follow' again. Separately TurnCarousel can lock the camera on a previewed turn card
 *   (useMapStore.cameraMode 'preview_step'); the follow effect yields while locked.
 * This control: NOT following (flag false, or a turn-preview lock) → "מרכז אותי" = release the
 * lock + re-enable follow. Following → toggle the follow bearing heading-up ⇄ north-up.
 */
export type HeadingMode = 'course' | 'north';

export function isFollowingNow(isMapFollowEnabled: boolean, cameraMode: string): boolean {
  return isMapFollowEnabled && cameraMode !== 'preview_step';
}

export function recenterControlLabel(following: boolean, headingMode: HeadingMode): string {
  if (!following) return 'מרכז אותי';
  return headingMode === 'course' ? 'כיוון הליכה' : 'צפון למעלה';
}
