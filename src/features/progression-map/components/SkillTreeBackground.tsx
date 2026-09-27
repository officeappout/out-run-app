'use client';

/**
 * SkillTreeBackground — the scenic full-bleed background behind the tree.
 *
 * Three zones (round 3 — see progression-map-config.ts for why round 2's
 * single-repeating-tile design is gone, not patched):
 *   1. Sky — fixed band pinned at the top, never repeated.
 *   2. Middle — a generous stack of the seamless-ish green tile, each
 *      alternate copy vertically mirrored so the seam is pixel-identical
 *      at every boundary regardless of how seamless the source art
 *      actually is (the founder's own fallback instruction). Sits inside
 *      an overflow:hidden band whose height is however much space is left
 *      between the sky and garden bands — however tall the tree/ladder
 *      gets, so no measurement/JS sizing logic is needed: enough tiles are
 *      stacked to comfortably exceed any realistic tree height, and the
 *      overflow clip trims the rest.
 *   3. Garden — the full park scene, anchored at the bottom only, never
 *      repeated — where the target node sits.
 *
 * Image paths (+ the shared native aspect ratio) come from
 * progression-map-config.ts and are swappable there without touching this
 * compositing logic.
 */
import {
  PROGRESSION_MAP_SKY_IMAGE,
  PROGRESSION_MAP_PATH_MID_IMAGE,
  PROGRESSION_MAP_PATH_TILE_IMAGE,
  PROGRESSION_MAP_BG_NATIVE_ASPECT,
} from '@/lib/progression-map-config';

const SKY_HEIGHT = 220; // px — cloud strip behind the header
const GARDEN_HEIGHT = 460; // px — park/garden strip anchored at the bottom
const MID_TILE_COUNT = 24; // generous — the overflow:hidden band clips any excess

function MidBand() {
  return (
    <div
      className="absolute inset-x-0 overflow-hidden"
      style={{ top: SKY_HEIGHT, bottom: GARDEN_HEIGHT }}
    >
      {Array.from({ length: MID_TILE_COUNT }).map((_, i) => (
        <div
          key={i}
          style={{
            width: '100%',
            aspectRatio: PROGRESSION_MAP_BG_NATIVE_ASPECT,
            backgroundImage: `url(${PROGRESSION_MAP_PATH_MID_IMAGE})`,
            backgroundSize: '100% 100%',
            transform: i % 2 === 1 ? 'scaleY(-1)' : undefined,
          }}
        />
      ))}
    </div>
  );
}

export function SkillTreeBackground() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div
        className="absolute top-0 inset-x-0 bg-cover bg-top bg-no-repeat"
        style={{ backgroundImage: `url(${PROGRESSION_MAP_SKY_IMAGE})`, height: SKY_HEIGHT }}
      />

      <MidBand />

      <div
        className="absolute bottom-0 inset-x-0 bg-cover bg-bottom bg-no-repeat"
        style={{ backgroundImage: `url(${PROGRESSION_MAP_PATH_TILE_IMAGE})`, height: GARDEN_HEIGHT }}
      />
    </div>
  );
}
