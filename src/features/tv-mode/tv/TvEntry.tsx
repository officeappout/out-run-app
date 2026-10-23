'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { parseJoinInput } from '../core/code';
import { TV_CODE_PARAM } from '../core/constants';
import TvJoinLanding from '../phone/TvJoinLanding';
import TvPage from './TvPage';

function Inner() {
  const sp = useSearchParams();
  // /tv           → the TV itself.
  // /tv?code=…    → what the QR encodes: a PHONE landing (join in the app, or download it).
  if (sp.has(TV_CODE_PARAM)) return <TvJoinLanding code={parseJoinInput(sp.get(TV_CODE_PARAM) ?? '')} />;
  return <TvPage />;
}

export default function TvEntry() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
