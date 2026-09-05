'use client';

/**
 * Real unit insignia when available, hash-derived colored badge otherwise —
 * the fallback is the DEFAULT, not the exception (David, 05.09.2026: 102 of
 * 176 battalions have no icon; a build that shows real images first and
 * falls back second would look broken for most of the list).
 *
 * Real icons render inside a neutral white circle regardless of their own
 * background — 4 of the 74 approved icons are photos with an opaque,
 * non-transparent background (metal-badge photos that couldn't be
 * knocked out without manual cutting); a white circular backing plate
 * behind them (object-contain, not cover — nothing gets cropped) reads as
 * "mounted on a card" instead of "a patch stuck directly on the list."
 * The exact same wrapper also gives the 70 genuinely-transparent icons a
 * clean, uniform look instead of showing the surrounding theme color
 * bleeding through. The fallback badge is deliberately NOT circular/white —
 * it keeps its own hash-derived color, same visual language as
 * HierarchySearchStep's existing tenantType icon boxes.
 *
 * Hash+palette is the exact mechanism NeighborhoodLeaderboard.tsx already
 * uses for individual-user avatar fallbacks (avatarGradient) — reused
 * verbatim rather than inventing a second one, per David's own instruction
 * to follow an existing pattern instead of a new mechanism.
 */

import { badgeGradient, unitBadgeGlyph } from './unit-icon-badge-logic';

export interface UnitIconBadgeProps {
  /** Hash seed — the real unit's own id, not its display name (stable even
   *  if the name is edited later; matches avatarGradient's own seed choice). */
  unitId: string;
  iconUrl?: string | null;
  /** Real military designator, when known explicitly — shown as the
   *  fallback glyph. displayNumber isn't synced onto unitDirectory (only
   *  the source tenants/.../units doc has it), so most callers won't have
   *  this — omit it and the embedded number is extracted from `name`
   *  instead (every "גדוד 51"/"חטיבה 810"-style name already carries it).
   *  Falls back further to the name's first character for a genuinely
   *  nameless unit (סיירות, חטמ״רים — see src/lib/unit-id.ts). */
  displayNumber?: number | null;
  name: string;
  /** px, both dimensions — default matches the existing 40×40 icon boxes
   *  already used elsewhere on the units admin page. */
  size?: number;
}

export default function UnitIconBadge({ unitId, iconUrl, displayNumber, name, size = 40 }: UnitIconBadgeProps) {
  const style = { width: size, height: size };

  if (iconUrl) {
    return (
      <div
        className="rounded-full bg-white flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm border border-slate-100"
        style={style}
      >
        {/* object-contain, not cover — a photo icon's own non-transparent
            background stays fully visible rather than being cropped. */}
        <img src={iconUrl} alt={name} className="w-full h-full object-contain p-0.5" />
      </div>
    );
  }

  const glyph = unitBadgeGlyph(name, displayNumber);
  const fontSize = glyph.length > 3 ? size * 0.28 : size * 0.36;

  return (
    <div
      className="rounded-xl flex items-center justify-center flex-shrink-0 text-white font-bold"
      style={{ ...style, background: badgeGradient(unitId), fontSize }}
    >
      {glyph}
    </div>
  );
}
