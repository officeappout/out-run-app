'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useCallback, useEffect } from 'react';
import { useAuthorities } from '@/features/admin/hooks/useAuthorities';
import AuthoritiesHeader from '@/features/admin/components/authorities/AuthoritiesHeader';
import AuthorityFilters from '@/features/admin/components/authorities/AuthorityFilters';
import AuthoritiesList from '@/features/admin/components/authorities/AuthoritiesList';
import AuthorityDetailDrawer from '@/features/admin/components/authorities/AuthorityDetailDrawer';
import AuthoritiesStatsDashboard from '@/features/admin/components/authorities/AuthoritiesStatsDashboard';
import AuthoritiesKanbanBoard from '@/features/admin/components/authorities/AuthoritiesKanbanBoard';
import { getTypeLabel, getTypeColor } from '@/features/admin/components/authorities/authorityHelpers';
import { usePagination } from '@/features/admin/hooks/usePagination';
import Pagination from '@/features/admin/components/shared/Pagination';
import { Authority } from '@/types/admin-types';
import { useMemo } from 'react';
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
    loadAuthorities,
  } = useAuthorities();

  // Drawer state
  const [selectedAuthority, setSelectedAuthority] = useState<Authority | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

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

  // Handle drawer update - refresh authorities and update selected
  const handleDrawerUpdate = useCallback(async () => {
    await loadAuthorities();
    // Re-fetch the selected authority to get updated data
    if (selectedAuthority) {
      const updated = authorities.find(a => a.id === selectedAuthority.id);
      if (updated) {
        setSelectedAuthority(updated);
      }
    }
  }, [loadAuthorities, selectedAuthority, authorities]);

  // Pagination for flat view only
  const flatPagination = usePagination(
    viewMode === 'flat' ? filteredAuthorities : [],
    10
  );

  // Paginated authorities for flat view
  const paginatedAuthorities = useMemo(() => {
    if (viewMode !== 'flat') return filteredAuthorities;
    return flatPagination.paginatedItems;
  }, [viewMode, filteredAuthorities, flatPagination.paginatedItems]);

  return (
    <div className="space-y-6" dir="rtl">
      <AuthoritiesHeader />

      {/* Stats Dashboard */}
      <AuthoritiesStatsDashboard 
        authorities={authorities} 
        onFilterByAuthorityIds={setAuthorityIdsFilter}
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

      {/* Kanban Board View */}
      {viewMode === 'board' ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 overflow-hidden">
          <AuthoritiesKanbanBoard
            authorities={filteredAuthorities}
            onOpenDrawer={handleOpenDrawer}
            ownerFilter={ownerFilter}
            pipelineStatusFilter={pipelineStatusFilter}
            adminInfo={adminInfo}
            onAuthorityUpdated={loadAuthorities}
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
          {viewMode === 'flat' && filteredAuthorities.length > 10 && (
            <Pagination
              currentPage={flatPagination.currentPage}
              totalPages={flatPagination.totalPages}
              onPageChange={flatPagination.goToPage}
              totalItems={filteredAuthorities.length}
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
