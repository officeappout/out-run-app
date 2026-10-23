'use client';

import React from 'react';
import { initialOf, participantColor } from '../core/participants';

/** Round coloured initial — same colour for the same person on the TV and on every phone. */
export default function Avatar({ uid, name, avatar, size = 40, ring = true }: { uid: string; name: string; /** The doc's default-avatar index (colour); falls back to the uid. */ avatar?: number; size?: number; ring?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-grid shrink-0 place-items-center rounded-full font-black text-white"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: participantColor(uid, avatar),
        boxShadow: ring ? '0 0 0 2px #fff' : undefined,
      }}
    >
      {initialOf(name)}
    </span>
  );
}
