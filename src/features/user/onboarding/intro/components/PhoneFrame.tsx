'use client';

import React from 'react';

export const PHONE_W = 236;
export const PHONE_H = 640;

/**
 * A small phone (enable_entry_intro_v1): dark bezel ring, rounded screen, the
 * Dynamic-Island pill. The screen content is the children (the app-screen image,
 * the lock screen over it). 236×640 canvas px — the app screens are 236×611 @3x.
 */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative overflow-hidden rounded-[38px] bg-[#f8fafc]"
      style={{
        width: PHONE_W,
        height: PHONE_H,
        boxShadow: '0 0 0 7px #0e1419, 0 30px 60px rgba(14,20,25,0.25)',
      }}
    >
      {children}
      <div className="absolute left-1/2 top-2 z-30 h-5 w-[74px] -translate-x-1/2 rounded-full bg-[#0e1419]" />
    </div>
  );
}
