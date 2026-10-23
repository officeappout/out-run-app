'use client';

import React from 'react';
import QRCode from 'react-qr-code';

/** The join QR: dark modules on a white quiet zone so a TV-distance camera still reads it. */
export default function QrBlock({ value, size, label }: { value: string; size: number | string; label: string }) {
  return (
    <div className="inline-block rounded-2xl bg-white p-[6%]" role="img" aria-label={label} style={{ width: size, height: size }}>
      <QRCode value={value} size={256} level="M" fgColor="#0e1419" bgColor="#ffffff" style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
