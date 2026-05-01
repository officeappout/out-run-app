'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
    LayoutDashboard, 
    Dumbbell, 
    ClipboardList, 
    Package, 
    LogOut, 
    Shield, 
    Users, 
    TrendingUp, 
    MessageCircle, 
    ListTodo,
    Building2,
    Camera,
    Video,
    Megaphone,
    Settings,
    ChevronDown,
    Zap,
    Bell,
    FileText,
    LayoutGrid,
    Map,
    Signal,
    Flag,
    GraduationCap,
    Footprints,
    Activity,
    GitMerge,
    GitBranch,
    BarChart3,
    FlaskConical,
    Route,
    ShieldCheck,
    CalendarHeart,
    ClipboardCheck,
    Trophy,
    KeyRound,
    Globe,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole, isOnlyAuthorityManager, isSystemAdmin as checkIsSystemAdmin, UserRoleInfo } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager, getAllAuthorities, getAuthority } from '@/features/admin/services/authority.service';
import { signOutUser } from '@/lib/auth.service';
import { authorityTypeToTenantType, getTenantLabels, orgTypeDisplayName, VERTICAL_THEMES } from '@/features/admin/config/tenantLabels';
import type { Authority } from '@/types/admin-types';
import { getSidebarConfig, type LucideIconName } from '@/features/admin/config/sidebarConfigs';
import { OrgSelectorProvider, useOrgSelector } from '@/features/admin/context/OrgSelectorContext';
import { AdminSessionSync } from '@/features/admin/components/AdminSessionSync';


// Icon map for data-driven sidebar rendering
const ICON_MAP: Record<LucideIconName, React.ElementType> = {
  LayoutDashboard, BarChart3, Activity, Map, Route,
  Users, Flag, CalendarHeart, ShieldCheck, GraduationCap,
  ClipboardCheck, Trophy, Building2, KeyRound, Shield,
};

// Section IDs for collapsible state — vertical-based for Super Admin
type SectionId = 'strategy' | 'municipal' | 'military' | 'educational' | 'platform' | 'appCore' | 'running' | 'production' | 'brandComm' | 'system';

// Helper to check if a section contains the active path
const sectionContainsPath = (sectionId: SectionId, pathname: string | null, orgType?: string, urlType?: string): boolean => {
    if (!pathname) return false;

    // Shared routes — prefer URL ?type= param, then fall back to orgType context
    const effectiveType = urlType || orgType || '';
    if (pathname.startsWith('/admin/authority/units')) {
        const mapping: Record<string, SectionId> = { military: 'military', educational: 'educational', municipal: 'municipal' };
        return sectionId === (mapping[effectiveType] ?? 'municipal');
    }
    if (pathname.startsWith('/admin/authority/team')) {
        const mapping: Record<string, SectionId> = { military: 'military', educational: 'educational', municipal: 'municipal' };
        return sectionId === (mapping[effectiveType] ?? 'platform');
    }
    
    const sectionPaths: Record<SectionId, string[]> = {
        strategy: ['/admin', '/admin/roadmap'],
        municipal: ['/admin/authorities', '/admin/approval-center', '/admin/authority-manager', '/admin/pressure-messages', '/admin/authority/reports', '/admin/heatmap'],
        military: ['/admin/authority/readiness'],
        educational: ['/admin/authority/grades'],
        platform: ['/admin/admin-directory', '/admin/access-codes', '/admin/organizations'],
        appCore: ['/admin/locations', '/admin/parks', '/admin/routes', '/admin/exercises', '/admin/programs', '/admin/levels', '/admin/progression-manager', '/admin/level-equivalence', '/admin/gym-equipment', '/admin/brands', '/admin/gear-definitions', '/admin/questionnaire', '/admin/visual-assessment', '/admin/assessment-rules', '/admin/program-thresholds', '/admin/demo-seed'],
        running: ['/admin/running'],
        production: ['/admin/content-matrix', '/admin/content-status', '/admin/media-library'],
        brandComm: ['/admin/messages', '/admin/workout-settings', '/admin/simulator', '/admin/workout-simulator'],
        system: ['/admin/admins-management', '/admin/users', '/admin/audit-logs', '/admin/system-settings'],
    };
    
    const paths = sectionPaths[sectionId];
    return paths.some(path => {
        if (path === '/admin') {
            return pathname === '/admin';
        }
        return pathname.startsWith(path);
    });
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return (
        <OrgSelectorProvider>
            <AdminLayoutInner>{children}</AdminLayoutInner>
        </OrgSelectorProvider>
    );
}

function AdminLayoutInner({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParamsRaw = useSearchParams();
    const orgCtx = useOrgSelector();

    // URL ?type= param is the source of truth for which vertical the user is in
    const urlVerticalType = searchParamsRaw?.get('type') || '';
    const [roleInfo, setRoleInfo] = useState<UserRoleInfo | null>(null);
    const [onlyAuthorityManager, setOnlyAuthorityManager] = useState(false);
    const [isSystemAdminOnly, setIsSystemAdminOnly] = useState(false);
    const [loading, setLoading] = useState(true);
    const [authorityName, setAuthorityName] = useState<string | null>(null);

    // Stable ref so the auth useEffect callback always reads the current pathname
    // without re-subscribing onAuthStateChanged on every navigation.
    const pathnameRef = useRef<string | null>(pathname);
    useEffect(() => { pathnameRef.current = pathname; }, [pathname]);
    const [authorityType, setAuthorityType] = useState<string | null>(null);
    const [managedAuthorityId, setManagedAuthorityId] = useState<string | null>(null);
    
    // Organization selector for Super Admins (kept for backward compat with local state)
    const [allOrganizations, setAllOrganizations] = useState<Authority[]>([]);
    const selectedOrgId = orgCtx.selectedOrgId;

    // Collapsible sections state
    const [expandedSections, setExpandedSections] = useState<Set<SectionId>>(new Set(['strategy']));

    // Load expanded sections from localStorage on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('adminSidebarSections');
            if (saved) {
                try {
                    const parsed = JSON.parse(saved);
                    setExpandedSections(new Set(parsed));
                } catch {
                    // Invalid JSON, use default
                }
            }
        }
    }, []);

    // Auto-expand section containing active path (tenant-type-aware for shared routes)
    useEffect(() => {
        if (pathname) {
            const sections: SectionId[] = ['strategy', 'municipal', 'military', 'educational', 'platform', 'appCore', 'running', 'production', 'brandComm', 'system'];
            for (const section of sections) {
                if (sectionContainsPath(section, pathname, orgCtx.selectedOrgType, urlVerticalType)) {
                    setExpandedSections(prev => {
                        const next = new Set(prev);
                        next.add(section);
                        return next;
                    });
                    break;
                }
            }
        }
    }, [pathname, orgCtx.selectedOrgType, urlVerticalType]);

    // Save expanded sections to localStorage
    const toggleSection = useCallback((sectionId: SectionId) => {
        setExpandedSections(prev => {
            const next = new Set(prev);
            if (next.has(sectionId)) {
                next.delete(sectionId);
            } else {
                next.add(sectionId);
            }
            if (typeof window !== 'undefined') {
                localStorage.setItem('adminSidebarSections', JSON.stringify([...next]));
            }
            return next;
        });
    }, []);

    const handleLogout = async () => {
        try {
            await signOutUser();
            const isLocalAdmin = onlyAuthorityManager || (roleInfo?.isTenantOwner && !roleInfo?.isSuperAdmin && !roleInfo?.isSystemAdmin && !roleInfo?.isAuthorityManager);
            if (isLocalAdmin) {
                router.push('/authority-portal/login');
            } else {
                router.push('/admin/login');
            }
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    useEffect(() => {
        // onAuthStateChanged must NOT list `pathname` or `router` as deps:
        // those change on every navigation, which would unsubscribe + re-subscribe
        // the listener and re-run the entire Firestore auth chain (getIdToken +
        // checkUserRole + getAllAuthorities) on every page change. Instead we read
        // `pathnameRef.current` (kept in sync by the effect above) for the public-path
        // check, and use `window.location` / `router` captured at mount time for redirects.
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            const publicPaths = ['/admin/login', '/admin/auth/callback', '/admin/authority-login', '/admin/pending-approval'];
            const isPublicPath = publicPaths.some(path => pathnameRef.current?.startsWith(path));

            if (!user) {
                // Not authenticated - redirect to login (unless on public path)
                if (!isPublicPath) {
                    if (pathnameRef.current?.startsWith('/admin/authority-manager')) {
                        if (typeof window !== 'undefined') {
                            window.location.href = '/admin/authority-login';
                        }
                    } else {
                        // Redirect to admin login for all other admin routes
                        router.push('/admin/login');
                    }
                }
                setRoleInfo({
                    role: 'none',
                    isSuperAdmin: false,
                    isSystemAdmin: false,
                    isVerticalAdmin: false,
                    isAuthorityManager: false,
                    isRootAdmin: false,
                    isTenantOwner: false,
                    authorityIds: [],
                    isApproved: false,
                });
                setOnlyAuthorityManager(false);
                setIsSystemAdminOnly(false);
                setLoading(false);
                return;
            }

            try {
                // Force-refresh the ID token before any Firestore calls.
                // onAuthStateChanged may fire with a cached (potentially stale) token;
                // refreshing here ensures Firestore receives a valid credential and that
                // any custom claims set server-side are reflected in the first requests.
                await user.getIdToken(/* forceRefresh */ true);

                // Pass user email for allowlist check
                const info = await checkUserRole(user.uid, user.email);
                setRoleInfo(info);
                
                // Check if user has NO admin access at all
                if (!info.isSuperAdmin && !info.isSystemAdmin && !info.isAuthorityManager && !info.isTenantOwner && !info.isVerticalAdmin && !isPublicPath) {
                    console.warn('Access denied: User is not an authorized admin');
                    router.push('/admin/login');
                    setLoading(false);
                    return;
                }
                
                const isOnly = await isOnlyAuthorityManager(user.uid);
                setOnlyAuthorityManager(isOnly);
                const isSystemOnly = await checkIsSystemAdmin(user.uid);
                setIsSystemAdminOnly(isSystemOnly);
                
                // Load all orgs for Super Admins → push into OrgSelector context
                if (info.isSuperAdmin) {
                    try {
                        const orgs = await getAllAuthorities();
                        setAllOrganizations(orgs);
                        orgCtx?.setAllOrgs(orgs);
                    } catch { /* non-critical */ }
                }

                // Vertical Admin: load orgs filtered to their managed vertical
                if (info.isVerticalAdmin && info.managedVertical && !info.isSuperAdmin) {
                    try {
                        const orgs = await getAllAuthorities();
                        const filtered = orgs.filter(o => authorityTypeToTenantType(o.type) === info.managedVertical);
                        setAllOrganizations(filtered);
                        orgCtx?.setAllOrgs(filtered);
                    } catch { /* non-critical */ }
                }

                if (isOnly || info.isAuthorityManager) {
                    try {
                        const authorities = await getAuthoritiesByManager(user.uid);
                        if (authorities.length > 0) {
                            const auth = authorities[0];
                            const name = auth.name;
                            const sanitizedName = typeof name === 'object' && name !== null ? (name.he || name.en || '') : (name || '');
                            setAuthorityName(sanitizedName);
                            setAuthorityType(auth.type ?? null);
                            setManagedAuthorityId(auth.id);

                            if (isOnly && typeof window !== 'undefined') {
                                localStorage.setItem('admin_selected_authority_id', auth.id);
                            }
                            orgCtx?.setSelectedOrgId(auth.id);
                        }
                    } catch (error) {
                        console.error('Error loading authority name:', error);
                    }
                }

                // Tenant Owner who is NOT an authority manager — load org from tenantId
                if (info.isTenantOwner && !info.isAuthorityManager && info.tenantId) {
                    try {
                        const tenantAuth = await getAuthority(info.tenantId);
                        if (tenantAuth) {
                            const name = tenantAuth.name;
                            const sanitizedName = typeof name === 'object' && name !== null ? (name.he || name.en || '') : (name || '');
                            setAuthorityName(sanitizedName);
                            setAuthorityType(tenantAuth.type ?? null);
                            setManagedAuthorityId(tenantAuth.id);
                            orgCtx?.setSelectedOrgId(tenantAuth.id);
                        }
                    } catch { /* non-critical */ }
                }
            } catch (error) {
                console.error('Error checking user role:', error);
                setRoleInfo({
                    role: 'none',
                    isSuperAdmin: false,
                    isSystemAdmin: false,
                    isVerticalAdmin: false,
                    isAuthorityManager: false,
                    isRootAdmin: false,
                    isTenantOwner: false,
                    authorityIds: [],
                    isApproved: false,
                });
                setOnlyAuthorityManager(false);
                setIsSystemAdminOnly(false);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // intentionally empty — pathnameRef.current keeps pathname fresh without re-subscribing

    const isSuperAdmin = roleInfo?.isSuperAdmin ?? false;
    const isSystemAdmin = roleInfo?.isSystemAdmin ?? false;
    const isVerticalAdminOnly = (roleInfo?.isVerticalAdmin ?? false) && !isSuperAdmin && !isSystemAdmin;
    const isAuthorityManager = roleInfo?.isAuthorityManager ?? false;
    const isTenantOwnerOnly = (roleInfo?.isTenantOwner ?? false) && !isSuperAdmin && !isSystemAdmin && !isAuthorityManager;
    const isLocalManager = onlyAuthorityManager || isTenantOwnerOnly;
    
    const isNeighborhoodAdmin = onlyAuthorityManager && authorityType === 'neighborhood';
    const showFullSidebar = !isLocalManager;
    const showSimplifiedSidebar = isLocalManager;
    const showAuthorityManagerLink = isAuthorityManager || isTenantOwnerOnly;
    const tenantLabels = getTenantLabels(authorityTypeToTenantType(authorityType));
    const verticalAdminVertical = roleInfo?.managedVertical;
    
    // Route protection — strict allowlist for Authority Managers, Tenant Owners & Vertical Admins
    useEffect(() => {
        if (!loading && roleInfo) {
            // Vertical Admin route protection
            const vaOnly = roleInfo.isVerticalAdmin && !roleInfo.isSuperAdmin && !roleInfo.isSystemAdmin;
            if (vaOnly) {
                const vaAllowedPaths = [
                    '/admin/organizations',
                    '/admin/authority-manager',
                    '/admin/dashboard',
                    '/admin/authority/locations',
                    '/admin/authority/routes',
                    '/admin/authority/reports',
                    '/admin/authority/team',
                    '/admin/authority/community',
                    '/admin/authority/events',
                    '/admin/authority/users',
                    '/admin/authority/neighborhoods',
                    '/admin/authority/readiness',
                    '/admin/authority/units',
                    '/admin/authority/grades',
                    '/admin/heatmap',
                    '/admin/access-codes',
                    '/admin/admin-directory',
                    '/admin/auth/callback',
                    '/admin/authority-login',
                    '/admin/pending-approval',
                ];
                const isAllowed = vaAllowedPaths.some(p => pathname?.startsWith(p));
                if (!isAllowed && !pathname?.startsWith('/admin/login')) {
                    router.replace('/admin/organizations');
                    return;
                }
            }

            const localTenantOwnerOnly = roleInfo.isTenantOwner && !roleInfo.isSuperAdmin && !roleInfo.isSystemAdmin && !roleInfo.isAuthorityManager;
            if (onlyAuthorityManager || localTenantOwnerOnly) {
                const allowedPaths = [
                    '/admin/authority-manager',
                    '/admin/dashboard',
                    '/admin/authority/locations',
                    '/admin/authority/routes',
                    '/admin/authority/reports',
                    '/admin/authority/team',
                    '/admin/authority/community',
                    '/admin/authority/events',
                    '/admin/authority/users',
                    '/admin/authority/neighborhoods',
                    '/admin/authority/readiness',
                    '/admin/authority/units',
                    '/admin/authority/grades',
                    '/admin/approval-center',
                    '/admin/parks',
                    '/admin/locations',
                    '/admin/heatmap',
                    '/admin/insights',
                    '/admin/statistics',
                    '/admin/auth/callback',
                    '/admin/authority-login',
                    '/admin/pending-approval',
                    '/admin/access-codes',
                    '/admin/admin-directory',
                    '/admin/organizations',
                ];
                
                const isAllowed = allowedPaths.some(p => pathname?.startsWith(p));
                
                if (!isAllowed) {
                    if (pathname?.startsWith('/admin/login') || pathname?.startsWith('/admin/system-settings')) {
                        if (typeof window !== 'undefined') {
                            window.location.href = '/authority-portal/login';
                        }
                        return;
                    }
                    router.replace('/admin/dashboard');
                    return;
                }
            }
            
            if (isSystemAdminOnly) {
                const unauthorizedPaths = [
                    '/admin/authorities',
                    '/admin/users/all',
                    '/admin/admins-management',
                ];
                
                if (unauthorizedPaths.some(path => pathname?.startsWith(path))) {
                    router.replace('/admin');
                    return;
                }
            }
            
            if ((isSuperAdmin || isSystemAdmin) && pathname?.startsWith('/authority-portal')) {
                router.replace('/admin/login');
                return;
            }
        }
    }, [pathname, loading, roleInfo, onlyAuthorityManager, isSystemAdminOnly, isSuperAdmin, isSystemAdmin, router]);

    if (pathname?.startsWith('/admin/authority-login') || pathname?.startsWith('/admin/pending-approval')) {
        return (
            <>
                <AdminSessionSync />
                {children}
            </>
        );
    }

    // Helper component for sidebar links
    const SidebarLink = ({ href, icon: Icon, label, isActive }: { href: string; icon: React.ElementType; label: string; isActive?: boolean }) => {
        const active = isActive ?? (href === '/admin' ? pathname === '/admin' : pathname?.startsWith(href));
        return (
            <Link
                href={href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl font-medium transition-all text-sm ${
                    active
                        ? 'bg-slate-800/50 text-cyan-400 font-bold'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
            >
                <Icon size={18} />
                <span>{label}</span>
            </Link>
        );
    };

    const SectionHeader = ({ sectionId, icon: Icon, label, colorClass }: { sectionId: SectionId; icon: React.ElementType; label: string; colorClass?: string }) => {
        const isExpanded = expandedSections.has(sectionId);
        const hasActiveChild = sectionContainsPath(sectionId, pathname, orgCtx.selectedOrgType);
        const activeColor = colorClass && hasActiveChild ? colorClass : hasActiveChild ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200';
        
        return (
            <button
                onClick={() => toggleSection(sectionId)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${activeColor}`}
            >
                <Icon size={18} className={colorClass ?? ''} />
                <span className="flex-1 text-right">{label}</span>
                <ChevronDown 
                    size={16} 
                    className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
                />
            </button>
        );
    };

    if (loading) {
        return (
            <div className="flex min-h-[100dvh] bg-gray-100 overflow-hidden" dir="rtl" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
                <AdminSessionSync />
                <aside className="w-64 bg-slate-900 text-white flex-shrink-0 hidden md:flex flex-col relative min-h-[100dvh] overflow-y-auto">
                    <div className="p-4 md:p-6 border-b border-slate-800">
                        {onlyAuthorityManager && authorityName ? (
                            <div>
                                <h1 className="text-lg md:text-xl font-black tracking-tight text-white mb-1">
                                    OUT RUN <span className="text-cyan-400">Admin</span>
                                </h1>
                                <p className="text-xs md:text-sm text-slate-300 font-medium">
                                    פורטל ניהול: {authorityName || ''}
                                </p>
                            </div>
                        ) : (
                            <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
                                OUT RUN <span className="text-cyan-400">Admin</span>
                            </h1>
                        )}
                    </div>
                    <div className="p-4 md:p-8">
                        <div className="animate-pulse space-y-4">
                            <div className="h-4 bg-slate-700 rounded w-3/4"></div>
                            <div className="h-4 bg-slate-700 rounded w-1/2"></div>
                        </div>
                    </div>
                </aside>
                <main className="flex-1 overflow-y-auto min-h-[100dvh] bg-white">
                    <div className="p-4 md:p-8 min-h-full bg-white text-slate-900" style={{ colorScheme: 'light' }}>
                        <div className="flex items-center justify-center h-64">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
                                <p className="text-sm md:text-base text-slate-700">בודק הרשאות...</p>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-[100dvh] bg-gray-100 overflow-hidden" dir="rtl" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <AdminSessionSync />
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-white flex-shrink-0 hidden md:flex flex-col relative min-h-[100dvh]">
                <div className="p-4 md:p-6 border-b border-slate-800 flex-shrink-0">
                    {isLocalManager && authorityName ? (
                        <div>
                            <h1 className="text-lg md:text-xl font-black tracking-tight text-white">
                                OUT RUN <span className="text-cyan-400">Admin</span>
                            </h1>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">
                                פורטל ניהול: {authorityName}
                            </p>
                        </div>
                    ) : (
                        <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
                            OUT RUN <span className="text-cyan-400">Admin</span>
                        </h1>
                    )}
                </div>

                <nav className="p-2 md:p-3 flex flex-col flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                    {showSimplifiedSidebar ? (
                        isNeighborhoodAdmin && managedAuthorityId ? (
                        /* ── Neighborhood Admin — minimal sidebar ── */
                        <div className="space-y-1">
                            {authorityName && (
                                <div className="px-4 py-2.5 mb-3 rounded-xl bg-emerald-900/30 border border-emerald-700/30">
                                    <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">פורטל שכונתי</p>
                                    <p className="text-sm font-black text-white truncate">{authorityName}</p>
                                </div>
                            )}

                            <SidebarLink href={`/admin/authority/neighborhoods/${managedAuthorityId}`} icon={Building2} label="השכונה שלי" />
                            <SidebarLink href="/admin/authority/locations" icon={Map} label="מיקומים" />
                            <SidebarLink href="/admin/authority/reports" icon={Flag} label="דיווחים" />
                        </div>
                        ) : (() => {
                        /* ── Data-driven Portal sidebar (military / school / municipal / etc.) ── */
                        const sidebarCfg = getSidebarConfig(authorityType);
                        return (
                        <div className="space-y-1">
                            {authorityName && (
                                <div className={`px-4 py-2.5 mb-3 rounded-xl border ${sidebarCfg.badgeColorClass}`}>
                                    <p className={`text-[10px] font-bold uppercase tracking-widest ${sidebarCfg.badgeTextClass}`}>{tenantLabels.portalBadge}</p>
                                    <p className="text-sm font-black text-white truncate">{authorityName}</p>
                                </div>
                            )}

                            {sidebarCfg.sections.map((section, sIdx) => (
                                <div key={sIdx}>
                                    {section.title && (
                                        <p className={`text-[10px] font-bold text-slate-500 uppercase tracking-widest px-4 ${sIdx === 0 ? 'pt-1' : 'pt-3'} pb-0.5`}>
                                            {section.title}
                                        </p>
                                    )}
                                    {section.links.map((link) => {
                                        const resolvedHref = link.href.replace('__MANAGED_ID__', managedAuthorityId ?? '');
                                        const resolvedLabel = link.label ?? (link.labelKey ? tenantLabels[link.labelKey] : '');
                                        const IconComponent = ICON_MAP[link.icon] ?? Users;
                                        return (
                                            <SidebarLink
                                                key={resolvedHref}
                                                href={resolvedHref}
                                                icon={IconComponent}
                                                label={resolvedLabel as string}
                                            />
                                        );
                                    })}
                                </div>
                            ))}
                        </div>
                        );
                        })()
                    ) : showFullSidebar ? (
                        /* Full sidebar for Super Admins — 3 clean groups */
                        <div className="space-y-1">
                            {/* ═══ Group 1: אסטרטגיה ומבט על ═══ */}
                            <SectionHeader sectionId="strategy" icon={TrendingUp} label="אסטרטגיה ומבט על" />
                            {expandedSections.has('strategy') && (
                                <div className="pr-2 space-y-0.5 pb-2">
                                    <SidebarLink href="/admin" icon={LayoutDashboard} label="דשבורד ראשי" />
                                    <SidebarLink href="/admin/roadmap" icon={ListTodo} label="מפת דרכים ופידבקים" />
                                </div>
                            )}

                            {/* ═══ Vertical 1: ניהול עירוני (Municipal Management) ═══ */}
                            {!isSystemAdminOnly && (!isVerticalAdminOnly || verticalAdminVertical === 'municipal') && (
                                <>
                                    <SectionHeader sectionId="municipal" icon={Building2} label="ניהול עירוני" colorClass={VERTICAL_THEMES.municipal.sidebarIcon} />
                                    {expandedSections.has('municipal') && (
                                        <div className="pr-2 space-y-0.5 pb-2 border-r-2 border-blue-700/40 mr-2">
                                            <SidebarLink href="/admin/authorities" icon={Building2} label="ניהול רשויות — CRM" />
                                            <SidebarLink
                                                href="/admin/authority/units?type=municipal"
                                                icon={Users}
                                                label="שכונות ויישובים"
                                                isActive={pathname?.startsWith('/admin/authority/units') && (urlVerticalType === 'municipal' || (!urlVerticalType && orgCtx.selectedOrgType === 'municipal'))}
                                            />
                                            <SidebarLink
                                                href="/admin/authority/team?type=municipal"
                                                icon={Users}
                                                label="ניהול צוות רשותי"
                                                isActive={pathname?.startsWith('/admin/authority/team') && (urlVerticalType === 'municipal' || (!urlVerticalType && (!orgCtx.selectedOrgType || orgCtx.selectedOrgType === 'municipal')))}
                                            />
                                            {showAuthorityManagerLink && (
                                                <SidebarLink href="/admin/authority-manager" icon={BarChart3} label="דשבורד אנליטיקה" />
                                            )}
                                            <SidebarLink href="/admin/pressure-messages" icon={Megaphone} label="מסרי לחץ" />
                                            <SidebarLink href="/admin/authority/reports" icon={Flag} label="דיווחי תחזוקה" />
                                            <SidebarLink href="/admin/heatmap" icon={Activity} label="מפת חום חיה" />
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ═══ Vertical 2: צי צבאי (Military Fleet) ═══ */}
                            {!isSystemAdminOnly && (!isVerticalAdminOnly || verticalAdminVertical === 'military') && (
                                <>
                                    <SectionHeader sectionId="military" icon={ShieldCheck} label="צי צבאי" colorClass={VERTICAL_THEMES.military.sidebarIcon} />
                                    {expandedSections.has('military') && (
                                        <div className="pr-2 space-y-0.5 pb-2 border-r-2 border-lime-700/40 mr-2">
                                            <SidebarLink
                                                href="/admin/authority/units?type=military"
                                                icon={Shield}
                                                label="היררכיית יחידות"
                                                isActive={pathname?.startsWith('/admin/authority/units') && (urlVerticalType === 'military' || (!urlVerticalType && orgCtx.selectedOrgType === 'military'))}
                                            />
                                            <SidebarLink
                                                href="/admin/authority/team?type=military"
                                                icon={Shield}
                                                label="ניהול צוות צבאי"
                                                isActive={pathname?.startsWith('/admin/authority/team') && (urlVerticalType === 'military' || (!urlVerticalType && orgCtx.selectedOrgType === 'military'))}
                                            />
                                            <SidebarLink href="/admin/authority/readiness" icon={ShieldCheck} label="מד כשירות" />
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ═══ Vertical 3: רשת חינוכית (Educational Network) ═══ */}
                            {!isSystemAdminOnly && (!isVerticalAdminOnly || verticalAdminVertical === 'educational') && (
                                <>
                                    <SectionHeader sectionId="educational" icon={GraduationCap} label="רשת חינוכית" colorClass={VERTICAL_THEMES.educational.sidebarIcon} />
                                    {expandedSections.has('educational') && (
                                        <div className="pr-2 space-y-0.5 pb-2 border-r-2 border-orange-600/40 mr-2">
                                            <SidebarLink
                                                href="/admin/authority/units?type=educational"
                                                icon={GraduationCap}
                                                label="בתי ספר ושכבות"
                                                isActive={pathname?.startsWith('/admin/authority/units') && (urlVerticalType === 'educational' || (!urlVerticalType && orgCtx.selectedOrgType === 'educational'))}
                                            />
                                            <SidebarLink href="/admin/authority/grades" icon={ClipboardCheck} label="ציוני חנ״ג" />
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ═══ ניהול ארגונים (Organization Management) ═══ */}
                            {!isSystemAdminOnly && (!isVerticalAdminOnly || true) && (
                                <>
                                    <SectionHeader sectionId="platform" icon={Globe} label="ניהול ארגונים" />
                                    {expandedSections.has('platform') && (
                                        <div className="pr-2 space-y-0.5 pb-2">
                                            <SidebarLink href="/admin/organizations" icon={Globe} label="ארגונים — CRM" />
                                            <SidebarLink href="/admin/admin-directory" icon={Users} label="ספריית מנהלים" />
                                            <SidebarLink href="/admin/access-codes" icon={KeyRound} label="קודי גישה" />
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Section 3: ליבת האפליקציה (App Core) */}
                            {!onlyAuthorityManager && !isVerticalAdminOnly && (
                                <>
                                    <SectionHeader sectionId="appCore" icon={Zap} label="ליבת האפליקציה" />
                                    {expandedSections.has('appCore') && (
                                        <div className="pr-2 space-y-0.5 pb-2">
                                            <SidebarLink href="/admin/locations" icon={Map} label="ניהול מיקומים על המפה" />
                                            <SidebarLink href="/admin/exercises" icon={Dumbbell} label="בנק תרגילים" />
                                            <SidebarLink href="/admin/programs" icon={ClipboardList} label="תוכניות אימון" />
                                            <SidebarLink href="/admin/levels" icon={Signal} label="רמות למור (Lemur Levels)" />
                                            <SidebarLink href="/admin/questionnaire" icon={ClipboardList} label="ניהול שאלון דינמי" />
                                            <SidebarLink href="/admin/visual-assessment" icon={Video} label="הערכה ויזואלית" />
                                            <SidebarLink href="/admin/assessment-rules" icon={GitBranch} label="מנוע כללים" />
                                            <SidebarLink href="/admin/program-thresholds" icon={BarChart3} label="סיפי תוכנית" />
                                            <SidebarLink href="/admin/progression-manager" icon={TrendingUp} label="מנהל התקדמות" />
                                            <SidebarLink href="/admin/level-equivalence" icon={Zap} label="שקילות רמות" />
                                            <SidebarLink href="/admin/schools" icon={GraduationCap} label="בתי ספר וארגונים" />
                                            
                                            {/* Equipment Sub-items */}
                                            <div className="pt-1 pr-2">
                                                <p className="text-xs font-medium text-slate-500 px-4 py-1">ניהול מתקנים וכושר</p>
                                                <SidebarLink href="/admin/gym-equipment" icon={Dumbbell} label="מתקני כושר" />
                                                <SidebarLink href="/admin/brands" icon={Package} label="מותגי מתקנים" />
                                                <SidebarLink href="/admin/gear-definitions" icon={Package} label="ציוד אישי" />
                                            </div>

                                            {/* Demo / seed tools */}
                                            <div className="pt-1 pr-2">
                                                <p className="text-xs font-medium text-slate-500 px-4 py-1">כלי דמו</p>
                                                <SidebarLink href="/admin/demo-seed" icon={FlaskConical} label="כלי דמו — שדרות" />
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Section: ריצה (Running Engine) */}
                            {!onlyAuthorityManager && !isVerticalAdminOnly && (
                                <>
                                    <SectionHeader sectionId="running" icon={Footprints} label="מנוע ריצה" />
                                    {expandedSections.has('running') && (
                                        <div className="pr-2 space-y-0.5 pb-2">
                                            <SidebarLink href="/admin/running" icon={LayoutDashboard} label="דשבורד ריצה" />
                                            <SidebarLink href="/admin/running/pace-map" icon={Activity} label="מפת קצבים" />
                                            <SidebarLink href="/admin/running/workouts" icon={Dumbbell} label="תבניות אימונים" />
                                            <SidebarLink href="/admin/running/programs" icon={GitMerge} label="תוכניות והתקדמות" />
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Section 4: סטודיו והפקה (Production Hub) */}
                            {!onlyAuthorityManager && !isVerticalAdminOnly && (
                                <>
                                    <SectionHeader sectionId="production" icon={Camera} label="סטודיו והפקה" />
                                    {expandedSections.has('production') && (
                                        <div className="pr-2 space-y-0.5 pb-2">
                                            <SidebarLink href="/admin/content-matrix" icon={Video} label="ניהול ימי צילום" />
                                            <SidebarLink href="/admin/media-library" icon={LayoutGrid} label="מאגר מדיה" />
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Section 5: שפה, מיתוג ותקשורת (Brand & Comm) */}
                            {!onlyAuthorityManager && !isVerticalAdminOnly && (
                                <>
                                    <SectionHeader sectionId="brandComm" icon={Megaphone} label="שפה, מיתוג ותקשורת" />
                                    {expandedSections.has('brandComm') && (
                                        <div className="pr-2 space-y-0.5 pb-2">
                                            <SidebarLink href="/admin/messages" icon={MessageCircle} label="תקשורת חכמה" />
                                            <SidebarLink href="/admin/workout-settings" icon={FileText} label="שפה ותיאורי אימונים" />
                                            <SidebarLink href="/admin/simulator" icon={Bell} label="סימולטור התראות" />
                                            <SidebarLink href="/admin/workout-simulator" icon={FlaskConical} label="סימולטור אימונים" />
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Section 6: ניהול מערכת (System) */}
                            {!isVerticalAdminOnly && <SectionHeader sectionId="system" icon={Settings} label="ניהול מערכת" />}
                            {!isVerticalAdminOnly && expandedSections.has('system') && (
                                <div className="pr-2 space-y-0.5 pb-2">
                    {!isSystemAdminOnly && (
                        <SidebarLink href="/admin/admins-management" icon={Shield} label="מנהלי מערכת" />
                    )}
                    {!isSystemAdminOnly && (
                        <SidebarLink href="/admin/users/all" icon={Users} label="כל המשתמשים" />
                    )}
                    <SidebarLink href="/admin/users" icon={Shield} label="אישורים ממתינים" />
                    <SidebarLink href="/admin/audit-logs" icon={FileText} label="יומן ביקורת" />
                    {isSuperAdmin && (
                        <SidebarLink href="/admin/system-settings" icon={Settings} label="הגדרות מערכת" />
                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Fallback simplified sidebar */
                        <div className="space-y-1">
                            <SidebarLink href="/admin/dashboard" icon={LayoutDashboard} label="דשבורד" />
                            <SidebarLink href="/admin/authority-manager" icon={BarChart3} label="אנליטיקה" />
                            <SidebarLink href="/admin/heatmap" icon={Activity} label="מפת חום חיה" />
                            <SidebarLink href="/admin/authority/locations" icon={Map} label="מיקומים" />
                            <SidebarLink href="/admin/authority/routes" icon={Route} label="מסלולים" />
                            <SidebarLink href="/admin/approval-center" icon={ShieldCheck} label="הבקשות שלי" />
                            <SidebarLink href="/admin/users/all" icon={Users} label="משתמשים" />
                        </div>
                    )}

                    {/* Logout Button */}
                    <div className="mt-auto pt-4 border-t border-slate-800">
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 font-medium transition-all hover:bg-red-900/20 hover:text-red-400"
                        >
                            <LogOut size={20} />
                            <span>התנתק</span>
                        </button>
                    </div>
                </nav>
            </aside>

            {/* Main Content */}
            {/* Full-screen map pages (route builder) must not be wrapped in the padded
                prose container: percentage heights inside a scroll container with padding
                break Mapbox's height resolution, rendering a blank canvas. */}
            {pathname === '/admin/routes/new' || pathname === '/admin/authority/routes/new' ? (
                <main className="flex-1 min-w-0 overflow-hidden min-h-[100dvh] bg-white flex flex-col">
                    {children}
                </main>
            ) : (
                <main className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden min-h-[100dvh] bg-white">
                    <div 
                        className="p-4 md:p-8 pb-16 min-h-full min-w-0 bg-white text-slate-900" 
                        style={{ 
                            colorScheme: 'light',
                            color: '#0f172a'
                        }}
                    >
                        <div 
                            className="min-w-0 text-slate-900 [&_*]:!text-slate-900 [&_input]:!text-slate-900 [&_textarea]:!text-slate-900 [&_select]:!text-slate-900 [&_label]:!text-slate-900 [&_p]:!text-slate-900 [&_span]:!text-slate-900 [&_td]:!text-slate-900 [&_th]:!text-slate-900 [&_h1]:!text-slate-900 [&_h2]:!text-slate-900 [&_h3]:!text-slate-900 [&_div]:!text-slate-900 [&_li]:!text-slate-900"
                            style={{ color: '#0f172a' }}
                        >
                            {children}
                        </div>
                    </div>
                </main>
            )}
        </div>
    );
}
