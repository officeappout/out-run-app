'use client';

import { useAuthorities } from '@/features/admin/hooks/useAuthorities';
import AuthoritiesHeader from '@/features/admin/components/authorities/AuthoritiesHeader';
import AuthorityFilters from '@/features/admin/components/authorities/AuthorityFilters';
import AuthoritiesList from '@/features/admin/components/authorities/AuthoritiesList';
import { getTypeLabel, getTypeColor } from '@/features/admin/components/authorities/authorityHelpers';
import { usePagination } from '@/features/admin/hooks/usePagination';
import Pagination from '@/features/admin/components/shared/Pagination';
import { useMemo } from 'react';

export default function AuthoritiesListPage() {
  const {
    // State
    authorities,
    enhancedAuthorities,
    loading,
    seeding,
    reSeeding,
    repairing,
    typeFilter,
    viewMode,
    expandedCouncils,
    expandedCities,
    loadingSubLocations,
    subLocationStats,
    
    // Filtered data
    filteredAuthorities,
    filteredCitiesWithSubLocations,
    filteredGroupedData,
    searchQuery,
    
    // Actions
    setTypeFilter,
    setViewMode,
    setSearchQuery,
    toggleCouncil,
    toggleCity,
    handleDelete,
    handleToggleActiveClient,
    handleInitializeSchema,
    handleSeedAuthorities,
    handleReSeedAuthorities,
    handleRepairTelAviv,
  } = useAuthorities();

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
      <AuthoritiesHeader
        onSeed={handleSeedAuthorities}
        onReSeed={handleReSeedAuthorities}
        onInitializeSchema={handleInitializeSchema}
        onRepairTelAviv={handleRepairTelAviv}
        seeding={seeding}
        reSeeding={reSeeding}
        repairing={repairing}
        loading={loading}
      />

      <AuthorityFilters
        typeFilter={typeFilter}
        viewMode={viewMode}
        searchQuery={searchQuery}
        onTypeFilterChange={setTypeFilter}
        onViewModeChange={setViewMode}
        onSearchChange={setSearchQuery}
      />

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden min-h-[600px]">
        <AuthoritiesList
          authorities={authorities}
          enhancedAuthorities={enhancedAuthorities}
          filteredAuthorities={paginatedAuthorities}
          filteredCitiesWithSubLocations={filteredCitiesWithSubLocations}
          filteredGroupedData={filteredGroupedData}
          subLocationStats={subLocationStats}
          loading={loading}
          viewMode={viewMode}
          expandedCouncils={expandedCouncils}
          expandedCities={expandedCities}
          loadingSubLocations={loadingSubLocations}
          onToggleCouncil={toggleCouncil}
          onToggleCity={toggleCity}
          onDelete={handleDelete}
          onToggleActiveClient={handleToggleActiveClient}
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
    </div>
  );
}
