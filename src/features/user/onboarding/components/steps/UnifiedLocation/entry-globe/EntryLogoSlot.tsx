'use client';

import React from 'react';
import { LOGO_SLOT_ATTR } from '@/features/user/onboarding/intro/intro-route';

/** The ring-close logo at rest: 0.32 of the overlay's 296×110 logotype. */
const W = 95;
const H = 35;

/**
 * enable_entry_intro_v1 — the OUT logotype above "בשביל ___ לא צריך כלום".
 * The intro's ring-close overlay flies its logo into this exact box (it measures
 * the element carrying LOGO_SLOT_ATTR), so when the overlay fades the logo stays.
 */
export function EntryLogoSlot() {
  return (
    <div
      className="absolute inset-x-0 flex justify-center"
      style={{ top: `calc(env(safe-area-inset-top, 0px) + 11vh - ${H + 18}px)` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...{ [LOGO_SLOT_ATTR]: '' }}
        src="/images/intro/logo-out.svg"
        alt="OUT"
        width={W}
        height={H}
        style={{ width: W, height: H }}
      />
    </div>
  );
}
