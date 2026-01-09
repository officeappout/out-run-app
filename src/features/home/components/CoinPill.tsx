"use client";

import React from 'react';
import { useUserStore } from '@/features/user/store/useUserStore';

export default function CoinPill() {
  const { profile } = useUserStore();
  const coins = profile?.coins || 0;

  return (
    <button className="flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm border border-gray-200 active:scale-95 transition-transform">
      {/* אייקון מטבע */}
      <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center">
        <span className="text-yellow-700 font-bold text-xs">$</span>
      </div>
      
      {/* סכום */}
      <span className="text-gray-900 font-bold text-base">
        {coins.toLocaleString()}
      </span>
    </button>
  );
}
