'use client';

import { createContext, useContext } from 'react';

/**
 * enable_home_v2 — styling-only switch for the strength player.
 *
 * StrengthRunner (the player root) reads the flag ONCE and provides it here;
 * every player component reads it with `useStrengthPlayerV2()`. Default false →
 * any component rendered outside the player (or with the flag off) renders
 * exactly today's UI. Only classNames/colours/icons fork on it — never
 * handlers, timers, audio, gestures or data.
 */
const StrengthPlayerV2Context = createContext(false);

export const StrengthPlayerV2Provider = StrengthPlayerV2Context.Provider;

export function useStrengthPlayerV2(): boolean {
  return useContext(StrengthPlayerV2Context);
}
