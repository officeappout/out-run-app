'use client';

/**
 * Journey Hub Wave 2, Piece 5 (06.10.2026) — a short plain-Hebrew
 * explanation of what a metric/stage actually measures, attached next
 * to its label. Deliberately a native `title` tooltip (hover/long-press,
 * zero extra JS, works with the browser's own accessibility tree) rather
 * than a custom popover — the ask was "a short tooltip/subtitle," not a
 * new interaction pattern, and every tile across all 3 tabs needed one,
 * so the lightest-weight option that still reads correctly keyboard- and
 * screen-reader-side was the right call for a pass this wide.
 */
import { Info } from 'lucide-react';

export default function InfoHint({ text }: { text: string }) {
  return (
    <span
      title={text}
      tabIndex={0}
      className="inline-flex items-center text-gray-400 hover:text-cyan-600 cursor-help focus:outline-none focus:text-cyan-600"
    >
      <Info size={12} />
    </span>
  );
}
