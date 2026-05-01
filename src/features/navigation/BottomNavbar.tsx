"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Home, Map, Users, Swords } from 'lucide-react';
import { useSessionStore } from '@/features/workout-engine';
import { useUserStore } from '@/features/user';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useMapStore } from '@/features/parks/core/store/useMapStore';

export default function BottomNavigation() {
  const pathname = usePathname();
  const { status } = useSessionStore();
  const profile = useUserStore((s) => s.profile);
  const isSuperAdmin = !!(profile?.core as any)?.isSuperAdmin;
  const { flags } = useFeatureFlags(isSuperAdmin);

  // Map sub-states (PlannedPreview / Navigate / Builder layers) request the
  // navbar slide out via `useSuppressBottomNav()`. We read the counter as
  // a derived boolean so the bar is hidden whenever ANY suppressor is up.
  const isSuppressed = useMapStore((s) => s.bottomNavSuppressionCount > 0);

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
    <motion.nav
      // y:'100%' slides the entire bar (incl. its safe-area padding) below
      // the viewport so the map's own bottom-anchored CTA cards have the
      // full width of the bottom safe-area to themselves. ~250ms tween,
      // standard material easing — fast enough to feel native, slow enough
      // not to startle the user.
      initial={false}
      animate={{ y: isSuppressed ? '100%' : '0%' }}
      transition={{ type: 'tween', duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
      // pointer-events:none while hidden so users can't accidentally tap
      // through to a hidden tab from the layer card sitting above.
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        pointerEvents: isSuppressed ? 'none' : 'auto',
        willChange: 'transform',
      }}
      aria-hidden={isSuppressed}
      className="fixed bottom-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-xl border-t border-gray-200/60 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
    >
      {/* Tightened from pt-2 → pt-0.5 so the bar sits ~6px shorter on iPhone
          (≈80px total vs the previous 86px) — closer to the native iOS
          tab-bar height (≈83px including its own safe-area inset) without
          shrinking the 44×44 hit target Apple HIG requires. */}
      <div className="flex justify-around items-center px-4 pt-0.5 pb-0">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');

          return (
            <Link
              key={item.href}
              href={item.href}
              tabIndex={isSuppressed ? -1 : 0}
              className={`flex flex-col items-center justify-center gap-0.5 min-h-[44px] min-w-[44px] px-3 rounded-xl transition-all ${
                isActive ? 'text-[#00C9F2]' : 'text-gray-900'
              }`}
            >
              <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
              <span className={`text-[10px] leading-none ${isActive ? 'font-bold' : 'font-medium'}`}>
                {item.name}
              </span>
            </Link>
          );
        })}
      </div>
    </motion.nav>
  );
}
