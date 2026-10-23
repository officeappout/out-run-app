'use client';

import { createContext, useContext } from 'react';
import { WIDE_OFF, type WideLayout } from './wide-layout-logic';

/**
 * enable_wide_player_v1 — provided once by StrengthRunner; every player piece
 * with a wide variant reads it with `useWidePlayer()`. Default = off, so
 * anything rendered outside the player (or with the flag off) is unchanged.
 */
const WidePlayerContext = createContext<WideLayout>(WIDE_OFF);

export const WidePlayerProvider = WidePlayerContext.Provider;

export function useWidePlayer(): WideLayout {
  return useContext(WidePlayerContext);
}
