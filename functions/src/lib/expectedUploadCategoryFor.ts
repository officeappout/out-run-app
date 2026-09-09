/**
 * expectedUploadCategoryFor.ts — SPEC-03 Wave D.4
 *
 * Maps a Storage object path to the file category verifyUploadContentType
 * should expect there, scoped to the 3 genuinely user-facing, non-admin,
 * self-service upload paths in storage.rules (communities/{uid},
 * contribution-photos/{uid}, health-declarations/{uid}) — every other
 * path (admin-avatars, parks, authorities, locations, gear_icons, etc.)
 * is admin-only, a trusted internal user, not the threat model this
 * check exists for.
 */
export function expectedUploadCategoryFor(filePath: string): 'image' | 'pdf' | null {
  if (filePath.startsWith('communities/')) return 'image';
  if (filePath.startsWith('contribution-photos/')) return 'image';
  if (filePath.startsWith('health-declarations/')) return 'pdf';
  return null;
}
