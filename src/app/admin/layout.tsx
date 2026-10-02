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
    MapPinned,
    Signal,
    Flag,
    GraduationCap,
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
    Link2,
    Lightbulb,
    LineChart,
    Wallet,
    SearchX,
    UsersRound,
    AlertCircle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole, isOnlyAuthorityManager, isSystemAdmin as checkIsSystemAdmin, UserRoleInfo } from '@/features/admin/services/auth.service';
import { hasAnyAdminAccess } from '@/features/admin/services/adminAccessGate';
import { getAuthoritiesByManager, getAllAuthorities, getAuthority } from '@/features/admin/services/authority.service';
import { signOutUser, mintAdminSessionCookie } from '@/lib/auth.service';
import { messageForSessionFailure } from '@/features/admin/services/sessionHealthMessage';
import { useSessionHealthStore } from '@/lib/sessionHealth.store';
import { clearLoopAttempt } from '@/features/admin/services/authority-login-loop-guard';
import AppLogoLoader from '@/components/AppLogoLoader';
import { authorityTypeToTenantType, getTenantLabels, orgTypeDisplayName, VERTICAL_THEMES } from '@/features/admin/config/tenantLabels';
import type { Authority } from '@/types/admin-types';
import { getSidebarConfig, type LucideIconName } from '@/features/admin/config/sidebarConfigs';
import { resolveLoginDoorForPath } from '@/features/admin/services/loginDoorForPath';
import { OrgSelectorProvider, useOrgSelector } from '@/features/admin/context/OrgSelectorContext';
import { AdminSessionSync } from '@/features/admin/components/AdminSessionSync';
import { isWeddingOwner } from '@/features/wedding/wedding.config';
import { SessionHealthBanner } from '@/features/admin/components/SessionHealthBanner';


// Icon map for data-driven sidebar rendering
const ICON_MAP: Record<LucideIconName, React.ElementType> = {
  LayoutDashboard, BarChart3, Activity, Map, Route,
  Users, Flag, CalendarHeart, ShieldCheck, GraduationCap,
  ClipboardCheck, Trophy, Building2, KeyRound, Shield,
};

// Section IDs for collapsible state — 5 global centres + 3 verticals
type SectionId = 'strategy' | 'crm' | 'marketing' | 'product' | 'finance' | 'dev' | 'municipal' | 'military' | 'educational';

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
        strategy: ['/admin', '/admin/roadmap', '/admin/master-roadmap'],
        crm: ['/admin/authorities', '/admin/organizations', '/admin/admin-directory'],
        marketing: ['/admin/marketing-hub', '/admin/messages', '/admin/workout-settings', '/admin/simulator', '/admin/workout-simulator', '/admin/links', '/admin/content-matrix', '/admin/unreachable-exercises', '/admin/content-status', '/admin/media-library', '/admin/notifications'],
        product: ['/admin/analytics', '/admin/statistics', '/admin/insights', '/admin/users/all', '/admin/community-groups-overview'],
        dev: [
            '/admin/locations', '/admin/parks', '/admin/routes', '/admin/exercises', '/admin/programs',
            '/admin/levels', '/admin/progression-manager', '/admin/level-equivalence', '/admin/gym-equipment',
            '/admin/brands', '/admin/gear-definitions', '/admin/questionnaire', '/admin/visual-assessment',
            '/admin/assessment-rules', '/admin/program-thresholds', '/admin/demo-seed', '/admin/schools',
            '/admin/running',
            '/admin/admins-management', '/admin/users', '/admin/audit-logs', '/admin/system-settings', '/admin/access-codes',
        ],
        finance: ['/admin/finance'],
        municipal: ['/admin/authorities', '/admin/approval-center', '/admin/authority-manager', '/admin/pressure-messages', '/admin/authority/reports', '/admin/heatmap'],
        military: ['/admin/authority/readiness'],
        educational: ['/admin/authority/grades', '/admin/photo-release'],
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
    // One-shot guard for the cookie/client identity-mismatch recovery below —
    // fires the sign-out-and-redirect at most once per mount, so a session
    // that can't be reconciled lands cleanly on login instead of looping.
    const mismatchHandledRef = useRef(false);
    // Login-entry-points unification (00-MASTER-PLAN.md, 28.09.2026) —
    // additions 2-4. `serverConfirmed` gates ALL sidebar rendering (a
    // POSITIVE condition — role resolved AND server agrees — rather than an
    // exclusion list of paths to special-case, which is exactly the shape
    // of the /admin/login sidebar-leak bug: nobody remembered to add it).
    // `reconnectNeeded` is set only when we have DEFINITIVE evidence the
    // server disagrees (no cookie at all) AND the one-shot re-mint below
    // also failed — never on a merely-inconclusive diagnostic check, which
    // would regress today's working case into an unnecessary reconnect
    // screen for a transient blip unrelated to the actual session.
    const [serverConfirmed, setServerConfirmed] = useState(false);
    const [reconnectNeeded, setReconnectNeeded] = useState(false);
    // §13.49 follow-up (28.09.2026, David's live-test finding) — a DISTINCT
    // failure from reconnectNeeded above: the session/cookie are fine, but
    // resolving the unit_admin's own tenant org (getAuthority(info.tenantId)
    // below) came back empty. Before this flag existed, that silently fell
    // through to getSidebarConfig(null)'s municipal default — a real
    // officer saw a full municipal menu including a "דשבורד אנליטיקה" link
    // to /admin/authority-manager, which the officer can't actually reach
    // (middleware bounces it), i.e. a working session led to a dead click.
    // The rule this closes: a resolution failure must be a DECLARED state
    // the sidebar renders explicitly, never a silent fallback to a
    // different vertical's real menu.
    const [unitOrgResolutionFailed, setUnitOrgResolutionFailed] = useState(false);
    // 01.10.2026 (00-MASTER-PLAN.md §13.61) — same declared-failure shape
    // as unitOrgResolutionFailed above, for tenant_owner. A real
    // tenant_owner is ALSO, mechanically, isAuthorityManager (the same
    // managerIds mechanism) — isTenantOwnerOnly below (which requires
    // !isAuthorityManager) is therefore never true for them, so this
    // can't key off that flag; it keys off roleInfo.isTenantOwner
    // directly. Before this, a failed getAuthoritiesByManager lookup for
    // a real tenant_owner silently left authorityType null, and
    // getSidebarConfig(null) silently fell to the municipal menu — no
    // banner, no error — the exact bug this mirrors the fix for.
    const [tenantOwnerOrgResolutionFailed, setTenantOwnerOrgResolutionFailed] = useState(false);
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
            const sections: SectionId[] = ['strategy', 'crm', 'marketing', 'product', 'finance', 'dev', 'municipal', 'military', 'educational'];
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
                        // Login-entry-points unification (00-MASTER-PLAN.md,
                        // 28.09.2026, hard rule #1) — route by pathname, not
                        // unconditionally to /admin/login. middleware.ts
                        // already does this server-side for the equivalent
                        // case; this client-side fallback (a Firebase
                        // client session clearing while already mounted, not
                        // the server-gated initial load) must not
                        // contradict it.
                        router.push(resolveLoginDoorForPath(pathnameRef.current));
                    }
                }
                setServerConfirmed(false);
                setReconnectNeeded(false);
                setUnitOrgResolutionFailed(false);
                setTenantOwnerOrgResolutionFailed(false);
                setRoleInfo({
                    role: 'none',
                    isSuperAdmin: false,
                    isSystemAdmin: false,
                    isVerticalAdmin: false,
                    isAuthorityManager: false,
                    isRootAdmin: false,
                    isTenantOwner: false,
                    isUnitAdmin: false,
                    authorityIds: [],
                    isApproved: false,
                    allowedSections: [],
                });
                setOnlyAuthorityManager(false);
                setIsSystemAdminOnly(false);
                setLoading(false);
                return;
            }

            // Detect a stale server session cookie pointing at a DIFFERENT
            // account than the current Firebase client session (e.g. a
            // magic link for account B opened in a browser that still held
            // account A's admin cookie). Left unresolved this can loop:
            // middleware allows the request (cookie says A), this layout
            // evaluates B's role and pushes to login, whose own
            // onAuthStateChanged still sees B, etc. Fix: sign out of BOTH
            // once and land cleanly on login — the mismatchHandledRef
            // guard means this can fire at most once per mount, never loop.
            //
            // Skipped entirely when `user` is anonymous — same blind spot
            // as auth/callback's pre-flight check (22.09.2026 regression,
            // see auth-callback-preflight.ts): an anonymous client session
            // is a disposable identity this app creates liberally and says
            // nothing about who's really signed in. Comparing it against a
            // perfectly valid cookie for a real account would sign that
            // account out over a spurious mismatch — e.g. a brief
            // anonymous-session race before Firebase finishes restoring
            // the real persisted session.
            if (!mismatchHandledRef.current && !user.isAnonymous) {
                try {
                    const sessionRes = await fetch('/api/auth/session', { credentials: 'same-origin' });
                    const sessionBody = sessionRes.ok ? await sessionRes.json() : null;
                    const cookieUid: string | null = sessionBody?.session?.uid ?? null;
                    if (cookieUid && cookieUid !== user.uid) {
                        mismatchHandledRef.current = true;
                        console.warn('[AdminLayout] Session cookie / client identity mismatch — signing out and redirecting to login.');
                        await signOutUser();
                        router.push('/admin/login');
                        setLoading(false);
                        return;
                    }
                    if (!cookieUid) {
                        // Client is authenticated, server has no session at
                        // all — the exact disagreement confirmed live
                        // 28.09.2026 (an officer's sidebar rendered while
                        // middleware bounced the page content to
                        // /admin/login). ONE re-mint attempt through the
                        // existing metered entrypoint — never a new fetch
                        // path, never a retry loop (mintAdminSessionCookie's
                        // own in-flight/recent-success dedup already covers
                        // concurrent callers; adding a second attempt here
                        // would reintroduce the exact 429 burst P1-3 fixed).
                        const remintOk = await mintAdminSessionCookie(user);
                        if (!remintOk) {
                            setReconnectNeeded(true);
                            setLoading(false);
                            return;
                        }
                    }
                    setServerConfirmed(true);
                } catch {
                    // The diagnostic check itself failed (e.g. offline) —
                    // NOT definitive evidence of a real cookie/client
                    // disagreement. Optimistically proceed (unchanged from
                    // before this fix) rather than showing a reconnect
                    // screen for a blip unrelated to the actual session;
                    // a genuinely invalid cookie still surfaces correctly
                    // via middleware on the next real navigation.
                    setServerConfirmed(true);
                }
            } else {
                // Anonymous user, or the mismatch guard already fired this
                // mount — neither case has anything left to confirm here.
                setServerConfirmed(true);
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
                
                // Check if user has NO admin access at all — §13.44 (P0-1):
                // see adminAccessGate.ts for why isUnitAdmin matters here.
                // The live end-to-end test only missed this because
                // /admin/auth/callback is a public path.
                if (!hasAnyAdminAccess(info) && !isPublicPath) {
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
                        const filtered = orgs.filter(o => authorityTypeToTenantType(o) === info.managedVertical);
                        setAllOrganizations(filtered);
                        orgCtx?.setAllOrgs(filtered);
                    } catch { /* non-critical */ }
                }

                if (isOnly || info.isAuthorityManager) {
                    // Reaching this point means the layout's own client-side
                    // check confirmed an authority manager AND middleware
                    // already let this request through (it runs before any
                    // of this JS does) — a successful arrival. Clear the
                    // loop guard so a later, genuinely fresh login attempt
                    // isn't blocked by a stale window from this one.
                    clearLoopAttempt();
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
                            if (info.isTenantOwner) setTenantOwnerOrgResolutionFailed(false);
                        } else if (info.isTenantOwner) {
                            // 01.10.2026 (00-MASTER-PLAN.md §13.61) — a real
                            // tenant_owner (not a plain authority_manager,
                            // which this same branch also serves and whose
                            // existing, live-verified behavior stays
                            // untouched) got zero authorities back. Declared
                            // failure, not a silent fall-through to
                            // getSidebarConfig(null)'s municipal default.
                            console.error('[AdminLayout] tenant_owner authority lookup returned empty for uid:', user.uid);
                            setTenantOwnerOrgResolutionFailed(true);
                        }
                    } catch (error) {
                        console.error('Error loading authority name:', error);
                        if (info.isTenantOwner) setTenantOwnerOrgResolutionFailed(true);
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

                // Unit Admin — §13.49's finding: this branch never existed,
                // so a clean unit_admin (isTenantOwner false, isUnitAdmin
                // true) never got authorityName/authorityType/
                // managedAuthorityId at all, which is why the sidebar had
                // nothing to render for them (isLocalManager was always
                // false, and the full-sidebar's hasSec() denies every
                // section with no allowedSections). Mirrors the tenant_owner
                // branch above exactly — same source (info.tenantId), same
                // load, same non-critical failure handling.
                if (info.isUnitAdmin && info.tenantId) {
                    try {
                        const tenantAuth = await getAuthority(info.tenantId);
                        if (tenantAuth) {
                            // Authority['name'] is typed as plain `string`, but
                            // real docs can carry a {he,en} object at runtime
                            // (same mismatch the isOnly/isAuthorityManager and
                            // tenant_owner branches above already have — not
                            // fixing those here, out of scope). Cast explicitly
                            // instead of reproducing their `never`-narrowing tsc
                            // error a third time.
                            const name = tenantAuth.name as unknown as string | { he?: string; en?: string };
                            const sanitizedName = typeof name === 'object' && name !== null ? (name.he || name.en || '') : (name || '');
                            setAuthorityName(sanitizedName);
                            setAuthorityType(tenantAuth.type ?? null);
                            setManagedAuthorityId(tenantAuth.id);
                            orgCtx?.setSelectedOrgId(tenantAuth.id);
                            setUnitOrgResolutionFailed(false);
                        } else {
                            // getAuthority resolved but found no matching
                            // authorities/{tenantId} doc — a declared failure,
                            // not a silent one (see the state's own comment).
                            console.error('[AdminLayout] unit_admin tenant org not found for tenantId:', info.tenantId);
                            setUnitOrgResolutionFailed(true);
                        }
                    } catch (error) {
                        console.error('[AdminLayout] unit_admin tenant org lookup failed:', error);
                        setUnitOrgResolutionFailed(true);
                    }
                } else if (info.isUnitAdmin && !info.tenantId) {
                    // info.isUnitAdmin true but tenantId itself is missing —
                    // previously skipped this whole block silently, same
                    // failure class as above, now declared the same way.
                    console.error('[AdminLayout] unit_admin has no core.tenantId at all');
                    setUnitOrgResolutionFailed(true);
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
                    isUnitAdmin: false,
                    authorityIds: [],
                    isApproved: false,
                    allowedSections: [],
                });
                setOnlyAuthorityManager(false);
                setIsSystemAdminOnly(false);
                setServerConfirmed(false);
                setReconnectNeeded(false);
                setUnitOrgResolutionFailed(false);
                setTenantOwnerOrgResolutionFailed(false);
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
    // §13.49 — unit_admin's own local-manager flag, mirroring isTenantOwnerOnly.
    // checkUserRole already derives isUnitAdmin as mutually exclusive with
    // isTenantOwner (!isTenantOwner && !!unitId), so no explicit exclusion
    // is needed here for consistency with that sibling flag's own style.
    const isUnitAdminOnly = (roleInfo?.isUnitAdmin ?? false) && !isSuperAdmin && !isSystemAdmin && !isAuthorityManager;
    const isLocalManager = onlyAuthorityManager || isTenantOwnerOnly || isUnitAdminOnly;

    const isNeighborhoodAdmin = onlyAuthorityManager && authorityType === 'neighborhood';
    // Login-entry-points unification (00-MASTER-PLAN.md, 28.09.2026),
    // addition 4 — POSITIVE condition, not an exclusion list: the sidebar
    // renders only when a role has resolved (roleInfo !== null) AND the
    // server agrees (serverConfirmed) — never derived from a growing list
    // of paths to special-case, which is exactly the shape of the bug that
    // let /admin/login keep rendering an officer's sidebar around a
    // content area the server had already bounced to a different account.
    const showFullSidebar = !isLocalManager && serverConfirmed && roleInfo !== null;
    const showSimplifiedSidebar = isLocalManager && serverConfirmed && roleInfo !== null;
    const showAuthorityManagerLink = isAuthorityManager || isTenantOwnerOnly;
    // superAdmin/systemAdmin only — /admin/city-mapping keeps its own explicit
    // guard regardless, but the sidebar link itself must not be offered to
    // authority-manager/vertical-admin/platform_member, who would only be
    // redirected away by that guard.
    const showCityMappingLink = isSuperAdmin || isSystemAdmin;
    const tenantLabels = getTenantLabels(authorityTypeToTenantType(authorityType));
    const verticalAdminVertical = roleInfo?.managedVertical;
    const sectionAllowList: string[] = roleInfo?.allowedSections ?? [];

    // hasSec: returns true when the current user may see this nav section.
    // Rules: super/system admin → always yes; vertical admin → use existing VA logic;
    // allowedSections empty → deny (platform_member with no sections sees nothing).
    // Legacy map: old Firestore section keys are aliased to the new 5-centre IDs
    // so existing platform_member records keep working after the nav restructure.
    const hasSec = (key: string): boolean => {
      if (isSuperAdmin || isSystemAdmin) return true;
      if (isVerticalAdminOnly) return true;
      if (sectionAllowList.length === 0) return false;
      if (sectionAllowList.includes(key)) return true;
      const legacyMap: Record<string, string[]> = {
        crm:      ['platform'],
        marketing: ['brandComm', 'production'],
        product:  ['system'],
        dev:      ['appCore', 'running', 'system'],
      };
      return (legacyMap[key] ?? []).some(a => sectionAllowList.includes(a));
    };

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
                    '/admin/photo-release',
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
                // UX LAYER ONLY — NOT a security boundary. The real gate is
                // src/middleware.ts's AUTHORITY_MANAGER_ALLOWED_PATHS /
                // TENANT_OWNER_ALLOWED_PATHS (server-side, enforced on every
                // request). This list is shared between authority_manager
                // AND tenant_owner (never split when the server-side lists
                // were, 30.09.2026 — 00-MASTER-PLAN.md §13.58) and is
                // DELIBERATELY broader than either role's real server-side
                // allowlist: it exists only to client-side-redirect (router.
                // replace) a stale bookmark or typed URL to somewhere
                // sensible, never to grant access middleware.ts would deny.
                // authority_manager gets this superset client-side, a
                // narrower list server-side — the client over-allows, the
                // server is the actual boundary, so there is no security
                // gap from the mismatch. DO NOT narrow this list to match
                // either role's server-side allowlist without first
                // splitting it into two separate lists: shrinking the
                // SHARED list to authority_manager's shape would client-side
                // bounce a real tenant_owner away from their own legitimate
                // pages (readiness/units/grades/access-codes) with no way to
                // regression-test the breakage (this repo's vitest config is
                // node-only, no jsdom — .tsx client logic has no test
                // coverage here). If a future change needs this list
                // narrower, split it first (see §13.58's note on the two
                // allowlists-synced-by-hand drift risk — the eventual fix is
                // one shared source both layers derive from, not yet built).
                const allowedPaths = [
                    '/admin/authority-manager',
                    '/admin/dashboard',
                    '/admin/authority/locations',
                    '/admin/authority/routes',
                    '/admin/authority/reports',
                    '/admin/authority/team',
                    '/admin/authority/community',
                    '/admin/authority/events',
                    // '/admin/authority/users' intentionally removed (22.09.2026):
                    // that route is now super_admin/system_admin-only — an
                    // authority manager hitting it directly (stale bookmark,
                    // typed URL) is redirected to /admin/dashboard below
                    // instead of landing on an "no access" page.
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

            // Platform member route protection — section-limited team members
            if (roleInfo.role === 'platform_member') {
                const sectionPathsMap: Record<string, string[]> = {
                    // ── New 5-centre IDs ──────────────────────────────────
                    strategy: ['/admin', '/admin/roadmap', '/admin/master-roadmap'],
                    crm:      ['/admin/authorities', '/admin/organizations', '/admin/admin-directory'],
                    marketing: ['/admin/marketing-hub', '/admin/messages', '/admin/workout-settings', '/admin/simulator', '/admin/workout-simulator', '/admin/links', '/admin/content-matrix', '/admin/unreachable-exercises', '/admin/content-status', '/admin/media-library', '/admin/notifications'],
                    product:  ['/admin/analytics', '/admin/statistics', '/admin/insights', '/admin/users/all'],
                    dev:      ['/admin/locations', '/admin/parks', '/admin/routes', '/admin/exercises', '/admin/programs', '/admin/levels', '/admin/progression-manager', '/admin/level-equivalence', '/admin/gym-equipment', '/admin/brands', '/admin/gear-definitions', '/admin/questionnaire', '/admin/visual-assessment', '/admin/assessment-rules', '/admin/program-thresholds', '/admin/demo-seed', '/admin/schools', '/admin/running', '/admin/admins-management', '/admin/users', '/admin/audit-logs', '/admin/system-settings', '/admin/access-codes'],
                    finance: ['/admin/finance'],
                    // ── Vertical sections (unchanged) ─────────────────────
                    municipal: ['/admin/authorities', '/admin/approval-center', '/admin/authority-manager', '/admin/pressure-messages', '/admin/authority/reports', '/admin/heatmap'],
                    military:  ['/admin/authority/readiness'],
                    educational: ['/admin/authority/grades', '/admin/photo-release'],
                    // ── Legacy Firestore keys (backward compat) ───────────
                    platform:  ['/admin/organizations', '/admin/admin-directory', '/admin/access-codes'],
                    appCore:   ['/admin/locations', '/admin/parks', '/admin/routes', '/admin/exercises', '/admin/programs', '/admin/levels', '/admin/progression-manager', '/admin/level-equivalence', '/admin/gym-equipment', '/admin/brands', '/admin/gear-definitions', '/admin/questionnaire', '/admin/visual-assessment', '/admin/assessment-rules', '/admin/program-thresholds', '/admin/demo-seed'],
                    running:   ['/admin/running'],
                    production: ['/admin/content-matrix', '/admin/unreachable-exercises', '/admin/content-status', '/admin/media-library'],
                    brandComm: ['/admin/messages', '/admin/workout-settings', '/admin/simulator', '/admin/workout-simulator', '/admin/links'],
                    system:    ['/admin/admins-management', '/admin/users', '/admin/audit-logs', '/admin/system-settings', '/admin/analytics', '/admin/users/all', '/admin/statistics', '/admin/insights'],
                };
                const publicAdminRoutes = ['/admin/auth/callback', '/admin/authority-login', '/admin/pending-approval', '/admin/login'];
                if (publicAdminRoutes.some(p => pathname?.startsWith(p))) return;

                const memberSections = roleInfo.allowedSections ?? [];
                const allowedPaths = memberSections.flatMap(s => sectionPathsMap[s] ?? []);
                if (allowedPaths.length === 0) {
                    if (pathname !== '/admin/pending-approval') router.replace('/admin/pending-approval');
                    return;
                }
                const isAllowed = allowedPaths.some(p =>
                    p === '/admin' ? pathname === '/admin' : pathname?.startsWith(p)
                );
                if (!isAllowed) {
                    const firstPath = allowedPaths.find(p => p !== '/admin') ?? allowedPaths[0] ?? '/admin/pending-approval';
                    router.replace(firstPath);
                }
            }
        }
    }, [pathname, loading, roleInfo, onlyAuthorityManager, isSystemAdminOnly, isSuperAdmin, isSystemAdmin, router]);

    if (pathname?.startsWith('/admin/authority-login') || pathname?.startsWith('/admin/pending-approval')) {
        return (
            <>
                <AdminSessionSync />
                <SessionHealthBanner />
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

    if (reconnectNeeded) {
        // Login-entry-points unification (00-MASTER-PLAN.md, 28.09.2026),
        // additions 2-4: a terminal, self-contained state — no sidebar (the
        // whole point), no AdminSessionSync/SessionHealthBanner here (they
        // would each independently try to mint again, reintroducing the
        // retry loop addition 2 explicitly forbids). The ONE way forward is
        // the explicit action below, never an automatic second attempt.
        const reason = useSessionHealthStore.getState().lastFailureReason;
        const isTransient = reason === 'network' || reason === 'rate_limited';
        const loginDoor = resolveLoginDoorForPath(pathname);
        const nextParam = pathname ? `?next=${encodeURIComponent(pathname)}` : '';
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-6" dir="rtl">
                <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
                    <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                        {isTransient ? 'לא הצלחנו לרענן את החיבור שלך' : 'החיבור שלך פג — יש להתחבר מחדש'}
                    </h2>
                    <p className="text-gray-600 mb-6">
                        {messageForSessionFailure(reason)}
                    </p>
                    <a
                        href={`${loginDoor}${nextParam}`}
                        className="inline-block w-full bg-cyan-600 text-white py-3 rounded-xl font-bold hover:bg-cyan-700 transition-colors"
                    >
                        {isTransient ? 'נסה שוב' : 'התחבר מחדש'}
                    </a>
                </div>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex min-h-[100dvh] bg-gray-100 overflow-hidden" dir="rtl" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
                <AdminSessionSync />
                <SessionHealthBanner />
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
                            <AppLogoLoader caption="בודק הרשאות..." className="flex flex-col items-center justify-center gap-4" />
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-[100dvh] bg-gray-100 overflow-hidden" dir="rtl" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <AdminSessionSync />
            <SessionHealthBanner />
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
                        ) : isUnitAdminOnly && managedAuthorityId && roleInfo?.unitId ? (() => {
                        /* ── Unit Admin — minimal sidebar (§13.49), same
                           pattern as Neighborhood Admin above: a level-2
                           role gets ONE scoped link, not the tenant's full
                           sidebar. Links straight at the officer's own unit
                           detail page — [unitId]/page.tsx already resolves
                           ?org= with priority over getAuthoritiesByManager
                           (which is always empty for a unit_admin), so this
                           carries exactly the params postAcceptRedirect.ts
                           already uses for the same page immediately after
                           accepting an invitation. Sub-units/members/
                           approvals are already built INTO that page — no
                           second link needed for them. */
                        const tenantTypeForLink = authorityTypeToTenantType(authorityType);
                        const badgeCfg = getSidebarConfig(authorityType);
                        return (
                        <div className="space-y-1">
                            {authorityName && (
                                <div className={`px-4 py-2.5 mb-3 rounded-xl border ${badgeCfg.badgeColorClass}`}>
                                    <p className={`text-[10px] font-bold uppercase tracking-widest ${badgeCfg.badgeTextClass}`}>פורטל יחידה</p>
                                    <p className="text-sm font-black text-white truncate">{authorityName}</p>
                                </div>
                            )}

                            <SidebarLink
                                href={`/admin/authority/units/${roleInfo.unitId}?type=${tenantTypeForLink}&org=${managedAuthorityId}`}
                                icon={Users}
                                label="היחידה שלי"
                                isActive={pathname?.startsWith('/admin/authority/units')}
                            />
                        </div>
                        );
                        })() : isUnitAdminOnly ? (
                        /* ── Unit Admin — org resolution failed (declared,
                           28.09.2026) — reaching here means isUnitAdminOnly
                           is true but managedAuthorityId/roleInfo.unitId
                           didn't resolve (see unitOrgResolutionFailed's own
                           comment above). Must NOT fall through to the
                           generic getSidebarConfig branch below: that would
                           silently hand this officer a DIFFERENT vertical's
                           real menu, including links (e.g. "אנליטיקה" →
                           /admin/authority-manager) they can't actually
                           reach — a working session ending in a dead click. */
                        <div className="space-y-3 px-1">
                            <div className="rounded-xl border border-amber-700/30 bg-amber-900/20 p-3">
                                <p className="text-xs font-bold text-amber-400">לא הצלחנו לזהות את היחידה שלך</p>
                                <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                                    ייתכן שזו תקלת חיבור זמנית. נסה שוב — אם זה חוזר, פנה למפקד או למנהל המערכת.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
                                className="w-full rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 transition-colors"
                            >
                                נסה שוב
                            </button>
                        </div>
                        ) : (roleInfo?.isTenantOwner && tenantOwnerOrgResolutionFailed) ? (
                        /* ── Tenant Owner — org resolution failed (declared,
                           01.10.2026, 00-MASTER-PLAN.md §13.61) — mirrors
                           the unit_admin branch above exactly. Keyed on
                           roleInfo.isTenantOwner directly, not
                           isTenantOwnerOnly: a real tenant_owner is ALSO,
                           mechanically, isAuthorityManager, so
                           isTenantOwnerOnly (which requires
                           !isAuthorityManager) is never true for them —
                           using it here would make this branch as dead as
                           the pre-existing tenant_owner resolution effect
                           it already is (see that branch's own comment,
                           above in this file). Must NOT fall through to
                           the generic getSidebarConfig branch below: that
                           silently hands a military/school tenant_owner
                           the municipal menu — the exact bug this closes. */
                        <div className="space-y-3 px-1">
                            <div className="rounded-xl border border-amber-700/30 bg-amber-900/20 p-3">
                                <p className="text-xs font-bold text-amber-400">לא הצלחנו לזהות את הארגון שלך</p>
                                <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
                                    ייתכן שזו תקלת חיבור זמנית. נסה שוב — אם זה חוזר, פנה למנהל המערכת.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => { if (typeof window !== 'undefined') window.location.reload(); }}
                                className="w-full rounded-xl bg-slate-800 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 transition-colors"
                            >
                                נסה שוב
                            </button>
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
                        <div className="space-y-1">

                            {/* ── 1. אסטרטגיה / קלי ─────────────────────────── */}
                            {hasSec('strategy') && <SectionHeader sectionId="strategy" icon={TrendingUp} label="אסטרטגיה / קלי" />}
                            {hasSec('strategy') && expandedSections.has('strategy') && (
                                <div className="pr-2 space-y-0.5 pb-2">
                                    <SidebarLink href="/admin" icon={LayoutDashboard} label="דשבורד ראשי" />
                                    <SidebarLink href="/admin/master-roadmap" icon={LayoutGrid} label="מפת דרכים מאוחדת" />
                                    <SidebarLink href="/admin/roadmap" icon={ListTodo} label="roadmap פיתוח" />
                                </div>
                            )}

                            {/* ── 2. CRM / מכירות ────────────────────────────── */}
                            {hasSec('crm') && !isSystemAdminOnly && (
                                <>
                                    <SectionHeader sectionId="crm" icon={Building2} label="CRM / מכירות" />
                                    {expandedSections.has('crm') && (
                                        <div className="pr-2 space-y-0.5 pb-2">
                                            <SidebarLink href="/admin/authorities" icon={Building2} label="ניהול רשויות" />
                                            <SidebarLink href="/admin/organizations" icon={Globe} label="ארגונים" />
                                            <SidebarLink href="/admin/admin-directory" icon={Users} label="ספריית מנהלים" />
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ── Vertical 1: ניהול עירוני ───────────────────── */}
                            {hasSec('municipal') && !isSystemAdminOnly && (!isVerticalAdminOnly || verticalAdminVertical === 'municipal') && (
                                <>
                                    <SectionHeader sectionId="municipal" icon={Building2} label="ניהול עירוני" colorClass={VERTICAL_THEMES.municipal.sidebarIcon} />
                                    {expandedSections.has('municipal') && (
                                        <div className="pr-2 space-y-0.5 pb-2 border-r-2 border-blue-700/40 mr-2">
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
                                            <SidebarLink href="/admin/approval-center" icon={ShieldCheck} label="מרכז אישורים" />
                                            {showCityMappingLink && (
                                                <SidebarLink href="/admin/city-mapping" icon={MapPinned} label="מיפוי עיר" />
                                            )}
                                            <SidebarLink href="/admin/pressure-messages" icon={Megaphone} label="מסרי לחץ" />
                                            <SidebarLink href="/admin/authority/reports" icon={Flag} label="דיווחי תחזוקה" />
                                            <SidebarLink href="/admin/heatmap" icon={Activity} label="מפת חום חיה" />
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ── Vertical 2: ניהול צבאי ─────────────────────── */}
                            {/* 24.09.2026 — was "צי צבאי" ("military fleet" —
                                "צי" means a fleet of ships/aircraft, not a
                                fit for army units). Renamed to match the
                                sibling labels' pattern ("ניהול עירוני"). */}
                            {hasSec('military') && !isSystemAdminOnly && (!isVerticalAdminOnly || verticalAdminVertical === 'military') && (
                                <>
                                    <SectionHeader sectionId="military" icon={ShieldCheck} label="ניהול צבאי" colorClass={VERTICAL_THEMES.military.sidebarIcon} />
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

                            {/* ── Vertical 3: רשת חינוכית ────────────────────── */}
                            {hasSec('educational') && !isSystemAdminOnly && (!isVerticalAdminOnly || verticalAdminVertical === 'educational') && (
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
                                            <SidebarLink href="/admin/photo-release" icon={Camera} label="אישורי צילום 📷" />
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ── 3. שיווק ותוכן ─────────────────────────────── */}
                            {hasSec('marketing') && !onlyAuthorityManager && !isVerticalAdminOnly && (
                                <>
                                    <SectionHeader sectionId="marketing" icon={Megaphone} label="שיווק ותוכן" />
                                    {expandedSections.has('marketing') && (
                                        <div className="pr-2 space-y-0.5 pb-2">
                                            <SidebarLink href="/admin/marketing-hub" icon={LayoutGrid} label="תור תוכן" />
                                            <SidebarLink href="/admin/links" icon={Link2} label="מרכז קישורים שיווקיים" />
                                            <SidebarLink href="/admin/content-matrix" icon={Video} label="ניהול ימי צילום" />
                                            <SidebarLink href="/admin/unreachable-exercises" icon={SearchX} label="תרגילים לא נשלפים" />
                                            <SidebarLink href="/admin/media-library" icon={LayoutGrid} label="מאגר מדיה" />
                                            <SidebarLink href="/admin/messages" icon={MessageCircle} label="תקשורת חכמה" />
                                            <SidebarLink href="/admin/workout-settings" icon={FileText} label="שפה ותיאורי אימונים" />
                                            <SidebarLink href="/admin/simulator" icon={Bell} label="סימולטור התראות" />
                                            <SidebarLink href="/admin/notifications" icon={Bell} label="מרכז התראות" />
                                            <SidebarLink href="/admin/workout-simulator" icon={FlaskConical} label="סימולטור אימונים" />
                                            {/* Shortcut — canonical location is ניהול מוצר */}
                                            {!isSystemAdminOnly && (
                                                <SidebarLink href="/admin/analytics" icon={BarChart3} label="↗ משפך המרות" />
                                            )}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ── 4. ניהול מוצר / צמיחה ──────────────────────── */}
                            {hasSec('product') && !isSystemAdminOnly && !isVerticalAdminOnly && (
                                <>
                                    <SectionHeader sectionId="product" icon={LineChart} label="ניהול מוצר / צמיחה" />
                                    {expandedSections.has('product') && (
                                        <div className="pr-2 space-y-0.5 pb-2">
                                            <SidebarLink href="/admin/analytics" icon={BarChart3} label="משפך המרות ואנליטיקס" />
                                            <SidebarLink href="/admin/statistics" icon={TrendingUp} label="סטטיסטיקות" />
                                            <SidebarLink href="/admin/insights" icon={Lightbulb} label="תובנות אסטרטגיות" />
                                            <SidebarLink href="/admin/users/all" icon={Users} label="כל המשתמשים" />
                                            <SidebarLink href="/admin/community-groups-overview" icon={UsersRound} label="כל הקבוצות במערכת" />
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ── כספים ──────────────────────────────────────── */}
                            {hasSec('finance') && !onlyAuthorityManager && !isVerticalAdminOnly && (
                                <>
                                    <SectionHeader sectionId="finance" icon={Wallet} label="כספים" />
                                    {expandedSections.has('finance') && (
                                        <div className="pr-2 space-y-0.5 pb-2">
                                            <SidebarLink href="/admin/finance/approvals" icon={Wallet} label="תור אישור חשבוניות" />
                                            <SidebarLink href="/admin/finance/expenses" icon={LayoutGrid} label="ספר הוצאות" />
                                            {isSuperAdmin && isWeddingOwner(auth.currentUser?.email) && (
                                                <SidebarLink href="/admin/wedding" icon={CalendarHeart} label="תכנון חתונה" />
                                            )}
                                        </div>
                                    )}
                                </>
                            )}

                            {/* ── 5. פיתוח ────────────────────────────────────── */}
                            {hasSec('dev') && !onlyAuthorityManager && !isVerticalAdminOnly && (
                                <>
                                    <SectionHeader sectionId="dev" icon={Zap} label="פיתוח" />
                                    {expandedSections.has('dev') && (
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
                                            <div className="pt-1 pr-2">
                                                <p className="text-xs font-medium text-slate-500 px-4 py-1">ניהול מתקנים וכושר</p>
                                                <SidebarLink href="/admin/gym-equipment" icon={Dumbbell} label="מתקני כושר" />
                                                <SidebarLink href="/admin/brands" icon={Package} label="מותגי מתקנים" />
                                                <SidebarLink href="/admin/gear-definitions" icon={Package} label="ציוד אישי" />
                                            </div>
                                            <div className="pt-1 pr-2">
                                                <p className="text-xs font-medium text-slate-500 px-4 py-1">מנוע ריצה</p>
                                                <SidebarLink href="/admin/running" icon={LayoutDashboard} label="דשבורד ריצה" />
                                                <SidebarLink href="/admin/running/pace-map" icon={Activity} label="מפת קצבים" />
                                                <SidebarLink href="/admin/running/workouts" icon={Dumbbell} label="תבניות אימונים" />
                                                <SidebarLink href="/admin/running/programs" icon={GitMerge} label="תוכניות והתקדמות" />
                                            </div>
                                            <div className="pt-1 pr-2">
                                                <p className="text-xs font-medium text-slate-500 px-4 py-1">כלי דמו</p>
                                                <SidebarLink href="/admin/demo-seed" icon={FlaskConical} label="כלי דמו — שדרות" />
                                            </div>
                                            <div className="pt-1 pr-2">
                                                <p className="text-xs font-medium text-slate-500 px-4 py-1">מערכת</p>
                                                {!isSystemAdminOnly && (
                                                    <SidebarLink href="/admin/admins-management" icon={Shield} label="מנהלי מערכת" />
                                                )}
                                                <SidebarLink href="/admin/users" icon={Shield} label="אישורים ממתינים" />
                                                <SidebarLink href="/admin/access-codes" icon={KeyRound} label="קודי גישה" />
                                                <SidebarLink href="/admin/audit-logs" icon={FileText} label="יומן ביקורת" />
                                                {isSuperAdmin && (
                                                    <SidebarLink href="/admin/system-settings" icon={Settings} label="הגדרות מערכת" />
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </>
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
