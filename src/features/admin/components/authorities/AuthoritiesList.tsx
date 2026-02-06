import Link from 'next/link';
import { Building2, Users, Map, ChevronDown, ChevronRight, Edit2, Trash2, MapPin, CheckCircle2, XCircle, Phone, AlertCircle } from 'lucide-react';
import { 
  Authority, 
  AuthorityType, 
  getPrimaryContact, 
  hasOverdueTasks, 
  PIPELINE_STATUS_LABELS, 
  PIPELINE_STATUS_COLORS 
} from '@/types/admin-types';
import { AuthorityWithSubLocations, SubLocationStats } from '@/features/admin/hooks/useAuthorities';
import { safeRenderText } from '@/utils/render-helpers';

interface AuthoritiesListProps {
  // Data
  authorities: Authority[];
  enhancedAuthorities: AuthorityWithSubLocations[];
  filteredAuthorities: AuthorityWithSubLocations[];
  filteredCitiesWithSubLocations: AuthorityWithSubLocations[];
  filteredGroupedData: {
    regionalCouncils: (Authority & { settlements: Authority[] })[];
    cities: (Authority & { neighborhoods: Authority[] })[];
    standaloneAuthorities: Authority[];
  } | null;
  subLocationStats: SubLocationStats;
  
  // State
  loading: boolean;
  viewMode: 'grouped' | 'flat';
  expandedCouncils: Set<string>;
  expandedCities: Set<string>;
  loadingSubLocations: Set<string>;
  
  // Actions
  onToggleCouncil: (id: string) => void;
  onToggleCity: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onToggleActiveClient: (id: string, currentValue: boolean) => void;
  onOpenDrawer?: (authority: Authority) => void; // New: Open detail drawer
  
  // Helpers
  getTypeLabel: (type: AuthorityType) => string;
  getTypeColor: (type: AuthorityType) => string;
}

/**
 * Render pipeline status badge
 */
function PipelineStatusBadge({ status }: { status: Authority['pipelineStatus'] }) {
  const currentStatus = status || 'lead';
  const colors = PIPELINE_STATUS_COLORS[currentStatus];
  return (
    <span className={`px-2 py-1 rounded-md text-xs font-bold border ${colors.bg} ${colors.text} ${colors.border}`}>
      {PIPELINE_STATUS_LABELS[currentStatus]}
    </span>
  );
}

/**
 * Render primary contact info
 */
function PrimaryContactInfo({ authority }: { authority: Authority }) {
  const contact = getPrimaryContact(authority);
  if (!contact) return <span className="text-gray-400 text-sm">-</span>;
  
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-medium text-gray-700 truncate max-w-[120px]">{contact.name}</span>
      {contact.phone && (
        <a 
          href={`tel:${contact.phone}`} 
          onClick={(e) => e.stopPropagation()}
          className="text-gray-400 hover:text-cyan-600 transition-colors"
          title={contact.phone}
        >
          <Phone size={14} />
        </a>
      )}
    </div>
  );
}

/**
 * Overdue alert badge
 */
function OverdueAlertBadge({ authority }: { authority: Authority }) {
  if (!hasOverdueTasks(authority)) return null;
  
  return (
    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold animate-pulse">
      <AlertCircle size={12} />
    </span>
  );
}

export default function AuthoritiesList({
  authorities,
  enhancedAuthorities,
  filteredAuthorities,
  filteredCitiesWithSubLocations,
  filteredGroupedData,
  subLocationStats,
  loading,
  viewMode,
  expandedCouncils,
  expandedCities,
  loadingSubLocations,
  onToggleCouncil,
  onToggleCity,
  onDelete,
  onToggleActiveClient,
  onOpenDrawer,
  getTypeLabel,
  getTypeColor,
}: AuthoritiesListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  if (authorities.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="bg-gray-50 inline-flex p-4 rounded-full mb-4">
          <Building2 size={32} className="text-gray-400" />
        </div>
        <h3 className="text-lg font-bold text-gray-900">לא נמצאו רשויות</h3>
        <p className="text-gray-500 mt-2">
          התחל על ידי הוספת הרשות הראשונה למערכת
        </p>
      </div>
    );
  }

  if (viewMode === 'grouped' && filteredGroupedData) {
    return (
      <div className="divide-y divide-gray-100">
        {/* Cities with Neighborhoods (from Firestore) */}
        {filteredGroupedData.cities.map((city) => {
          const isExpanded = expandedCities.has(city.id);
          const isLoading = loadingSubLocations.has(city.id);
          
          return (
            <div key={city.id} className="border-b border-gray-200 last:border-b-0">
              {/* City Row */}
              <div 
                className="hover:bg-purple-50/50 transition-colors group cursor-pointer"
                onClick={() => onOpenDrawer?.(city)}
              >
                <div className="flex items-center px-6 py-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleCity(city.id); }}
                    className="p-1 hover:bg-purple-100 rounded-lg transition-colors mr-2"
                  >
                    {isExpanded ? (
                      <ChevronDown size={20} className="text-gray-600" />
                    ) : (
                      <ChevronRight size={20} className="text-gray-600" />
                    )}
                  </button>
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mr-4">
                    {city.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={city.logoUrl}
                        alt={city.name}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    ) : (
                      <Building2 size={20} className="text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-900">{city.name}</span>
                      <OverdueAlertBadge authority={city} />
                      <PipelineStatusBadge status={city.pipelineStatus} />
                      {city.neighborhoods && city.neighborhoods.length > 0 && (
                        <span className="text-xs text-gray-500">
                          ({city.neighborhoods.length} שכונות)
                        </span>
                      )}
                    </div>
                    <div className="mt-1">
                      <PrimaryContactInfo authority={city} />
                    </div>
                  </div>
                  <div className="flex items-center gap-6 px-4">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Users size={16} />
                      <span className="font-bold">{(city as any).aggregatedUsersCount ?? city.userCount ?? 0}</span>
                    </div>
                    <div className="flex items-center gap-2 text-gray-600">
                      <Map size={16} />
                      <span className="font-bold">{(city as any).aggregatedParksCount ?? 0}</span>
                      <span className="text-xs text-gray-500">גינות</span>
                    </div>
                    {/* Active Client Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={city.isActiveClient || false}
                        onChange={() => onToggleActiveClient(city.id, city.isActiveClient || false)}
                        className="w-5 h-5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700 font-medium">לקוח פעיל</span>
                    </label>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/admin/authorities/${city.id}`}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="ערוך"
                      >
                        <Edit2 size={18} />
                      </Link>
                      <button
                        onClick={() => onDelete(city.id, city.name)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="מחק"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Neighborhoods (nested) - from Firestore */}
              {isExpanded && city.neighborhoods && city.neighborhoods.length > 0 && (
                <div className="bg-gray-50/50 border-t border-gray-200">
                  {city.neighborhoods.map((neighborhood, idx) => (
                      <div
                        key={neighborhood.id}
                        className={`flex items-center px-6 py-3 hover:bg-gray-100 transition-colors group cursor-pointer ${
                        idx < city.neighborhoods!.length - 1 ? 'border-b border-gray-200' : ''
                        }`}
                        style={{ paddingRight: '3rem' }} // Indent child items
                        onClick={() => onOpenDrawer?.(neighborhood)}
                      >
                        <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0 mr-4 ml-16">
                          <MapPin size={14} className="text-gray-500" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-gray-700">{neighborhood.name}</span>
                            <OverdueAlertBadge authority={neighborhood} />
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getTypeColor(neighborhood.type)}`}>
                            {getTypeLabel(neighborhood.type)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 px-4">
                          <div className="flex items-center gap-2 text-gray-600">
                            <Users size={14} />
                          <span className="text-sm font-bold">{neighborhood.userCount || 0}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Map size={14} />
                          <span className="text-sm font-bold">-</span>
                            <span className="text-xs text-gray-500">גינות</span>
                          </div>
                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-bold">
                          {neighborhood.managerIds?.length || 0} מנהלים
                        </span>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          <Link
                            href={`/admin/authorities/${neighborhood.id}`}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="ערוך"
                          >
                            <Edit2 size={16} />
                          </Link>
                          <button
                            onClick={() => onDelete(neighborhood.id, neighborhood.name)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="מחק"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Regional Councils with Settlements */}
        {filteredGroupedData.regionalCouncils.map((council) => {
          const enhancedCouncil = enhancedAuthorities.find(a => a.id === council.id);
          const isExpanded = expandedCouncils.has(council.id);
          
          const aggregatedUsersCount = council.settlements.reduce(
            (sum, s) => sum + (s.userCount || 0), 
            council.userCount || 0
          );
          
          return (
            <div key={council.id} className="border-b border-gray-200 last:border-b-0">
              {/* Regional Council Row */}
              <div 
                className="hover:bg-blue-50/50 transition-colors group cursor-pointer"
                onClick={() => onOpenDrawer?.(council)}
              >
                <div className="flex items-center px-6 py-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleCouncil(council.id); }}
                    className="p-1 hover:bg-blue-100 rounded-lg transition-colors mr-2"
                  >
                    {isExpanded ? (
                      <ChevronDown size={20} className="text-gray-600" />
                    ) : (
                      <ChevronRight size={20} className="text-gray-600" />
                    )}
                  </button>
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mr-4">
                    {council.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={council.logoUrl}
                        alt={council.name}
                        className="w-12 h-12 rounded-lg object-cover"
                      />
                    ) : (
                      <Building2 size={20} className="text-gray-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-900">{council.name}</span>
                      <OverdueAlertBadge authority={council} />
                      <PipelineStatusBadge status={council.pipelineStatus} />
                      {council.settlements.length > 0 && (
                        <span className="text-xs text-gray-500">
                          ({council.settlements.length} יישובים)
                        </span>
                      )}
                    </div>
                    <div className="mt-1">
                      <PrimaryContactInfo authority={council} />
                    </div>
                  </div>
                  <div className="flex items-center gap-6 px-4">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Users size={16} />
                      <span className="font-bold">{aggregatedUsersCount}</span>
                      {council.settlements.length > 0 && (
                        <span className="text-xs text-gray-500">סה"כ</span>
                      )}
                    </div>
                    {enhancedCouncil?.aggregatedParksCount !== undefined && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <Map size={16} />
                        <span className="font-bold">{enhancedCouncil.aggregatedParksCount}</span>
                        <span className="text-xs text-gray-500">גינות</span>
                      </div>
                    )}
                    {/* Active Client Toggle */}
                    <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={council.isActiveClient || false}
                        onChange={() => onToggleActiveClient(council.id, council.isActiveClient || false)}
                        className="w-5 h-5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700 font-medium">לקוח פעיל</span>
                    </label>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/admin/authorities/${council.id}`}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="ערוך"
                      >
                        <Edit2 size={18} />
                      </Link>
                      <button
                        onClick={() => onDelete(council.id, council.name)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="מחק"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Settlements (nested) */}
              {isExpanded && council.settlements.length > 0 && (
                <div className="bg-gray-50/50 border-t border-gray-200">
                  {council.settlements.map((settlement, idx) => (
                    <div
                      key={settlement.id}
                      className={`flex items-center px-6 py-3 hover:bg-gray-100 transition-colors group cursor-pointer ${
                        idx < council.settlements.length - 1 ? 'border-b border-gray-200' : ''
                      }`}
                      style={{ paddingRight: '3rem' }} // Indent child items
                      onClick={() => onOpenDrawer?.(settlement)}
                    >
                      <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0 mr-4 ml-16">
                        <Building2 size={14} className="text-gray-500" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-gray-700">{settlement.name}</span>
                          <OverdueAlertBadge authority={settlement} />
                          <span className={`px-2 py-0.5 rounded text-xs font-bold border ${getTypeColor(settlement.type)}`}>
                            {getTypeLabel(settlement.type)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 px-4">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Users size={14} />
                          <span className="text-sm font-bold">{settlement.userCount || 0}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-600">
                          <Map size={14} />
                          <span className="text-sm font-bold">-</span>
                          <span className="text-xs text-gray-500">גינות</span>
                        </div>
                        <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-bold">
                          {settlement.managerIds?.length || 0} מנהלים
                        </span>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                          <Link
                            href={`/admin/authorities/${settlement.id}`}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="ערוך"
                          >
                            <Edit2 size={16} />
                          </Link>
                          <button
                            onClick={() => onDelete(settlement.id, settlement.name)}
                            className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="מחק"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Standalone Authorities (Cities and Local Councils without parent) */}
        {filteredGroupedData.standaloneAuthorities.map((authority) => (
          <div
            key={authority.id}
            className="hover:bg-blue-50/50 transition-colors group px-6 py-4 cursor-pointer"
            onClick={() => onOpenDrawer?.(authority)}
          >
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mr-4">
                {authority.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={authority.logoUrl}
                    alt={safeRenderText(authority.name)}
                    className="w-12 h-12 rounded-lg object-cover"
                  />
                ) : (
                  <Building2 size={20} className="text-gray-400" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-gray-900">{safeRenderText(authority.name)}</span>
                  <OverdueAlertBadge authority={authority} />
                  <PipelineStatusBadge status={authority.pipelineStatus} />
                </div>
                <div className="mt-1">
                  <PrimaryContactInfo authority={authority} />
                </div>
              </div>
              <div className="flex items-center gap-6 px-4">
                <div className="flex items-center gap-2 text-gray-600">
                  <Users size={16} />
                  <span className="font-bold">{authority.userCount || 0}</span>
                </div>
                <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-bold">
                  {authority.managerIds?.length || 0} מנהלים
                </span>
                {/* Active Client Toggle */}
                <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={authority.isActiveClient || false}
                    onChange={() => onToggleActiveClient(authority.id, authority.isActiveClient || false)}
                    className="w-5 h-5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                  />
                  <span className="text-sm text-gray-700 font-medium">לקוח פעיל</span>
                </label>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                  <Link
                    href={`/admin/authorities/${authority.id}`}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="ערוך"
                  >
                    <Edit2 size={18} />
                  </Link>
                  <button
                    onClick={() => onDelete(authority.id, authority.name)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="מחק"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Flat view
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-right">
        <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-bold sticky top-0">
          <tr>
            <th className="px-6 py-4 rounded-tr-2xl">לוגו</th>
            <th className="px-6 py-4">שם הרשות</th>
            <th className="px-6 py-4">סטטוס CRM</th>
            <th className="px-6 py-4">איש קשר</th>
            <th className="px-6 py-4">משתמשים</th>
            <th className="px-6 py-4 text-center">סטטוס לקוח</th>
            <th className="px-6 py-4 rounded-tl-2xl text-center">פעולות</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {filteredAuthorities.map((authority) => (
            <tr
              key={authority.id}
              className="hover:bg-blue-50/50 transition-colors group cursor-pointer"
              onClick={() => onOpenDrawer?.(authority)}
            >
              <td className="px-6 py-4">
                {authority.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={authority.logoUrl}
                    alt={safeRenderText(authority.name)}
                    className="w-12 h-12 rounded-lg object-cover bg-gray-100"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Building2 size={20} className="text-gray-400" />
                  </div>
                )}
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <div className="font-bold text-gray-900">{safeRenderText(authority.name)}</div>
                  <OverdueAlertBadge authority={authority} />
                </div>
                {authority.parentAuthorityId && (
                  <div className="text-xs text-gray-500 mt-1">שייך למועצה אזורית</div>
                )}
              </td>
              <td className="px-6 py-4">
                <PipelineStatusBadge status={authority.pipelineStatus} />
              </td>
              <td className="px-6 py-4">
                <PrimaryContactInfo authority={authority} />
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2 text-gray-600">
                  <Users size={16} />
                  <span className="font-bold">{authority.userCount || 0}</span>
                </div>
              </td>
              <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                <label className="flex items-center justify-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={authority.isActiveClient || false}
                    onChange={() => onToggleActiveClient(authority.id, authority.isActiveClient || false)}
                    className="w-5 h-5 rounded border-gray-300 text-cyan-600 focus:ring-cyan-500 cursor-pointer"
                  />
                  <span className="text-sm text-gray-700 font-medium">
                    {authority.isActiveClient ? (
                      <span className="flex items-center gap-1 text-green-600">
                        <CheckCircle2 size={16} />
                        פעיל
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-gray-400">
                        <XCircle size={16} />
                        לא פעיל
                      </span>
                    )}
                  </span>
                </label>
              </td>
              <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link
                    href={`/admin/authorities/${authority.id}`}
                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="ערוך"
                  >
                    <Edit2 size={18} />
                  </Link>
                  <button
                    onClick={() => onDelete(authority.id, authority.name)}
                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    title="מחק"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
