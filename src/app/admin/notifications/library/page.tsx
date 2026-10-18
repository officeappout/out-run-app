'use client';

export const dynamic = 'force-dynamic';

/**
 * /admin/notifications/library — ספריית פושים. Thin route wrapper; the
 * screen lives in src/features/admin/components/push-library/. Access: same
 * as /admin/notifications (marketing section, adminSections.ts prefix match).
 */
import { PushLibraryManager } from '@/features/admin/components/push-library/PushLibraryManager';

export default function PushLibraryPage() {
  return <PushLibraryManager />;
}
