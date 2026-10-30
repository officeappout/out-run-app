'use client';
/** A full-screen layer above every sheet (same layer as FirstRunTour), for CoachMarks hosts. */
import React from 'react';
import { createPortal } from 'react-dom';

export default function TutorialPortal({ children, passThrough = false }: { children: React.ReactNode; passThrough?: boolean }) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className={`fixed inset-0 z-[1000]${passThrough ? ' pointer-events-none' : ''}`}>{children}</div>,
    document.body,
  );
}
