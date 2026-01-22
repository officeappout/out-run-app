'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, MapPin, Dumbbell, Waypoints, Signal, ClipboardList, Package, LogOut, Shield, Users, BarChart3, Lightbulb } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole, isOnlyAuthorityManager, isSystemAdmin as checkIsSystemAdmin, UserRoleInfo } from '@/features/admin/services/auth.service';
import { getAuthoritiesByManager } from '@/features/admin/services/authority.service';
import { signOutUser } from '@/lib/auth.service';

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

    const handleLogout = async () => {
        try {
            await signOutUser();
            // Redirect to appropriate portal based on role
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
            if (!user) {
                // User is not authenticated
                // If trying to access authority-manager, redirect to login
                if (pathname?.startsWith('/admin/authority-manager')) {
                    if (typeof window !== 'undefined') {
                        window.location.href = '/admin/authority-login';
                    }
                    return;
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

            // User is authenticated
            try {
                const info = await checkUserRole(user.uid);
                setRoleInfo(info);
                // Check if user should be restricted to only authority manager features
                const isOnly = await isOnlyAuthorityManager(user.uid);
                setOnlyAuthorityManager(isOnly);
                // Check if user is system admin only (not super admin)
                const isSystemOnly = await checkIsSystemAdmin(user.uid);
                setIsSystemAdminOnly(isSystemOnly);
                
                // Load authority name for Authority Managers
                if (isOnly || info.isAuthorityManager) {
                    try {
                        const authorities = await getAuthoritiesByManager(user.uid);
                        if (authorities.length > 0) {
                            setAuthorityName(authorities[0].name);
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
    }, [pathname]);

    const isSuperAdmin = roleInfo?.isSuperAdmin ?? false;
    const isSystemAdmin = roleInfo?.isSystemAdmin ?? false;
    const isAuthorityManager = roleInfo?.isAuthorityManager ?? false;
    
    // Show simplified sidebar if user is ONLY an authority manager (not super admin or system admin)
    const showFullSidebar = !onlyAuthorityManager; // Show full sidebar unless user is ONLY authority manager
    const showSimplifiedSidebar = onlyAuthorityManager; // Show simplified sidebar for authority managers only
    const showAuthorityManagerLink = isAuthorityManager; // Authority managers see their dashboard link
    
    // Route protection: Redirect users away from unauthorized pages
    useEffect(() => {
        if (!loading && roleInfo) {
            // Strict redirect for authority_manager: Block system settings and admin login
            if (onlyAuthorityManager) {
                const unauthorizedPaths = [
                    '/admin/exercises',
                    '/admin/gym-equipment',
                    '/admin/gear-definitions',
                    '/admin/levels',
                    '/admin/programs',
                    '/admin/questionnaire',
                    '/admin/authorities',
                    '/admin/admins-management',
                    '/admin/system-settings',
                    '/admin/login', // Block admin login for authority managers
                    '/admin/approval-center', // Block approval center for authority managers
                ];
                
                if (unauthorizedPaths.some(path => pathname?.startsWith(path))) {
                    // Redirect to authority portal login instead of authority-manager dashboard
                    if (pathname?.startsWith('/admin/login') || pathname?.startsWith('/admin/system-settings')) {
                        if (typeof window !== 'undefined') {
                            window.location.href = '/authority-portal/login';
                        }
                        return;
                    }
                    router.replace('/admin/authority-manager');
                    return;
                }
                
                // Block main admin dashboard access
                if (pathname === '/admin' || pathname === '/admin/') {
                    router.replace('/admin/authority-manager');
                    return;
                }
            }
            
            // Redirect system_admin away from unauthorized pages
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
            
            // Redirect super/system admins away from authority portal
            if ((isSuperAdmin || isSystemAdmin) && pathname?.startsWith('/authority-portal')) {
                router.replace('/admin/login');
                return;
            }
        }
    }, [pathname, loading, roleInfo, onlyAuthorityManager, isSystemAdminOnly, isSuperAdmin, isSystemAdmin, router]);

    // Exclude authority-login and pending-approval pages from admin layout
    if (pathname?.startsWith('/admin/authority-login') || pathname?.startsWith('/admin/pending-approval')) {
        return <>{children}</>;
    }

    // Show loading state but still render layout to prevent white screen
    if (loading) {
        return (
            <div className="flex min-h-[100dvh] bg-gray-100 overflow-hidden" dir="rtl" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
                <aside className="w-64 bg-slate-900 text-white flex-shrink-0 hidden md:block relative min-h-[100dvh] overflow-y-auto flex flex-col">
                    <div className="p-4 md:p-6 border-b border-slate-800">
                    {onlyAuthorityManager && authorityName ? (
                        <div>
                            <h1 className="text-lg md:text-xl font-black tracking-tight text-white mb-1">
                                OUT RUN <span className="text-cyan-400">Admin</span>
                            </h1>
                            <p className="text-xs md:text-sm text-slate-300 font-medium">
                                פורטל ניהול: {authorityName}
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
                <main className="flex-1 overflow-y-auto min-h-[100dvh]">
                    <div className="p-4 md:p-8 min-h-full">
                        <div className="flex items-center justify-center h-64">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
                                <p className="text-sm md:text-base text-gray-600">בודק הרשאות...</p>
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-[100dvh] bg-gray-100 overflow-hidden" dir="rtl" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {/* Sidebar - Fixed/Sticky */}
            <aside className="w-64 bg-slate-900 text-white flex-shrink-0 hidden md:block relative min-h-[100dvh] overflow-y-auto flex flex-col">
                <div className="p-4 md:p-6 border-b border-slate-800 flex-shrink-0">
                    <h1 className="text-xl md:text-2xl font-black tracking-tight text-white">
                        OUT RUN <span className="text-cyan-400">Admin</span>
                    </h1>
                </div>

                <nav className="p-2 md:p-4 space-y-2 flex flex-col flex-1 min-h-0">
                    {showSimplifiedSidebar ? (
                        <>
                            {/* Dedicated sidebar for Authority Managers - Only relevant items */}
                            <Link
                                href="/admin/authority-manager"
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                                    pathname === '/admin/authority-manager'
                                        ? 'bg-slate-800/50 text-cyan-400 font-bold'
                                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                }`}
                            >
                                <LayoutDashboard size={20} />
                                <span>דשבורד</span>
                            </Link>

                            <Link
                                href="/admin/parks"
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                                    pathname?.startsWith('/admin/parks')
                                        ? 'bg-slate-800/50 text-cyan-400 font-bold'
                                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                }`}
                            >
                                <MapPin size={20} />
                                <span>פארקים</span>
                            </Link>

                            <Link
                                href="/admin/users/all"
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                                    pathname?.startsWith('/admin/users/all')
                                        ? 'bg-slate-800/50 text-cyan-400 font-bold'
                                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                }`}
                            >
                                <Users size={20} />
                                <span>משתמשים</span>
                            </Link>

                            <Link
                                href="/admin/insights"
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                                    pathname?.startsWith('/admin/insights')
                                        ? 'bg-slate-800/50 text-cyan-400 font-bold'
                                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                }`}
                            >
                                <Lightbulb size={20} />
                                <span>תובנות</span>
                            </Link>

                            <Link
                                href="/admin/statistics"
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                                    pathname?.startsWith('/admin/statistics')
                                        ? 'bg-slate-800/50 text-cyan-400 font-bold'
                                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                }`}
                            >
                                <BarChart3 size={20} />
                                <span>סטטיסטיקה</span>
                            </Link>
                        </>
                    ) : showFullSidebar ? (
                        <>
                            <Link
                                href="/admin"
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                                    pathname === '/admin'
                                        ? 'bg-slate-800/50 text-cyan-400 font-bold'
                                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                }`}
                            >
                                <LayoutDashboard size={20} />
                                <span>דשבורד</span>
                            </Link>

                            <div className="pt-4 pb-2 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                ניהול תוכן
                            </div>

                            <Link
                                href="/admin/parks"
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 font-medium transition-all hover:bg-slate-800 hover:text-white"
                            >
                                <MapPin size={20} />
                                <span>פארקים</span>
                            </Link>

                            {/* Hide exercises, gear, levels, programs, questionnaire for authority_manager */}
                            {!onlyAuthorityManager && (
                                <>
                                    <Link
                                        href="/admin/exercises"
                                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 font-medium transition-all hover:bg-slate-800 hover:text-white"
                                    >
                                        <Dumbbell size={20} />
                                        <span>תרגילים</span>
                                    </Link>

                                    <Link
                                        href="/admin/gym-equipment"
                                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 font-medium transition-all hover:bg-slate-800 hover:text-white"
                                    >
                                        <Dumbbell size={20} />
                                        <span>מתקני כושר</span>
                                    </Link>

                                    <Link
                                        href="/admin/gear-definitions"
                                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 font-medium transition-all hover:bg-slate-800 hover:text-white"
                                    >
                                        <Package size={20} />
                                        <span>ניהול ציוד אישי</span>
                                    </Link>
                                </>
                            )}

                            <Link
                                href="/admin/routes"
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 font-medium transition-all hover:bg-slate-800 hover:text-white"
                            >
                                <Waypoints size={20} />
                                <span>מסלולים</span>
                            </Link>

                            {/* Hide levels, programs, questionnaire for authority_manager */}
                            {!onlyAuthorityManager && (
                                <>
                                    <Link
                                        href="/admin/levels"
                                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 font-medium transition-all hover:bg-slate-800 hover:text-white"
                                    >
                                        <Signal size={20} />
                                        <span>רמות</span>
                                    </Link>

                                    <Link
                                        href="/admin/programs"
                                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 font-medium transition-all hover:bg-slate-800 hover:text-white"
                                    >
                                        <ClipboardList size={20} />
                                        <span>תוכניות</span>
                                    </Link>

                                    <Link
                                        href="/admin/questionnaire"
                                        className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 font-medium transition-all hover:bg-slate-800 hover:text-white"
                                    >
                                        <LayoutDashboard size={20} />
                                        <span>שאלון Onboarding</span>
                                    </Link>
                                </>
                            )}

                            {/* Hide authorities for system_admin */}
                            {!isSystemAdminOnly && (
                                <Link
                                    href="/admin/authorities"
                                    className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 font-medium transition-all hover:bg-slate-800 hover:text-white"
                                >
                                    <Package size={20} />
                                    <span>רשויות</span>
                                </Link>
                            )}

                            <div className="pt-4 pb-2 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                ניהול מערכת
                            </div>

                            {/* Hide "All Users" for system_admin */}
                            {!isSystemAdminOnly && (
                                <Link
                                    href="/admin/users/all"
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                                        pathname?.startsWith('/admin/users/all')
                                            ? 'bg-slate-800/50 text-cyan-400 font-bold'
                                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Users size={20} />
                                    <span>כל המשתמשים</span>
                                </Link>
                            )}

                            <Link
                                href="/admin/users"
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                                    pathname === '/admin/users'
                                        ? 'bg-slate-800/50 text-cyan-400 font-bold'
                                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                }`}
                            >
                                <Shield size={20} />
                                <span>אישורים ממתינים</span>
                            </Link>

                            <Link
                                href="/admin/admins-management"
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 font-medium transition-all hover:bg-slate-800 hover:text-white"
                            >
                                <Shield size={20} />
                                <span>ניהול מנהלים</span>
                            </Link>

                            <Link
                                href="/admin/audit-logs"
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 font-medium transition-all hover:bg-slate-800 hover:text-white"
                            >
                                <Package size={20} />
                                <span>יומן ביקורת</span>
                            </Link>

                            {/* Approval Center - Only for Super Admin and System Admin */}
                            {(!onlyAuthorityManager && (isSuperAdmin || isSystemAdmin)) && (
                                <Link
                                    href="/admin/approval-center"
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all ${
                                        pathname?.startsWith('/admin/approval-center')
                                            ? 'bg-slate-800/50 text-cyan-400 font-bold'
                                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                                    }`}
                                >
                                    <Shield size={20} />
                                    <span>מרכז אישורים</span>
                                </Link>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Simplified sidebar for Authority Managers only */}
                            <Link
                                href="/admin/authority-manager"
                                className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-800/50 text-cyan-400 font-bold transition-all hover:bg-slate-800"
                            >
                                <LayoutDashboard size={20} />
                                <span>לוח בקרה למנהל רשות</span>
                            </Link>
                        </>
                    )}

                    {/* Show authority manager link for super admins too */}
                    {showFullSidebar && showAuthorityManagerLink && (
                        <>
                            <div className="pt-4 pb-2 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider">
                                מנהלי רשויות
                            </div>

                            <Link
                                href="/admin/authority-manager"
                                className="flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 font-medium transition-all hover:bg-slate-800 hover:text-white"
                            >
                                <Package size={20} />
                                <span>לוח בקרה למנהל רשות</span>
                            </Link>
                        </>
                    )}

                    {/* Logout Button - Always visible at bottom */}
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

            {/* Main Content - Scrollable */}
            <main className="flex-1 overflow-y-auto min-h-[100dvh]">
                <div className="p-4 md:p-8 pb-16 min-h-full">
                    {children}
                </div>
            </main>
        </div>
    );
}
