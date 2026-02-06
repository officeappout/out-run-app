import { useState, useEffect } from 'react';
import { Search, X, LayoutGrid, Columns, Users, Filter, Wallet, CalendarDays } from 'lucide-react';
import { AuthorityType, PipelineStatus, PIPELINE_STATUS_LABELS } from '@/types/admin-types';
import { getAllSuperAdmins, AdminUser } from '@/features/admin/services/admin-management.service';

export type ViewMode = 'grouped' | 'flat' | 'board';

interface AuthorityFiltersProps {
  typeFilter: AuthorityType | 'all';
  viewMode: ViewMode;
  searchQuery: string;
  ownerFilter: string;
  pipelineStatusFilter: PipelineStatus | 'all';
  overdueInstallmentsFilter: boolean;
  authorityIdsFilter: string[] | null;
  onTypeFilterChange: (filter: AuthorityType | 'all') => void;
  onViewModeChange: (mode: ViewMode) => void;
  onSearchChange: (query: string) => void;
  onOwnerFilterChange: (ownerId: string) => void;
  onPipelineStatusFilterChange: (status: PipelineStatus | 'all') => void;
  onOverdueInstallmentsFilterChange: (enabled: boolean) => void;
  onClearAuthorityIdsFilter?: () => void;
}

export default function AuthorityFilters({
  typeFilter,
  viewMode,
  searchQuery,
  ownerFilter,
  pipelineStatusFilter,
  overdueInstallmentsFilter,
  authorityIdsFilter,
  onTypeFilterChange,
  onViewModeChange,
  onSearchChange,
  onOwnerFilterChange,
  onPipelineStatusFilterChange,
  onOverdueInstallmentsFilterChange,
  onClearAuthorityIdsFilter,
}: AuthorityFiltersProps) {
  const [systemAdmins, setSystemAdmins] = useState<AdminUser[]>([]);
  const [loadingAdmins, setLoadingAdmins] = useState(false);

  // Fetch system admins for owner filter
  useEffect(() => {
    setLoadingAdmins(true);
    getAllSuperAdmins()
      .then(setSystemAdmins)
      .catch(console.error)
      .finally(() => setLoadingAdmins(false));
  }, []);

  return (
    <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="חפש לפי שם הרשות..."
          className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none text-right text-black placeholder:text-gray-600 bg-white"
          dir="rtl"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Filters Row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4 flex-wrap">
          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-bold text-gray-700">סוג:</label>
            <select
              value={typeFilter}
              onChange={(e) => onTypeFilterChange(e.target.value as AuthorityType | 'all')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none text-black bg-white text-sm"
            >
              <option value="all">הכל</option>
              <option value="regional_council">מועצות אזוריות</option>
              <option value="local_council">מועצות מקומיות</option>
              <option value="city">עיריות</option>
            </select>
          </div>

          {/* Owner Filter */}
          <div className="flex items-center gap-2">
            <Users size={16} className="text-gray-500" />
            <label className="text-sm font-bold text-gray-700">אחראי:</label>
            <select
              value={ownerFilter}
              onChange={(e) => onOwnerFilterChange(e.target.value)}
              disabled={loadingAdmins}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none text-black bg-white text-sm disabled:opacity-50"
            >
              <option value="">כולם</option>
              {systemAdmins.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.name}
                </option>
              ))}
            </select>
          </div>

          {/* Pipeline Status Filter */}
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-500" />
            <label className="text-sm font-bold text-gray-700">סטטוס:</label>
            <select
              value={pipelineStatusFilter}
              onChange={(e) => onPipelineStatusFilterChange(e.target.value as PipelineStatus | 'all')}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 outline-none text-black bg-white text-sm"
            >
              <option value="all">הכל</option>
              {(Object.keys(PIPELINE_STATUS_LABELS) as PipelineStatus[]).map((status) => (
                <option key={status} value={status}>
                  {PIPELINE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>

          {/* Overdue Installments Filter */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={overdueInstallmentsFilter}
              onChange={(e) => onOverdueInstallmentsFilterChange(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-rose-600 focus:ring-rose-500"
            />
            <Wallet size={16} className={overdueInstallmentsFilter ? 'text-rose-600' : 'text-gray-500'} />
            <span className={`text-sm font-bold ${overdueInstallmentsFilter ? 'text-rose-600' : 'text-gray-700'}`}>
              תשלומים באיחור
            </span>
          </label>

          {/* Active Authority IDs Filter Indicator */}
          {authorityIdsFilter && authorityIdsFilter.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 border border-emerald-300 rounded-lg">
              <CalendarDays size={16} className="text-emerald-600" />
              <span className="text-sm font-bold text-emerald-700">
                מסנן לפי תחזית: {authorityIdsFilter.length} רשויות
              </span>
              {onClearAuthorityIdsFilter && (
                <button
                  onClick={onClearAuthorityIdsFilter}
                  className="p-0.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-200 rounded transition-colors"
                  title="נקה סינון"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* View Mode Toggles */}
        <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => onViewModeChange('flat')}
            title="תצוגת רשימה"
            className={`p-2 rounded-lg font-bold transition-colors ${
              viewMode === 'flat'
                ? 'bg-white text-cyan-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <LayoutGrid size={18} />
          </button>
          <button
            onClick={() => onViewModeChange('board')}
            title="תצוגת לוח (Kanban)"
            className={`p-2 rounded-lg font-bold transition-colors ${
              viewMode === 'board'
                ? 'bg-white text-cyan-600 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Columns size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
