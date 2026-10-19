'use client';

import React from 'react';
import { highlightParts } from '../core/text';

/** The title with the typed text in bold. */
export default function Highlight({ text, query }: { text: string; query?: string }) {
  if (!query) return <>{text}</>;
  return (
    <>
      {highlightParts(text, query).map((p, i) =>
        p.match ? <b key={i} className="font-black text-[#04222b]">{p.text}</b> : <React.Fragment key={i}>{p.text}</React.Fragment>,
      )}
    </>
  );
}
