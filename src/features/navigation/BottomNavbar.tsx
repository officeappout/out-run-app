"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Map, Users, Swords } from 'lucide-react';
import { useSessionStore } from '@/features/workout-engine';
import { useUserStore } from '@/features/user';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';

export default function BottomNavigation() {
  const pathname = usePathname();
  const { status } = useSessionStore();
  const profile = useUserStore((s) => s.profile);
  const isSuperAdmin = !!(profile?.core as any)?.isSuperAdmin;
  const { flags } = useFeatureFlags(isSuperAdmin);

  if (
    pathname?.startsWith('/onboarding') ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/run') ||
    pathname?.startsWith('/auth') ||
    pathname?.startsWith('/admin') ||
    pathname?.includes('/active')
  ) {
    return null;
  }

  if (status === 'active' || status === 'paused') {
    return null;
  }

  const navItems = [
    { name: 'בית',   href: '/home',  icon: Home },
    { name: 'מפה',   href: '/map',   icon: Map },
    ...(flags.enableCommunityFeed
      ? [
          { name: 'קהילה', href: '/feed',  icon: Users },
          { name: 'הליגה', href: '/arena', icon: Swords },
        ]
      : []),
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t border-gray-200/60 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex justify-around items-center px-4 pt-2 pb-0">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 min-h-[44px] min-w-[44px] px-3 rounded-xl transition-all ${
                isActive ? 'text-[#00C9F2]' : 'text-gray-900'
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
