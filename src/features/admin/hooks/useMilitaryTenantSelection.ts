'use client';

import { useState, useEffect, useCallback } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole } from '@/features/admin/services/auth.service';

/**
 * Same key /admin/dashboard's existing super-admin authority-switcher and
 * the vertical-overview list's row-click already use (kept as a literal
 * here too, matching that file's own comment on why: not imported, so a
 * selection made on any of these screens is immediately visible to all
 * the others without any shared module coupling them).
 */
const AUTHORITY_STORAGE_KEY = 'admin_selected_authority_id';

export interface MilitaryTenantOption {
  id: string;
  name: string;
}

export interface MilitaryTenantSelection {
  /** True while the caller's role is still being resolved — every other field is meaningless until this is false. */
  roleLoading: boolean;
  /**
   * True for root or a readiness chief officer — anyone with no OWN
   * brigade who must explicitly pick one. False for a real tenant_owner/
   * unit_admin, whose existing behavior must stay byte-for-byte
   * unchanged: they never see this, never pick anything, their own
   * tenant is resolved server-side from scope exactly as before this
   * hook existed.
   */
  needsSelection: boolean;
  /** null until a selection exists (fresh visit, or localStorage blocked) — callers render the "pick a brigade" empty state in that case. */
  tenantId: string | null;
  /** Every military brigade this caller may pick, for the switcher dropdown. Empty until loaded. */
  options: MilitaryTenantOption[];
  loadingOptions: boolean;
  selectTenant: (id: string) => void;
}

/**
 * 06.10.2026 — shared by every readiness screen that needs an explicit
 * tenantId for root/chief-officer (dashboard, roster, trends, entry,
 * import, unit-detail): one path, not five near-identical ones. Reuses
 * /api/units/readiness/vertical-overview (already root+vertical-aware,
 * see readiness-vertical-overview.service.ts) as the options source —
 * same list a chief officer's own overview screen shows, so root and a
 * chief officer are offered literally the same brigades.
 */
export function useMilitaryTenantSelection(): MilitaryTenantSelection {
  const [roleLoading, setRoleLoading] = useState(true);
  const [needsSelection, setNeedsSelection] = useState(false);
  const [tenantId, setTenantIdState] = useState<string | null>(null);
  const [options, setOptions] = useState<MilitaryTenantOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { setRoleLoading(false); return; }
      try {
        const role = await checkUserRole(user.uid, user.email);
        const needs = role.isSuperAdmin || role.isReadinessChiefOfficer;
        setNeedsSelection(needs);
        if (needs) {
          try {
            setTenantIdState(localStorage.getItem(AUTHORITY_STORAGE_KEY));
          } catch {
            // Private-browsing/storage-blocked — stays null, same as a first-ever visit.
          }
        }
      } finally {
        setRoleLoading(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!needsSelection) return;
    let cancelled = false;
    setLoadingOptions(true);
    (async () => {
      const token = await auth.currentUser?.getIdToken();
      if (!token) return;
      const res = await fetch('/api/units/readiness/vertical-overview', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await res.json().catch(() => ({}));
      if (!cancelled && res.ok) {
        const rows = (body.rows ?? []) as { tenantId: string; tenantName: string }[];
        setOptions(rows.map((r) => ({ id: r.tenantId, name: r.tenantName })));
      }
    })().finally(() => {
      if (!cancelled) setLoadingOptions(false);
    });
    return () => { cancelled = true; };
  }, [needsSelection]);

  const selectTenant = useCallback((id: string) => {
    setTenantIdState(id);
    try {
      localStorage.setItem(AUTHORITY_STORAGE_KEY, id);
    } catch {
      // Selection still works for the rest of this session — just won't carry to other screens/tabs.
    }
  }, []);

  return { roleLoading, needsSelection, tenantId, options, loadingOptions, selectTenant };
}
