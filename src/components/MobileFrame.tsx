'use client';

import React from 'react';

interface MobileFrameProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * MobileFrame - iPhone-style mockup component
 * Wraps content in a realistic mobile device frame
 */
export default function MobileFrame({ children, className = '' }: MobileFrameProps) {
  return (
    <div className={`relative ${className}`}>
      {/* iPhone Frame */}
      <div className="relative bg-black rounded-[3rem] p-2 shadow-2xl" style={{ width: '375px', height: '812px' }}>
        {/* Notch */}
        <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-10"></div>
        
        {/* Screen */}
        <div className="w-full h-full bg-white rounded-[2.5rem] overflow-hidden relative">
          {children}
        </div>
      </div>
    </div>
  );
}
