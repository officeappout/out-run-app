'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Dumbbell, Waypoints, Users, Signal, ClipboardList, Building2, LayoutDashboard, TrendingUp, BarChart3, Lightbulb, Shield, FileText } from 'lucide-react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';
import {
  getExecutiveSummary,
  getAuthorityPerformance,
  getTopBaseMovements,
  getLocationDistribution,
  getPremiumMetrics,
  getGlobalMaintenanceReports,
} from '@/features/admin/services/cpo-analytics.service';
import ExecutiveSummary from '@/features/admin/components/cpo-dashboard/ExecutiveSummary';
import AuthorityPerformanceTable from '@/features/admin/components/cpo-dashboard/AuthorityPerformanceTable';
import ProductInsights from '@/features/admin/components/cpo-dashboard/ProductInsights';
import MaintenanceOverview from '@/features/admin/components/cpo-dashboard/MaintenanceOverview';
import PremiumConversion from '@/features/admin/components/cpo-dashboard/PremiumConversion';

export default function AdminDashboardPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [authLoading, setAuthLoading] = useState(true);
    
    // CPO Dashboard Data (not used on main dashboard, but kept for potential future use)
    const [executiveSummary, setExecutiveSummary] = useState<any>(null);
    const [authorityPerformance, setAuthorityPerformance] = useState<any[]>([]);
    const [topMovements, setTopMovements] = useState<any[]>([]);
    const [locationDistribution, setLocationDistribution] = useState<any[]>([]);
    const [premiumMetrics, setPremiumMetrics] = useState<any>(null);
    const [maintenanceReports, setMaintenanceReports] = useState<any[]>([]);
    const [dataLoading, setDataLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    // Check if user is ONLY an authority manager (not super admin)
                    const isOnly = await isOnlyAuthorityManager(user.uid);
                    if (isOnly) {
                        // Redirect to authority manager dashboard
                        router.replace('/admin/authority-manager');
                        return;
                    }
                } catch (error) {
                    console.error('Error checking user role:', error);
                }
            }
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, [router]);

    // Load CPO Dashboard Data
    useEffect(() => {
        if (authLoading) return;

        async function loadData() {
            try {
                setDataLoading(true);
                const [
                    summary,
                    performance,
                    movements,
                    locations,
                    premium,
                    maintenance,
                ] = await Promise.all([
                    getExecutiveSummary(),
                    getAuthorityPerformance(),
                    getTopBaseMovements(5),
                    getLocationDistribution(),
                    getPremiumMetrics(),
                    getGlobalMaintenanceReports(),
                ]);

                setExecutiveSummary(summary);
                setAuthorityPerformance(performance);
                setTopMovements(movements);
                setLocationDistribution(locations);
                setPremiumMetrics(premium);
                setMaintenanceReports(maintenance);
            } catch (error) {
                console.error('Error loading CPO dashboard data:', error);
            } finally {
                setDataLoading(false);
                setLoading(false);
            }
        }

        loadData();
    }, [authLoading]);
    const cards = [
        {
            title: "פארקים",
            icon: MapPin,
            href: "/admin/parks",
        },
        {
            title: "תרגילים",
            icon: Dumbbell,
            href: "/admin/exercises",
        },
        {
            title: "מסלולים",
            icon: Waypoints,
            href: "/admin/routes",
        },
        {
            title: "רמות",
            icon: Signal,
            href: "/admin/levels",
        },
        {
            title: "תוכניות",
            icon: ClipboardList,
            href: "/admin/programs",
        },
        {
            title: "רשויות",
            icon: Building2,
            href: "/admin/authorities",
        },
        {
            title: "משתמשים",
            icon: Users,
            href: "/admin/users",
        },
        {
            title: "סטטיסטיקה",
            icon: BarChart3,
            href: "/admin/statistics",
        },
        {
            title: "תובנות",
            icon: Lightbulb,
            href: "/admin/insights",
        },
        {
            title: "ניהול מנהלים",
            icon: Shield,
            href: "/admin/admins-management",
        },
        {
            title: "יומן ביקורת",
            icon: FileText,
            href: "/admin/audit-logs",
        },
        {
            title: "צפה כפורטל רשות",
            icon: Building2,
            href: "/admin/authority-manager",
            highlight: true,
        },
    ];

    if (loading || authLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-500">טוען...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-gray-900">דשבורד מנהל מערכת</h1>
                <p className="text-gray-500 mt-2">מבט כולל על ביצועי הפלטפורמה והמוצר</p>
            </div>

            {/* Quick Navigation Links */}
            <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-2">
                    <Link
                        href="/admin/statistics"
                        className="flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm transition-all bg-gray-100 text-gray-600 hover:bg-gray-200"
                    >
                        <TrendingUp size={18} />
                        <span>סטטיסטיקה</span>
                    </Link>
                    <Link
                        href="/admin/insights"
                        className="flex items-center gap-2 px-6 py-3 rounded-lg font-bold text-sm transition-all bg-gray-100 text-gray-600 hover:bg-gray-200"
                    >
                        <TrendingUp size={18} />
                        <span>תובנות אסטרטגיות</span>
                    </Link>
                </div>
            </div>

            {/* Quick Access Cards */}
                <div className="space-y-6">
                    <div>
                        <h3 className="text-xl font-black text-gray-900 mb-4">גישה מהירה</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                            {cards.map((card) => (
                                <Link
                                    key={card.title}
                                    href={card.href}
                                className={`group relative overflow-hidden rounded-[32px] p-8 shadow-lg transition-all hover:scale-[1.02] hover:shadow-xl ${
                                    (card as any).highlight 
                                        ? 'bg-gradient-to-br from-purple-400 to-purple-600' 
                                        : 'bg-gradient-to-br from-cyan-400 to-cyan-600'
                                }`}
                                >
                                    <div className="absolute inset-0 bg-white/10 opacity-0 transition-opacity group-hover:opacity-100" />

                                    <div className="relative z-10 flex flex-col items-center justify-center text-center space-y-4">
                                        <div className="p-4 bg-white/20 rounded-full backdrop-blur-sm">
                                            <card.icon size={32} className="text-white" strokeWidth={2.5} />
                                        </div>
                                        <h3 className="text-xl font-black text-white">{card.title}</h3>
                                    </div>

                                    {/* Decorative decorative circle */}
                                    <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-white/10 rounded-full blur-2xl transition-transform group-hover:scale-150" />
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
        </div>
    );
}
