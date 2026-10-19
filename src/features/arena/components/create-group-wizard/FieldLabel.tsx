'use client';

import React from 'react';
import { WizardV2 } from './wizard-v2';

export function FieldLabel({ children }: { children: React.ReactNode }) {
  const v2 = React.useContext(WizardV2);
  return (
    <label className={v2 ? 'mb-2 block whitespace-nowrap text-[13px] font-extrabold text-v2-deep' : 'block text-xs font-bold text-gray-500 mb-1.5'}>
      {children}
    </label>
  );
}
