'use client';

import { createContext, useContext, useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import type { Authority, TenantType } from '@/types/admin-types';
import { authorityTypeToTenantType } from '@/features/admin/config/tenantLabels';

export interface OrgSelectorState {
  allOrgs: Authority[];
  /** Root orgs only (no neighborhoods) */
  rootOrgs: Authority[];
  selectedOrgId: string;
  selectedOrg: Authority | null;
  selectedOrgType: TenantType;
  setSelectedOrgId: (id: string) => void;
  setAllOrgs: (orgs: Authority[]) => void;
  /** Filter string for Command Palette */
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

const OrgSelectorContext = createContext<OrgSelectorState | null>(null);

const ROOT_TYPES = new Set(['city', 'regional_council', 'local_council', 'settlement', 'school', 'military_unit']);

export function OrgSelectorProvider({ children }: { children: ReactNode }) {
  const [allOrgs, setAllOrgsRaw] = useState<Authority[]>([]);
  const [selectedOrgId, setSelectedOrgIdRaw] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('admin_selected_org_id');
      if (saved) setSelectedOrgIdRaw(saved);
    }
  }, []);

  const setSelectedOrgId = useCallback((id: string) => {
    setSelectedOrgIdRaw(id);
    if (typeof window !== 'undefined') localStorage.setItem('admin_selected_org_id', id);
  }, []);

  const setAllOrgs = useCallback((orgs: Authority[]) => {
    setAllOrgsRaw(orgs);
  }, []);

  const rootOrgs = useMemo(
    () => allOrgs.filter(o => ROOT_TYPES.has(o.type) && !o.parentAuthorityId),
    [allOrgs],
  );

  const selectedOrg = useMemo(
    () => (selectedOrgId === 'all' ? null : allOrgs.find(o => o.id === selectedOrgId) ?? null),
    [allOrgs, selectedOrgId],
  );

  const selectedOrgType = useMemo<TenantType>(
    () => selectedOrg ? authorityTypeToTenantType(selectedOrg.type) : 'municipal',
    [selectedOrg],
  );

  const value = useMemo<OrgSelectorState>(() => ({
    allOrgs, rootOrgs, selectedOrgId, selectedOrg, selectedOrgType,
    setSelectedOrgId, setAllOrgs, searchQuery, setSearchQuery, isOpen, setIsOpen,
  }), [allOrgs, rootOrgs, selectedOrgId, selectedOrg, selectedOrgType, setSelectedOrgId, setAllOrgs, searchQuery, isOpen]);

  return (
    <OrgSelectorContext.Provider value={value}>
      {children}
    </OrgSelectorContext.Provider>
  );
}

export function useOrgSelector(): OrgSelectorState {
  const ctx = useContext(OrgSelectorContext);
  if (!ctx) throw new Error('useOrgSelector must be used within OrgSelectorProvider');
  return ctx;
}
