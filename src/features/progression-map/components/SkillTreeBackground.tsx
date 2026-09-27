'use client';

/**
 * SkillTreeBackground — the scenic full-bleed background behind the tree.
 *
 * Two layers, both absolutely positioned behind the actual content
 * (z-index handled by the caller wrapping this + content in a `relative`
 * parent, this component itself is `absolute inset-0 -z-10`):
 *   - Sky (clouds) pinned at a fixed height at the very top.
 *   - Path tile (the park scenery) starts right where the sky band ends and
 *     tiles vertically (CSS background-repeat: repeat-y) so it always
 *     covers the full height of the tree, however tall — no blank area,
 *     however many levels the ladder has.
 *
 * Image paths come from progression-map-config.ts (swappable without a code
 * change); only the compositing logic — sky height, tile sizing — lives here.
 */
import { PROGRESSION_MAP_SKY_IMAGE, PROGRESSION_MAP_PATH_TILE_IMAGE } from '@/lib/progression-map-config';

const SKY_BAND_HEIGHT = 220; // px — just enough for a cloud strip behind the header

export function SkillTreeBackground() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div
        className="absolute top-0 inset-x-0 bg-cover bg-top bg-no-repeat"
        style={{ backgroundImage: `url(${PROGRESSION_MAP_SKY_IMAGE})`, height: SKY_BAND_HEIGHT }}
      />
      <div
        className="absolute inset-x-0 bottom-0"
        style={{
          top: SKY_BAND_HEIGHT,
          backgroundImage: `url(${PROGRESSION_MAP_PATH_TILE_IMAGE})`,
          backgroundRepeat: 'repeat-y',
          backgroundPosition: 'top center',
          backgroundSize: '100% auto',
        }}
      />
    </div>
  );
}
