"use client";

import React from 'react';

type TabMode = 'free' | 'plan' | 'my';

interface MapTabsProps {
  activeTab: TabMode;
  onTabChange: (tab: TabMode) => void;
}

export default function MapTabs({ activeTab, onTabChange }: MapTabsProps) {
  const tabs = [
    { id: 'my' as TabMode, label: 'שלי', icon: 'history' },
    { id: 'plan' as TabMode, label: 'תכנון', icon: 'book' },
    { id: 'free' as TabMode, label: 'חופשי', icon: 'directions_run' },
  ];

  return (
    <div className="flex bg-white/95 backdrop-blur-md rounded-2xl p-1 border border-gray-200 shadow-md">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl transition-all duration-300
              ${isActive
                ? 'bg-[#00E5FF] text-white shadow-sm font-bold'
                : 'hover:bg-gray-50 font-medium text-gray-600'
              }
            `}
          >
            <span className="material-icons-round text-sm">{tab.icon}</span>
            <span className="text-xs">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
