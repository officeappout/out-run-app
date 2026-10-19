'use client';

/**
 * HybridStationHostV2 — today's station runtime (HybridStationLayer:
 * StrengthRunner, which renders the v2 strength player under the flag, the
 * in-station swap, "דלג") in its v2 mode: only once the transition countdown
 * has handed over to the station.
 */

import React from 'react';
import HybridStationLayer from '../HybridStationLayer';
import { useHybridPlayerV2 } from './HybridPlayerV2Context';

export default function HybridStationHostV2() {
  const api = useHybridPlayerV2();
  // Sequencer not running (should not happen) → never block the station.
  return <HybridStationLayer v2={{ hold: !!api?.enabled && api.view?.phase !== 'station' }} />;
}
