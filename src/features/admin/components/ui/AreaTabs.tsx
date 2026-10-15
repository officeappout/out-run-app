'use client';

import { usePathname } from 'next/navigation';
import { auth } from '@/lib/firebase';
import { isRootAdmin } from '@/config/feature-flags';
import { AreaTabs } from './index';

/**
 * Screens that used to be separate menu items, joined as one area with tabs
 * (audit 15.10.2026). The sidebar links the area once; the tabs move inside.
 */

/** "ציוד ומתקנים": park machines, brands, personal gear, and the audit */
export function EquipmentTabs() {
  const pathname = usePathname() ?? '';
  const tabs = [
    { href: '/admin/gym-equipment', label: 'מתקנים בפארקים' },
    { href: '/admin/brands', label: 'מותגי מתקנים' },
    { href: '/admin/gear-definitions', label: 'ציוד אישי' },
    { href: '/admin/audit-equipment', label: 'ביקורת ציוד בתרגילים' },
  ];
  const current = tabs.find((t) => pathname.startsWith(t.href))?.href ?? tabs[0].href;
  return <AreaTabs tabs={tabs} current={current} />;
}

/** "אנשים והרשאות": admins, invitations directory, users & admin rights */
export function PeopleTabs() {
  const pathname = usePathname() ?? '';
  const root = isRootAdmin(auth.currentUser?.email);
  const tabs = [
    { href: '/admin/users', label: 'משתמשים והרשאות מנהל' },
    // both screens below are root-only pages; a tab that bounces is worse than none
    { href: '/admin/admins-management', label: 'מנהלי מערכת', hidden: !root },
    { href: '/admin/admin-directory', label: 'ספריית מנהלים והזמנות', hidden: !root },
  ];
  if (tabs.filter((t) => !t.hidden).length < 2) return null;
  const current = tabs.find((t) => pathname === t.href || pathname.startsWith(`${t.href}/`))?.href ?? tabs[0].href;
  return <AreaTabs tabs={tabs} current={current} />;
}
