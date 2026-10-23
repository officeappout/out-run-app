'use client';

/** Activity icon tile in the hub's colours (steps & walking orange). Glyphs are the tab's own. */
import { KindGlyph } from '../../components/KindIcon';
import { HUB_COLORS, type HubKind } from '../hub-colors';

export default function HubKindIcon({ kind, size = 32 }: { kind: HubKind; size?: number }) {
  const tone = HUB_COLORS[kind];
  return (
    <span
      aria-hidden
      data-hub-kind={kind}
      className="inline-grid shrink-0 place-items-center rounded-[10px]"
      style={{ width: size, height: size, background: tone.tile, color: tone.text }}
    >
      <KindGlyph kind={kind} />
    </span>
  );
}
