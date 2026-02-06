'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { 
    LayoutDashboard, 
    MapPin, 
    Dumbbell, 
    Waypoints, 
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
    LayoutGrid
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole, isOnlyAuthorityManager, isSystemAdmin as checkIsSystemAdmin, UserRoleInfo } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager } from '@/features/admin/services/authority.service';
import { signOutUser } from '@/lib/auth.service';

// Section IDs for collapsible state
type SectionId = 'overview' | 'municipalities' | 'appCore' | 'production' | 'brandComm' | 'system';

// Helper to check if a section contains the active path
const sectionContainsPath = (sectionId: SectionId, pathname: string | null): boolean => {
    if (!pathname) return false;
    
    const sectionPaths: Record<SectionId, string[]> = {
        overview: ['/admin', '/admin/roadmap'],
        municipalities: ['/admin/authorities', '/admin/approval-center', '/admin/authority-manager'],
        appCore: ['/admin/parks', '/admin/routes', '/admin/exercises', '/admin/programs', '/admin/progression-manager', '/admin/gym-equipment', '/admin/brands', '/admin/gear-definitions', '/admin/questionnaire'],
        production: ['/admin/content-matrix', '/admin/content-status'],
        brandComm: ['/admin/messages', '/admin/workout-settings', '/admin/simulator'],
        system: ['/admin/admins-management', '/admin/users', '/admin/audit-logs'],
    };
    
    const paths = sectionPaths[sectionId];
    return paths.some(path => {
        if (path === '/admin') {
            return pathname === '/admin';
        }
        return pathname.startsWith(path);
    });
};

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const router = useRouter();
    const pathname = usePathname();
    const [roleInfo, setRoleInfo] = useState<UserRoleInfo | null>(null);
    const [onlyAuthorityManager, setOnlyAuthorityManager] = useState(false);
    const [isSystemAdminOnly, setIsSystemAdminOnly] = useState(false);
    const [loading, setLoading] = useState(true);
    const [authorityName, setAuthorityName] = useState<string | null>(null);
    
    // Collapsible sections state
    const [expandedSections, setExpandedSections] = useState<Set<SectionId>>(new Set(['overview']));

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

    // Auto-expand section containing active path
    useEffect(() => {
        if (pathname) {
            const sections: SectionId[] = ['overview', 'municipalities', 'appCore', 'production', 'brandComm', 'system'];
            for (const section of sections) {
                if (sectionContainsPath(section, pathname)) {
                    setExpandedSections(prev => {
                        const next = new Set(prev);
                        next.add(section);
                        return next;
                    });
                    break;
                }
            }
        }
    }, [pathname]);

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
            if (onlyAuthorityManager) {
                router.push('/authority-portal/login');
            } else {
                router.push('/admin/login');
            }
        } catch (error) {
            console.error('Error signing out:', error);
        }
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            // Skip auth check for login-related pages
            const publicPaths = ['/admin/login', '/admin/auth/callback', '/admin/authority-login', '/admin/pending-approval'];
            const isPublicPath = publicPaths.some(path => pathname?.startsWith(path));
            
            if (!user) {
                // Not authenticated - redirect to login (unless on public path)
                if (!isPublicPath) {
                    if (pathname?.startsWith('/admin/authority-manager')) {
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
                    isAuthorityManager: false,
                    authorityIds: [],
                    isApproved: false,
                });
                setOnlyAuthorityManager(false);
                setIsSystemAdminOnly(false);
                setLoading(false);
                return;
            }

            try {
                // Pass user email for allowlist check
                const info = await checkUserRole(user.uid, user.email);
                setRoleInfo(info);
                
                // Check if user has NO admin access at all
                if (!info.isSuperAdmin && !info.isSystemAdmin && !info.isAuthorityManager && !isPublicPath) {
                    // User is authenticated but not an admin - show access denied
                    console.warn('Access denied: User is not an authorized admin');
                    router.push('/admin/login');
                    setLoading(false);
                    return;
                }
                
                const isOnly = await isOnlyAuthorityManager(user.uid);
                setOnlyAuthorityManager(isOnly);
                const isSystemOnly = await checkIsSystemAdmin(user.uid);
                setIsSystemAdminOnly(isSystemOnly);
                
                if (isOnly || info.isAuthorityManager) {
                    try {
                        const authorities = await getAuthoritiesByManager(user.uid);
                        if (authorities.length > 0) {
                            const name = authorities[0].name;
                            const sanitizedName = typeof name === 'object' && name !== null ? (name.he || name.en || '') : (name || '');
                            setAuthorityName(sanitizedName);
                        }
                    } catch (error) {
                        console.error('Error loading authority name:', error);
                    }
                }
            } catch (error) {
                console.error('Error checking user role:', error);
                setRoleInfo({
                    role: 'none',
                    isSuperAdmin: false,
                    isSystemAdmin: false,
                    isAuthorityManager: false,
                    authorityIds: [],
                    isApproved: false,
                });
                setOnlyAuthorityManager(false);
                setIsSystemAdminOnly(false);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [pathname, router]);

    const isSuperAdmin = roleInfo?.isSuperAdmin ?? false;
    const isSystemAdmin = roleInfo?.isSystemAdmin ?? false;
    const isAuthorityManager = roleInfo?.isAuthorityManager ?? false;
    
    const showFullSidebar = !onlyAuthorityManager;
    const showSimplifiedSidebar = onlyAuthorityManager;
    const showAuthorityManagerLink = isAuthorityManager;
    
    // Route protection
    useEffect(() => {
        if (!loading && roleInfo) {
            if (onlyAuthorityManager) {
                const unauthorizedPaths = [
                    '/admin/exercises',
                    '/admin/gym-equipment',
                    '/admin/gear-definitions',
                    '/admin/progression-manager',
                    '/admin/programs',
                    '/admin/questionnaire',
                    '/admin/authorities',
                    '/admin/admins-management',
                    '/admin/system-settings',
                    '/admin/login',
                    '/admin/approval-center',
                ];
                
                if (unauthorizedPaths.some(path => pathname?.startsWith(path))) {
                    if (pathname?.startsWith('/admin/login') || pathname?.startsWith('/admin/system-settings')) {
                        if (typeof window !== 'undefined') {
                            window.location.href = '/authority-portal/login';
                        }
                        return;
                    }
                    router.replace('/admin/authority-manager');
                    return;
                }
                
                if (pathname === '/admin' || pathname === '/admin/') {
                    router.replace('/admin/authority-manager');
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
        return <>{children}</>;
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

    // Helper component for collapsible section headers
    const SectionHeader = ({ sectionId, icon: Icon, label }: { sectionId: SectionId; icon: React.ElementType; label: string }) => {
        const isExpanded = expandedSections.has(sectionId);
        const hasActiveChild = sectionContainsPath(sectionId, pathname);
        
        return (
            <button
                onClick={() => toggleSection(sectionId)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl font-bold text-sm transition-all ${
                    hasActiveChild ? 'text-cyan-400' : 'text-slate-400 hover:text-slate-200'
                }`}
            >
                <Icon size={18} />
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
            {/* Sidebar */}
            <aside className="w-64 bg-slate-900 text-white flex-shrink-0 hidden md:flex flex-col relative min-h-[100dvh]">
                <div className="p-4 md:p-6 border-b border-slate-800 flex-shrink-0">
                    <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
                        OUT RUN <span className="text-cyan-400">Admin</span>
                    </h1>
                </div>

                <nav className="p-2 md:p-3 flex flex-col flex-1 min-h-0 overflow-y-auto scrollbar-thin">
                    {showSimplifiedSidebar ? (
                        /* Simplified sidebar for Authority Managers */
                        <div className="space-y-1">
                            <SidebarLink href="/admin/authority-manager" icon={LayoutDashboard} label="דשבורד" />
                            <SidebarLink href="/admin/parks" icon={MapPin} label="פארקים" />
                            <SidebarLink href="/admin/users/all" icon={Users} label="משתמשים" />
                        </div>
                    ) : showFullSidebar ? (
                        /* Full sidebar for Super Admins */
                        <div className="space-y-1">
                            {/* Section 1: אסטרטגיה ומבט על (Overview) */}
                            <SectionHeader sectionId="overview" icon={TrendingUp} label="אסטרטגיה ומבט על" />
                            {expandedSections.has('overview') && (
                                <div className="pr-2 space-y-0.5 pb-2">
                                    <SidebarLink href="/admin" icon={LayoutDashboard} label="דשבורד" />
                                    <SidebarLink href="/admin/roadmap" icon={ListTodo} label="מפת דרכים ופידבקים" />
                                </div>
                            )}

                            {/* Section 2: מערך רשויות (Municipalities Hub) */}
                            {!isSystemAdminOnly && (
                                <>
                                    <SectionHeader sectionId="municipalities" icon={Building2} label="מערך רשויות" />
                                    {expandedSections.has('municipalities') && (
                                        <div className="pr-2 space-y-0.5 pb-2">
                                            <SidebarLink href="/admin/authorities" icon={Building2} label="ניהול רשויות - CRM" />
                                            {(isSuperAdmin || isSystemAdmin) && (
                                                <SidebarLink href="/admin/approval-center" icon={Shield} label="מרכז אישורים" />
                                            )}
                                            {showAuthorityManagerLink && (
                                                <SidebarLink href="/admin/authority-manager" icon={LayoutDashboard} label="לוח בקרה למנהל רשות" />
                                            )}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Section 3: ליבת האפליקציה (App Core) */}
                            {!onlyAuthorityManager && (
                                <>
                                    <SectionHeader sectionId="appCore" icon={Zap} label="ליבת האפליקציה" />
                                    {expandedSections.has('appCore') && (
                                        <div className="pr-2 space-y-0.5 pb-2">
                                            <SidebarLink href="/admin/parks" icon={MapPin} label="פארקים" />
                                            <SidebarLink href="/admin/routes" icon={Waypoints} label="מסלולים" />
                                            <SidebarLink href="/admin/exercises" icon={Dumbbell} label="בנק תרגילים" />
                                            <SidebarLink href="/admin/programs" icon={ClipboardList} label="תוכניות אימון" />
                                            <SidebarLink href="/admin/questionnaire" icon={ClipboardList} label="ניהול שאלון דינמי" />
                                            <SidebarLink href="/admin/progression-manager" icon={TrendingUp} label="מנהל התקדמות" />
                                            
                                            {/* Equipment Sub-items */}
                                            <div className="pt-1 pr-2">
                                                <p className="text-xs font-medium text-slate-500 px-4 py-1">ניהול ציוד וכושר</p>
                                                <SidebarLink href="/admin/gym-equipment" icon={Dumbbell} label="מתקני כושר" />
                                                <SidebarLink href="/admin/brands" icon={Package} label="מותגי ציוד" />
                                                <SidebarLink href="/admin/gear-definitions" icon={Package} label="ציוד אישי" />
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Section 4: סטודיו והפקה (Production Hub) */}
                            {!onlyAuthorityManager && (
                                <>
                                    <SectionHeader sectionId="production" icon={Camera} label="סטודיו והפקה" />
                                    {expandedSections.has('production') && (
                                        <div className="pr-2 space-y-0.5 pb-2">
                                            <SidebarLink href="/admin/content-matrix" icon={Video} label="ניהול ימי צילום" />
                                            <SidebarLink href="/admin/content-status" icon={LayoutGrid} label="מאגר מדיה" />
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Section 5: שפה, מיתוג ותקשורת (Brand & Comm) */}
                            {!onlyAuthorityManager && (
                                <>
                                    <SectionHeader sectionId="brandComm" icon={Megaphone} label="שפה, מיתוג ותקשורת" />
                                    {expandedSections.has('brandComm') && (
                                        <div className="pr-2 space-y-0.5 pb-2">
                                            <SidebarLink href="/admin/messages" icon={MessageCircle} label="תקשורת חכמה" />
                                            <SidebarLink href="/admin/workout-settings" icon={FileText} label="שפה ותיאורי אימונים" />
                                            <SidebarLink href="/admin/simulator" icon={Bell} label="סימולטור התראות" />
                                        </div>
                                    )}
                                </>
                            )}

                            {/* Section 6: ניהול מערכת (System) */}
                            <SectionHeader sectionId="system" icon={Settings} label="ניהול מערכת" />
                            {expandedSections.has('system') && (
                                <div className="pr-2 space-y-0.5 pb-2">
                                    {!isSystemAdminOnly && (
                                        <SidebarLink href="/admin/admins-management" icon={Shield} label="מנהלי מערכת" />
                                    )}
                                    {!isSystemAdminOnly && (
                                        <SidebarLink href="/admin/users/all" icon={Users} label="כל המשתמשים" />
                                    )}
                                    <SidebarLink href="/admin/users" icon={Shield} label="אישורים ממתינים" />
                                    <SidebarLink href="/admin/audit-logs" icon={FileText} label="יומן ביקורת" />
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Fallback simplified sidebar */
                        <div className="space-y-1">
                            <SidebarLink href="/admin/authority-manager" icon={LayoutDashboard} label="לוח בקרה למנהל רשות" />
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
        </div>
    );
}
