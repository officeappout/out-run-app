'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';
import { TrendingUp, Building2, Target, Award } from 'lucide-react';
import {
  getHealthWakeUpMetric,
  getEquipmentGapAnalysis,
  getSleepyNeighborhoods,
} from '@/features/admin/services/strategic-insights.service';

export default function StrategicInsightsPage() {
    const router = useRouter();
    const [authLoading, setAuthLoading] = useState(true);
    const [healthWakeUp, setHealthWakeUp] = useState<any>(null);
    const [equipmentGaps, setEquipmentGaps] = useState<any[]>([]);
    const [sleepyNeighborhoods, setSleepyNeighborhoods] = useState<any[]>([]);
    const [dataLoading, setDataLoading] = useState(true);
    const [userAuthorityIds, setUserAuthorityIds] = useState<string[]>([]);
    const [isAuthorityManagerOnly, setIsAuthorityManagerOnly] = useState(false);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                try {
                    const roleInfo = await checkUserRole(user.uid);
                    const isOnly = await isOnlyAuthorityManager(user.uid);
                    setIsAuthorityManagerOnly(isOnly);
                    setUserAuthorityIds(roleInfo.authorityIds || []);
                } catch (error) {
                    console.error('Error checking user role:', error);
                }
            }
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // Load insights data
    useEffect(() => {
        if (authLoading) return;

        async function loadInsights() {
            try {
                setDataLoading(true);
                const [healthData, gapsData, sleepyData] = await Promise.all([
                    getHealthWakeUpMetric(isAuthorityManagerOnly ? userAuthorityIds : undefined),
                    getEquipmentGapAnalysis(isAuthorityManagerOnly ? userAuthorityIds : undefined),
                    getSleepyNeighborhoods(isAuthorityManagerOnly ? userAuthorityIds : undefined),
                ]);

                setHealthWakeUp(healthData);
                setEquipmentGaps(gapsData);
                setSleepyNeighborhoods(sleepyData);
            } catch (error) {
                console.error('Error loading insights:', error);
            } finally {
                setDataLoading(false);
            }
        }

        loadInsights();
    }, [authLoading, isAuthorityManagerOnly, userAuthorityIds]);

    if (authLoading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="text-gray-500">טוען...</div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-black text-gray-900">תובנות אסטרטגיות</h1>
                <p className="text-gray-500 mt-2">סיכומים ברמה גבוהה המופקים מהסטטיסטיקה - שכונות מובילות, פערים בציוד, מגמות</p>
            </div>

            {/* Strategic Insights Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Sleepy Neighborhoods - Marketing Opportunity */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Building2 size={24} className="text-blue-600" />
                        <h3 className="text-xl font-black text-gray-900">הזדמנות שיווקית</h3>
                    </div>
                    <p className="text-gray-700 mb-4">
                        זיהוי שכונות עם פוטנציאל גבוה (אוכלוסייה גדולה) אבל מעורבות נמוכה - הזדמנות לקמפיין ממוקד.
                    </p>
                    {dataLoading ? (
                        <div className="text-sm text-gray-500 animate-pulse">טוען נתונים...</div>
                    ) : sleepyNeighborhoods.length > 0 ? (
                        <div className="space-y-2">
                            {sleepyNeighborhoods.slice(0, 3).map((neighborhood) => (
                                <div key={neighborhood.neighborhoodId} className="text-sm text-gray-900 font-medium bg-white/50 rounded-lg p-2">
                                    💡 <strong>{neighborhood.neighborhoodName}</strong> ({neighborhood.cityName}): רק {neighborhood.userCount} משתמשים
                                    {neighborhood.penetrationRate > 0 && ` (${neighborhood.penetrationRate.toFixed(1)} לכל 10,000 תושבים)`}
                                    {neighborhood.parksCount > 0 && ` • ${neighborhood.parksCount} גינות כושר ממופות`}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-gray-600 italic">
                            💡 תובנה: אין נתוני שכונות זמינים כרגע
                        </div>
                    )}
                </div>

                {/* Equipment Gaps */}
                <div className="bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Target size={24} className="text-orange-600" />
                        <h3 className="text-xl font-black text-gray-900">פער תשתית</h3>
                    </div>
                    <p className="text-gray-700 mb-4">
                        זיהוי פערים בין ציוד זמין למשתמשים לבין ציוד נדרש בתוכניות האימון שלהם. 
                        זה עוזר לתעדף רכישת ציוד חדש.
                    </p>
                    {dataLoading ? (
                        <div className="text-sm text-gray-500 animate-pulse">טוען נתונים...</div>
                    ) : equipmentGaps.length > 0 ? (
                        <div className="space-y-2">
                            {equipmentGaps.slice(0, 2).map((gap) => {
                                const topEquipment = gap.equipmentDemand[0];
                                return topEquipment ? (
                                    <div key={gap.neighborhoodId} className="text-sm text-gray-900 font-medium bg-white/50 rounded-lg p-2">
                                        💡 <strong>{gap.neighborhoodName}</strong> ({gap.cityName}): {topEquipment.userCount} משתמשים ביקשו "{topEquipment.equipmentName}"
                                    </div>
                                ) : null;
                            })}
                        </div>
                    ) : (
                        <div className="text-sm text-gray-600 italic">
                            💡 תובנה: אין נתוני פערי ציוד זמינים כרגע
                        </div>
                    )}
                </div>

                {/* User Activation Trends - Health Wake-Up */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <TrendingUp size={24} className="text-green-600" />
                        <h3 className="text-xl font-black text-gray-900">בריאות הציבור</h3>
                    </div>
                    <p className="text-gray-700 mb-4">
                        מעקב אחר מעבר של משתמשים מ"לא פעילים" ל"פעילים" - חישוב שיעורי ההפעלה 
                        והשפעת התוכנית על הבריאות הציבורית.
                    </p>
                    {dataLoading ? (
                        <div className="text-sm text-gray-500 animate-pulse">טוען נתונים...</div>
                    ) : healthWakeUp ? (
                        <div className="text-sm text-gray-900 font-bold bg-white/50 rounded-lg p-3">
                            💡 שיעור הצלחה: <span className="text-green-600 text-lg">{healthWakeUp.successRate}%</span> מהאזרחים הלא פעילים בעבר ({healthWakeUp.nowActiveUsers} מתוך {healthWakeUp.totalInactiveUsers}) מתאמנים כעת שבועית
                        </div>
                    ) : (
                        <div className="text-sm text-gray-600 italic">
                            💡 תובנה: אין נתונים זמינים כרגע
                        </div>
                    )}
                </div>

                {/* Program Effectiveness */}
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-6">
                    <div className="flex items-center gap-3 mb-4">
                        <Award size={24} className="text-purple-600" />
                        <h3 className="text-xl font-black text-gray-900">אפקטיביות תוכניות</h3>
                    </div>
                    <p className="text-gray-700 mb-4">
                        השוואה בין תוכניות אימון שונות - איזה תוכניות מובילות להשלמת שיעורים גבוהה יותר, 
                        התקדמות טובה יותר, ושימור משתמשים.
                    </p>
                    <div className="text-sm text-gray-600 italic">
                        💡 תובנה: אין נתונים זמינים כרגע
                    </div>
                </div>
            </div>

            {/* Call to Action */}
            <div className="bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl p-6 text-white">
                <h3 className="text-xl font-black mb-2">רוצה לחקור את הנתונים בפירוט?</h3>
                <p className="text-cyan-50 mb-4">
                    עבור לעמוד הסטטיסטיקה לצפייה בגרפים ונתונים גולמיים עם אפשרויות סינון מתקדמות.
                </p>
                <a
                    href="/admin/statistics"
                    className="inline-block px-6 py-3 bg-white text-cyan-600 rounded-lg font-bold hover:bg-gray-100 transition-colors"
                >
                    עבור לסטטיסטיקה →
                </a>
            </div>
        </div>
    );
}
