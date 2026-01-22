'use client';

import React from 'react';
import FreeRun from './FreeRun';

interface FreeRunViewProps {
  nextStation?: string;
}

/**
 * FreeRunView - Wrapper component for the modular Free Run player
 * This component now delegates to the new modular FreeRun component
 */
export const FreeRunView: React.FC<FreeRunViewProps> = () => {
  return <FreeRun />;
};
