'use client';

import React from 'react';

export interface RunDataStripItem {
  value: string;
  label: string;
  tone?: string;
}

/** The slim data strip attached to the header: pace · time · km (or speed · time · km), three equal cells. */
export default function RunDataStrip({ items }: { items: RunDataStripItem[] }) {
  return (
    <div className="flex items-center px-2 pt-1.5">
      {items.map((it, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span aria-hidden className="h-[30px] w-px bg-slate-200" />}
          <span className="flex flex-1 flex-col items-center">
            <span dir="ltr" className="text-[24px] font-black leading-[26px] tabular-nums" style={{ letterSpacing: '-0.02em', color: it.tone ?? '#0e1419' }}>{it.value}</span>
            <span className="mt-0.5 text-[11.5px] font-bold text-slate-500">{it.label}</span>
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}
