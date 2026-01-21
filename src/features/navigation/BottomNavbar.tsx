"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Map, User } from 'lucide-react'; // וודא שחבילת lucide-react מותקנת

export default function BottomNavigation() {
  const pathname = usePathname();

  // Hide on specific paths
  if (
    pathname?.startsWith('/onboarding') ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/run') ||
    pathname?.startsWith('/auth') ||
    pathname?.startsWith('/admin')
  ) {
    return null;
  }

  const navItems = [
    { name: 'פרופיל', href: '/profile', icon: User },
    { name: 'מפה', href: '/map', icon: Map },
    { name: 'בית', href: '/home', icon: Home },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex justify-around items-center z-50 shadow-lg">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-1 ${isActive ? 'text-blue-600 font-bold' : 'text-gray-400'
              }`}
          >
            <Icon size={24} strokeWidth={isActive ? 2.5 : 2} />
            <span className="text-[10px]">{item.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}