'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';

/**
 * True for a unit fitness officer (unit_admin, not a super admin). The
 * middleware admits him to a few readiness screens only, so breadcrumbs and
 * "back" links there must not point at screens he'd be bounced from.
 */
export function useIsUnitAdminViewer(): boolean {
  const [isUnitAdmin, setIsUnitAdmin] = useState(false);
  useEffect(() => onAuthStateChanged(auth, (u) => {
    if (!u) return;
    checkUserRole(u.uid, u.email)
      .then((r) => setIsUnitAdmin(r.isUnitAdmin && !r.isSuperAdmin && !r.isTenantOwner))
      .catch(() => { /* keep links; the server gate still applies */ });
  }), []);
  return isUnitAdmin;
}
