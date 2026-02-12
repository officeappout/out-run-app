'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuthorities } from '@/features/admin/hooks/useAuthorities';
import AuthoritiesHeader from '@/features/admin/components/authorities/AuthoritiesHeader';
import AuthorityFilters from '@/features/admin/components/authorities/AuthorityFilters';
import AuthoritiesList from '@/features/admin/components/authorities/AuthoritiesList';
import AuthorityDetailDrawer from '@/features/admin/components/authorities/AuthorityDetailDrawer';
import AuthoritiesStatsDashboard, { type StatCardFilterKey } from '@/features/admin/components/authorities/AuthoritiesStatsDashboard';
import AuthoritiesKanbanBoard from '@/features/admin/components/authorities/AuthoritiesKanbanBoard';
import { getTypeLabel, getTypeColor } from '@/features/admin/components/authorities/authorityHelpers';
import { usePagination } from '@/features/admin/hooks/usePagination';
import Pagination from '@/features/admin/components/shared/Pagination';
import { Authority, hasOverdueTasks, hasOverdueInstallments, getInstallmentsSum } from '@/types/admin-types';
import { auth } from '@/lib/firebase';

export default function AuthoritiesListPage() {
  const {
    // State
    authorities,
    enhancedAuthorities,
    loading,
    typeFilter,
    viewMode,
    expandedCouncils,
    expandedCities,
    loadingSubLocations,
    subLocationStats,
    ownerFilter,
    pipelineStatusFilter,
    overdueInstallmentsFilter,
    authorityIdsFilter,
    
    // Filtered data
    filteredAuthorities,
    filteredCitiesWithSubLocations,
    filteredGroupedData,
    searchQuery,
    
    // Actions
    setTypeFilter,
    setViewMode,
    setSearchQuery,
    setOwnerFilter,
    setPipelineStatusFilter,
    setOverdueInstallmentsFilter,
    setAuthorityIdsFilter,
    clearAuthorityIdsFilter,
    toggleCouncil,
    toggleCity,
    handleDelete,
    handleToggleActiveClient,
  } = useAuthorities();

  // Drawer state
  const [selectedAuthority, setSelectedAuthority] = useState<Authority | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Stat card filter state
  const [activeStatFilter, setActiveStatFilter] = useState<StatCardFilterKey | null>(null);

  // ── Stat-card → table filter logic ─────────────────────────────────
  // Each card maps to a precise business definition:
  //   Pipeline Value  = leads in sales stages WITH a quote (NOT active clients)
  //   Contract Gap    = active clients with unscheduled balance
  //   Active Leads    = all leads excluding Draft/Pool AND excluding Active Clients
  //
  // IMPORTANT: When a stat card IS active, we filter from ALL top-level
  // authorities (same data source the dashboard KPI uses).  This prevents
  // the count/list mismatch that occurred when hook-level filters
  // (typeFilter, pipelineStatusFilter, etc.) narrowed the base list.
  const SALES_STAGES = ['meeting', 'quote', 'follow_up', 'closing'];

  const statFilteredAuthorities = useMemo(() => {
    // No stat card active → respect all hook-level filters as before
    if (!activeStatFilter) return filteredAuthorities;

    // When a stat card IS active, use the same base as the dashboard:
    // all top-level authorities (excluding sub-locations / __SCHEMA_INIT__)
    const topLevel = authorities.filter(
      a => !a.parentAuthorityId
        && !a.id.includes('__SCHEMA_INIT__')
        && !a.name.includes('__SCHEMA_INIT__')
    );

    return topLevel.filter(a => {
      const status = a.pipelineStatus || 'lead';
      switch (activeStatFilter) {
        case 'pipelineValue':
          // Blue card: leads in sales stages with a quote — NOT active clients
          return !a.isActiveClient
            && SALES_STAGES.includes(status)
            && (a.financials?.totalQuoteAmount || 0) > 0;

        case 'contractGap': {
          // Yellow card: active clients with (quote − scheduled installments) > 0
          if (!a.isActiveClient || !a.financials) return false;
          const total = a.financials.totalQuoteAmount || 0;
          const scheduled = a.financials.installments?.reduce((s, i) => s + i.amount, 0) || 0;
          return (total - scheduled) > 0;
        }

        case 'activeLeads':
          // All pipeline entities EXCEPT Draft/Pool AND EXCEPT Active Clients
          return !a.isActiveClient && status !== 'draft' && status !== 'active';

        case 'activeClients':
          return a.isActiveClient === true;

        case 'closingSoon':
          return status === 'follow_up' || status === 'closing';

        case 'overdueTasks':
          return hasOverdueTasks(a);

        case 'overdueInstallments':
          return hasOverdueInstallments(a);

        case 'openTasks':
          return (a.tasks?.filter(t => t.status !== 'done' && t.status !== 'cancelled').length || 0) > 0;

        case 'annualRevenue': {
          // All authorities with installments in the current calendar year
          const yr = String(new Date().getFullYear());
          return (a.financials?.installments?.some(i => i.targetMonth?.startsWith(yr)) || false);
        }

        default:
          return true;
      }
    });
  }, [authorities, filteredAuthorities, activeStatFilter]);

  // Human-readable label for the active filter (used in the clear-filter banner)
  const STAT_FILTER_LABELS: Record<StatCardFilterKey, string> = {
    pipelineValue: 'שווי צנרת (Pipeline)',
    contractGap: 'יתרת חוזה (The Gap)',
    annualRevenue: `הכנסה שנתית ${new Date().getFullYear()}`,
    activeLeads: 'לידים פעילים',
    activeClients: 'לקוחות פעילים',
    closingSoon: 'קרובים לסגירה',
    overdueTasks: 'משימות באיחור',
    overdueInstallments: 'תשלומים באיחור',
    openTasks: 'משימות פתוחות',
  };

  // ── Financial summary for the active filter ──────────────────────
  const filterSummary = useMemo(() => {
    if (!activeStatFilter) return null;
    const count = statFilteredAuthorities.length;
    let totalValue = 0;

    for (const a of statFilteredAuthorities) {
      switch (activeStatFilter) {
        case 'pipelineValue':
          totalValue += a.financials?.totalQuoteAmount || 0;
          break;
        case 'contractGap': {
          const total = a.financials?.totalQuoteAmount || 0;
          const scheduled = a.financials?.installments ? getInstallmentsSum(a.financials.installments) : 0;
          totalValue += Math.max(0, total - scheduled);
          break;
        }
        case 'annualRevenue': {
          const yr = String(new Date().getFullYear());
          totalValue += a.financials?.installments
            ?.filter(i => i.targetMonth?.startsWith(yr))
            .reduce((s, i) => s + i.amount, 0) || 0;
          break;
        }
        case 'activeClients':
        case 'activeLeads':
          totalValue += a.financials?.totalQuoteAmount || 0;
          break;
        default:
          // For non-financial filters, don't show a monetary total
          break;
      }
    }

    const isFinancial = ['pipelineValue', 'contractGap', 'annualRevenue', 'activeClients', 'activeLeads'].includes(activeStatFilter);
    return { count, totalValue, isFinancial };
  }, [statFilteredAuthorities, activeStatFilter]);

  // Admin info for audit logging
  const [adminInfo, setAdminInfo] = useState<{ adminId: string; adminName: string } | undefined>(undefined);

  // Get current user for admin info
  useEffect(() => {
    const user = auth.currentUser;
    if (user) {
      setAdminInfo({
        adminId: user.uid,
        adminName: user.displayName || user.email || 'Admin',
      });
    }
  }, []);

  // Handle opening the detail drawer
  const handleOpenDrawer = useCallback((authority: Authority) => {
    setSelectedAuthority(authority);
    setIsDrawerOpen(true);
  }, []);

  // Handle closing the drawer
  const handleCloseDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    // Don't clear selectedAuthority immediately to allow exit animation
    setTimeout(() => setSelectedAuthority(null), 300);
  }, []);

  // Auto-sync the open drawer with real-time data from onSnapshot
  // When authorities changes (via the listener), update selectedAuthority automatically
  useEffect(() => {
    if (selectedAuthority && isDrawerOpen) {
      const updated = authorities.find(a => a.id === selectedAuthority.id);
      if (updated) {
        // Only update if data actually changed (shallow compare by updatedAt)
        const updatedTime = updated.updatedAt instanceof Date ? updated.updatedAt.getTime() : 0;
        const currentTime = selectedAuthority.updatedAt instanceof Date ? selectedAuthority.updatedAt.getTime() : 0;
        if (updatedTime !== currentTime) {
          setSelectedAuthority(updated);
        }
      }
    }
  }, [authorities, selectedAuthority, isDrawerOpen]);

  // Handle drawer update — onSnapshot handles the actual data refresh,
  // this is a no-op kept for API compatibility with the drawer component.
  const handleDrawerUpdate = useCallback(async () => {
    // No-op: onSnapshot listener will auto-update authorities state,
    // and the useEffect above will sync selectedAuthority.
  }, []);

  // Pagination for flat view only
  const flatPagination = usePagination(
    viewMode === 'flat' ? statFilteredAuthorities : [],
    10
  );

  // Paginated authorities for flat view
  const paginatedAuthorities = useMemo(() => {
    if (viewMode !== 'flat') return statFilteredAuthorities;
    return flatPagination.paginatedItems;
  }, [viewMode, statFilteredAuthorities, flatPagination.paginatedItems]);

  return (
    <div className="space-y-6" dir="rtl">
      <AuthoritiesHeader />

      {/* Stats Dashboard */}
      <AuthoritiesStatsDashboard 
        authorities={authorities} 
        onFilterByAuthorityIds={setAuthorityIdsFilter}
        onStatCardFilter={setActiveStatFilter}
        activeStatFilter={activeStatFilter}
      />

      <AuthorityFilters
        typeFilter={typeFilter}
        viewMode={viewMode}
        searchQuery={searchQuery}
        ownerFilter={ownerFilter}
        pipelineStatusFilter={pipelineStatusFilter}
        overdueInstallmentsFilter={overdueInstallmentsFilter}
        authorityIdsFilter={authorityIdsFilter}
        onTypeFilterChange={setTypeFilter}
        onViewModeChange={setViewMode}
        onSearchChange={setSearchQuery}
        onOwnerFilterChange={setOwnerFilter}
        onPipelineStatusFilterChange={setPipelineStatusFilter}
        onOverdueInstallmentsFilterChange={setOverdueInstallmentsFilter}
        onClearAuthorityIdsFilter={clearAuthorityIdsFilter}
      />

      {/* Active stat-card filter banner — color-themed */}
      {activeStatFilter && (() => {
        const bannerTheme: Record<string, { bg: string; border: string; text: string; accent: string; btnBorder: string; btnHover: string }> = {
          pipelineValue:       { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-800', accent: 'text-indigo-600', btnBorder: 'border-indigo-300', btnHover: 'hover:bg-indigo-100' },
          contractGap:         { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-800',  accent: 'text-amber-600',  btnBorder: 'border-amber-300',  btnHover: 'hover:bg-amber-100' },
          annualRevenue:       { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', accent: 'text-emerald-600', btnBorder: 'border-emerald-300', btnHover: 'hover:bg-emerald-100' },
          activeClients:       { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-800', accent: 'text-green-600', btnBorder: 'border-green-300', btnHover: 'hover:bg-green-100' },
          activeLeads:         { bg: 'bg-blue-50',  border: 'border-blue-200',  text: 'text-blue-800',  accent: 'text-blue-600',  btnBorder: 'border-blue-300',  btnHover: 'hover:bg-blue-100' },
          closingSoon:         { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-800', accent: 'text-orange-600', btnBorder: 'border-orange-300', btnHover: 'hover:bg-orange-100' },
          overdueTasks:        { bg: 'bg-red-50',   border: 'border-red-200',   text: 'text-red-800',   accent: 'text-red-600',   btnBorder: 'border-red-300',   btnHover: 'hover:bg-red-100' },
          overdueInstallments: { bg: 'bg-rose-50',  border: 'border-rose-200',  text: 'text-rose-800',  accent: 'text-rose-600',  btnBorder: 'border-rose-300',  btnHover: 'hover:bg-rose-100' },
          openTasks:           { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-800', accent: 'text-purple-600', btnBorder: 'border-purple-300', btnHover: 'hover:bg-purple-100' },
        };
        const t = bannerTheme[activeStatFilter] || bannerTheme.pipelineValue;
        return (
          <div className={`flex items-center justify-between ${t.bg} border ${t.border} rounded-xl px-4 py-2.5`}>
            <div className={`flex items-center gap-2 text-sm font-bold ${t.text}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              <span>מסנן פעיל:</span>
              <span className={t.accent}>{STAT_FILTER_LABELS[activeStatFilter]}</span>
              <span className={`${t.accent} font-medium opacity-75`}>({statFilteredAuthorities.length} תוצאות)</span>
            </div>
            <button onClick={() => setActiveStatFilter(null)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border ${t.btnBorder} text-sm font-bold ${t.text} ${t.btnHover} transition-colors`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              נקה סינון
            </button>
          </div>
        );
      })()}

      {/* Kanban Board View */}
      {viewMode === 'board' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 overflow-hidden">
          <AuthoritiesKanbanBoard
            authorities={filteredAuthorities}
            onOpenDrawer={handleOpenDrawer}
            ownerFilter={ownerFilter}
            pipelineStatusFilter={pipelineStatusFilter}
            adminInfo={adminInfo}
            onAuthorityUpdated={() => { /* onSnapshot handles this */ }}
          />
        </div>
      ) : (
        /* List/Table View */
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-h-[600px]">
          <AuthoritiesList
            authorities={authorities}
            enhancedAuthorities={enhancedAuthorities}
            filteredAuthorities={paginatedAuthorities}
            filteredCitiesWithSubLocations={filteredCitiesWithSubLocations}
            filteredGroupedData={filteredGroupedData}
            subLocationStats={subLocationStats}
            loading={loading}
            viewMode={viewMode === 'grouped' ? 'grouped' : 'flat'}
            expandedCouncils={expandedCouncils}
            expandedCities={expandedCities}
            loadingSubLocations={loadingSubLocations}
            onToggleCouncil={toggleCouncil}
            onToggleCity={toggleCity}
            onDelete={handleDelete}
            onToggleActiveClient={handleToggleActiveClient}
            onOpenDrawer={handleOpenDrawer}
            getTypeLabel={getTypeLabel}
            getTypeColor={getTypeColor}
          />
          {/* Financial summary row — color-themed */}
          {activeStatFilter && filterSummary && (() => {
            const summaryColors: Record<string, { bg: string; border: string; valueText: string }> = {
              pipelineValue:  { bg: 'bg-indigo-50', border: 'border-indigo-200', valueText: 'text-indigo-700' },
              contractGap:    { bg: 'bg-amber-50',  border: 'border-amber-200',  valueText: 'text-amber-700' },
              annualRevenue:  { bg: 'bg-emerald-50', border: 'border-emerald-200', valueText: 'text-emerald-700' },
              activeClients:  { bg: 'bg-green-50', border: 'border-green-200', valueText: 'text-green-700' },
              activeLeads:    { bg: 'bg-blue-50',  border: 'border-blue-200',  valueText: 'text-blue-700' },
            };
            const sc = summaryColors[activeStatFilter] || { bg: 'bg-gray-50', border: 'border-gray-200', valueText: 'text-gray-700' };
            return (
              <div className={`border-t-2 ${sc.border} ${sc.bg} px-6 py-3 flex items-center justify-between`}>
                <div className="flex items-center gap-4 text-sm font-bold text-gray-700">
                  <span>סה&quot;כ: {filterSummary.count} רשויות</span>
                  {filterSummary.isFinancial && filterSummary.totalValue > 0 && (
                    <span className={`${sc.valueText} text-base`}>
                      שווי כולל: ₪{filterSummary.totalValue.toLocaleString()}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {STAT_FILTER_LABELS[activeStatFilter]}
                </span>
              </div>
            );
          })()}
          {viewMode === 'flat' && statFilteredAuthorities.length > 10 && (
            <Pagination
              currentPage={flatPagination.currentPage}
              totalPages={flatPagination.totalPages}
              onPageChange={flatPagination.goToPage}
              totalItems={statFilteredAuthorities.length}
              itemsPerPage={10}
            />
          )}
        </div>
      )}

      {/* Authority Detail Drawer (CRM Workspace) */}
      <AuthorityDetailDrawer
        authority={selectedAuthority}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        onUpdate={handleDrawerUpdate}
        adminInfo={adminInfo}
      />
    </div>
  );
}
