"use client";

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Home, MapPin, User } from 'lucide-react';

export default function BottomNavigation() {
  const router = useRouter();
  const pathname = usePathname();

  const navItems = [
    {
      id: 'home',
      label: 'בית',
      icon: Home,
      path: '/',
    },
    {
      id: 'map',
      label: 'מפה',
      icon: MapPin,
      path: '/map',
    },
    {
      id: 'profile',
      label: 'פרופיל',
      icon: User,
      path: '/profile',
    },
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return pathname === '/';
    }
    return pathname?.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg safe-area-bottom">
      <div className="max-w-md mx-auto px-4 py-2 flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          
          return (
            <button
              key={item.id}
              onClick={() => router.push(item.path)}
              className={`
                flex flex-col items-center justify-center gap-1 px-4 py-2 rounded-xl transition-all duration-200
                ${active 
                  ? 'text-[#00C9F2] bg-[#00C9F2]/10' 
                  : 'text-gray-500 hover:text-gray-700'
                }
              `}
            >
              <Icon className={`w-6 h-6 ${active ? 'stroke-[2.5]' : ''}`} />
              <span className={`text-xs font-medium ${active ? 'font-bold' : ''}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
