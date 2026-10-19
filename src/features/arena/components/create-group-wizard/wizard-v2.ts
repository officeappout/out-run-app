import React from 'react';

/** Home v2 (enable_home_v2) for the wizard's step components. */
export const WizardV2 = React.createContext(false);

/** v2 class strings shared by the steps (design language v2). */
export const V2C = {
  input:
    'h-12 w-full rounded-[16px] bg-white px-4 text-[15px] font-semibold text-v2-ink shadow-v2-ring outline-none placeholder:text-v2-muted focus:ring-2 focus:ring-v2-accent',
  textarea:
    'w-full resize-none rounded-[16px] bg-white px-4 py-3 text-[15px] font-medium leading-relaxed text-v2-ink shadow-v2-ring outline-none placeholder:text-v2-muted focus:ring-2 focus:ring-v2-accent',
  counter: 'mt-1 text-left text-[11px] font-bold tabular-nums text-v2-muted',
  chipOn: 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40',
  chipOff: 'bg-white text-v2-ink-2 shadow-v2-ring',
  cardOn: 'bg-white shadow-v2-card ring-2 ring-v2-accent',
  cardOff: 'bg-white shadow-v2-ring',
  press: 'transition-[transform,box-shadow,background-color] duration-150 ease-v2 active:scale-[0.97]',
  hint: 'text-[12px] font-bold text-v2-muted',
};
