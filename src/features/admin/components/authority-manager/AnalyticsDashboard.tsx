'use client';

import { useState, useEffect } from 'react';
import {
  getDailyActiveUsers,
  getMonthlyActiveUsers,
  getGenderDistribution,
  getAgeDistribution,
  getPopularParks,
  getActivityTrend,
  GenderDistribution,
  AgeDistribution,
  ActivityTrend,
} from '@/features/admin/services/analytics.service';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
import { TrendingUp, Users, Calendar, MapPin, Map, Target, DollarSign, Bell, Send, AlertCircle } from 'lucide-react';
import { getParksByAuthority } from '@/features/admin/services/parks.service';
import { Park } from '@/types/admin-types';
import {
  getWHO150Tracker,
  getHealthSavings,
  getSavingsOverTime,
  WHO150TrackerResult,
  HealthSavingsResult,
  SavingsOverTimeData,
} from '@/features/admin/services/health-economics.service';
import {
  getManagerNotifications,
  sendEncouragementPush,
  checkHealthMilestones,
  ManagerNotification,
} from '@/features/admin/services/engagement.service';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';

interface AnalyticsDashboardProps {
  authorityId: string;
}

const COLORS = ['#00AEEF', '#06B6D4', '#0891B2', '#0E7490', '#155E75'];

export default function AnalyticsDashboard({ authorityId }: AnalyticsDashboardProps) {
  const [dau, setDau] = useState<number>(0);
  const [mau, setMau] = useState<number>(0);
  const [genderData, setGenderData] = useState<GenderDistribution | null>(null);
  const [ageData, setAgeData] = useState<AgeDistribution | null>(null);
  const [activityTrend, setActivityTrend] = useState<ActivityTrend[]>([]);
  const [popularParks, setPopularParks] = useState<any[]>([]);
  const [parks, setParks] = useState<Park[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Health Economics State
  const [whoTracker, setWhoTracker] = useState<WHO150TrackerResult | null>(null);
  const [healthSavings, setHealthSavings] = useState<HealthSavingsResult | null>(null);
  const [savingsOverTime, setSavingsOverTime] = useState<SavingsOverTimeData[]>([]);
  
  // Engagement State
  const [notifications, setNotifications] = useState<ManagerNotification[]>([]);
  const [showEncouragementModal, setShowEncouragementModal] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState<ManagerNotification | null>(null);
  const [encouragementTitle, setEncouragementTitle] = useState('');
  const [encouragementMessage, setEncouragementMessage] = useState('');
  const [sendingPush, setSendingPush] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUserId(user?.uid || null);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    loadAnalytics();
    loadNotifications();
  }, [authorityId]);

  useEffect(() => {
    if (parks.length > 0) {
      loadHealthEconomics();
    }
  }, [authorityId, parks.length]);

  const loadAnalytics = async () => {
    try {
      setLoading(true);
      const today = new Date();
      const currentMonth = today.getMonth();
      const currentYear = today.getFullYear();

      const [dailyActive, monthlyActive, gender, age, popularParksData, trend, parksData] = await Promise.all([
        getDailyActiveUsers(authorityId, today),
        getMonthlyActiveUsers(authorityId, currentYear, currentMonth),
        getGenderDistribution(authorityId),
        getAgeDistribution(authorityId),
        getPopularParks(authorityId, 5),
        getActivityTrend(authorityId, 30),
        getParksByAuthority(authorityId),
      ]);

      setDau(dailyActive);
      setMau(monthlyActive);
      setGenderData(gender);
      setAgeData(age);
      setPopularParks(popularParksData);
      setActivityTrend(trend);
      setParks(parksData);
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHealthEconomics = async () => {
    try {
      const [whoData, savingsData, savingsHistory] = await Promise.all([
        getWHO150Tracker(authorityId),
        getHealthSavings(authorityId),
        getSavingsOverTime(authorityId, 12),
      ]);
      setWhoTracker(whoData);
      setHealthSavings(savingsData);
      setSavingsOverTime(savingsHistory);

      // Check for health milestones for each park
      for (const park of parks) {
        try {
          const { getParkHealthSavings } = await import('@/features/admin/services/health-economics.service');
          const parkSavings = await getParkHealthSavings(authorityId, park.id, park.name);
          if (parkSavings.estimatedMonthlySavings > 0) {
            await checkHealthMilestones(
              authorityId,
              park.id,
              park.name,
              parkSavings.estimatedMonthlySavings
            );
          }
        } catch (error) {
          // Ignore individual park errors
        }
      }
      // Reload notifications after checking milestones
      await loadNotifications();
    } catch (error) {
      console.error('Error loading health economics:', error);
    }
  };

  const loadNotifications = async () => {
    try {
      const notifs = await getManagerNotifications(authorityId, 10);
      setNotifications(notifs);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  const handleSendEncouragement = async () => {
    if (!selectedNotification || !currentUserId || !encouragementTitle || !encouragementMessage) {
      return;
    }

    setSendingPush(true);
    try {
      const { getUserFromFirestore } = await import('@/lib/firestore.service');
      const userProfile = await getUserFromFirestore(currentUserId);
      const adminName = userProfile?.core?.name || 'מנהל רשות';

      await sendEncouragementPush(authorityId, {
        title: encouragementTitle,
        message: encouragementMessage,
        parkId: selectedNotification.parkId,
        targetAudience: 'all',
        sentBy: {
          adminId: currentUserId,
          adminName,
        },
      });

      // Refresh notifications
      await loadNotifications();
      setShowEncouragementModal(false);
      setSelectedNotification(null);
      setEncouragementTitle('');
      setEncouragementMessage('');
    } catch (error) {
      console.error('Error sending encouragement:', error);
      alert('שגיאה בשליחת הודעת עידוד');
    } finally {
      setSendingPush(false);
    }
  };

  if (loading) {
    return <div className="text-center py-12 text-gray-500">טוען נתונים...</div>;
  }

  // Prepare chart data
  const genderChartData = genderData
    ? [
        { name: 'גברים', value: genderData.male },
        { name: 'נשים', value: genderData.female },
        { name: 'אחר', value: genderData.other },
      ]
    : [];

  const ageChartData = ageData
    ? [
        { name: '18-25', value: ageData['18-25'] },
        { name: '26-35', value: ageData['26-35'] },
        { name: '36-45', value: ageData['36-45'] },
        { name: '46-55', value: ageData['46-55'] },
        { name: '56+', value: ageData['56+'] },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Manager Notifications */}
      {notifications.length > 0 && (
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl p-6 border-2 border-yellow-300">
          <div className="flex items-center gap-3 mb-4">
            <Bell size={24} className="text-yellow-600" />
            <h3 className="text-xl font-bold text-gray-900">התראות והישגים</h3>
          </div>
          <div className="space-y-3">
            {notifications.slice(0, 3).map((notif) => (
              <div
                key={notif.id}
                className="bg-white rounded-lg p-4 border border-yellow-200 flex items-start justify-between gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle size={18} className="text-yellow-600" />
                    <h4 className="font-bold text-gray-900">{notif.title}</h4>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{notif.message}</p>
                  {notif.savingsAmount && (
                    <p className="text-lg font-black text-green-600">
                      ₪{notif.savingsAmount.toLocaleString()}
                    </p>
                  )}
                </div>
                {!notif.actionTaken && (
                  <button
                    onClick={() => {
                      setSelectedNotification(notif);
                      setShowEncouragementModal(true);
                      setEncouragementTitle(`כל הכבוד על ההישג! 🎉`);
                      setEncouragementMessage(
                        notif.parkName
                          ? `תושבי ${notif.parkName} - אתם עושים עבודה מצוינת! המשיכו כך! 💪`
                          : `תושבי הרשות - אתם עושים עבודה מצוינת! המשיכו כך! 💪`
                      );
                    }}
                    className="flex items-center gap-2 px-4 py-2 bg-cyan-600 text-white rounded-lg font-bold hover:bg-cyan-700 transition-colors whitespace-nowrap"
                  >
                    <Send size={16} />
                    שלח עידוד
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-xl p-6 border border-cyan-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-gray-600">משתמשים פעילים יומיים</span>
            <TrendingUp size={20} className="text-cyan-600" />
          </div>
          <div className="text-3xl font-black text-gray-900">{dau}</div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-gray-600">משתמשים פעילים חודשיים</span>
            <Users size={20} className="text-purple-600" />
          </div>
          <div className="text-3xl font-black text-gray-900">{mau}</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-6 border border-emerald-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-bold text-gray-600">סה"כ משתמשים</span>
            <Calendar size={20} className="text-emerald-600" />
          </div>
          <div className="text-3xl font-black text-gray-900">
            {genderData?.total || ageData?.total || 0}
          </div>
        </div>

        {/* WHO 150-Min Tracker */}
        {whoTracker && (
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-600">יעד WHO 150 דק'</span>
              <Target size={20} className="text-blue-600" />
            </div>
            <div className="text-3xl font-black text-gray-900">
              {whoTracker.percentageReachingGoal.toFixed(1)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {whoTracker.usersReachingGoal} מתוך {whoTracker.totalUsers} משתמשים
            </div>
          </div>
        )}

        {/* Health Savings KPI */}
        {healthSavings && (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border-2 border-green-300">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-bold text-gray-600">חיסכון מוערך בעלויות בריאות</span>
              <DollarSign size={20} className="text-green-600" />
            </div>
            <div className="text-2xl font-black text-green-700">
              ₪{healthSavings.estimatedMonthlySavings.toLocaleString()}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              לחודש | ₪{healthSavings.estimatedYearlySavings.toLocaleString()} לשנה
            </div>
          </div>
        )}
      </div>

      {/* Savings Over Time Chart */}
      {savingsOverTime.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign size={20} className="text-green-600" />
            <h3 className="text-lg font-bold text-gray-900">חיסכון בעלויות בריאות לאורך זמן</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={savingsOverTime}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="monthLabel" />
              <YAxis />
              <Tooltip
                formatter={(value: number) => [`₪${value.toLocaleString()}`, 'חיסכון']}
                labelFormatter={(label) => `חודש: ${label}`}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="savings"
                stroke="#10B981"
                strokeWidth={3}
                name="חיסכון (₪)"
                dot={{ fill: '#10B981', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Activity Trend Chart */}
      {activityTrend.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <h3 className="text-lg font-bold text-gray-900 mb-4">מגמת פעילות (30 יום אחרונים)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={activityTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="dau" stroke="#00AEEF" strokeWidth={2} name="משתמשים פעילים יומיים" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Gender and Age Distribution */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Gender Distribution */}
        {genderChartData.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">התפלגות מגדרית</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={genderChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {genderChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Age Distribution */}
        {ageChartData.length > 0 && (
          <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4">התפלגות גילאים</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={ageChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#00AEEF" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Popular Parks */}
      {popularParks.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <MapPin size={20} className="text-gray-600" />
            <h3 className="text-lg font-bold text-gray-900">פארקים פופולריים</h3>
          </div>
          <div className="space-y-3">
            {popularParks.map((park, index) => (
              <div
                key={park.parkId}
                className="flex items-center justify-between bg-white rounded-lg p-4 border border-gray-200"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-cyan-500 text-white flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <div className="font-bold text-gray-900">{park.parkName}</div>
                    <div className="text-sm text-gray-500">{park.checkInCount} ביקורים</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Parks Heatmap Placeholder */}
      {parks.length > 0 && (
        <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
          <div className="flex items-center gap-2 mb-4">
            <Map size={20} className="text-gray-600" />
            <h3 className="text-lg font-bold text-gray-900">מפת פארקים</h3>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {parks.map((park) => (
              <div
                key={park.id}
                className="bg-white rounded-lg p-4 border-2 border-gray-200 hover:border-cyan-400 transition-colors cursor-pointer"
                title={`${park.name} - ${park.city}`}
              >
                <div className="text-center">
                  <MapPin size={24} className="text-cyan-500 mx-auto mb-2" />
                  <div className="text-xs font-bold text-gray-900 truncate">{park.name}</div>
                  <div className="text-[10px] text-gray-500 mt-1">{park.city}</div>
                  {park.status && (
                    <div className={`mt-2 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      park.status === 'open' ? 'bg-green-100 text-green-700' :
                      park.status === 'under_repair' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {park.status === 'open' ? 'פתוח' :
                       park.status === 'under_repair' ? 'בתיקון' : 'סגור'}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-4 text-center">
            לחץ על פארק לפרטים נוספים
          </p>
        </div>
      )}

      {/* Privacy Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm text-blue-800">
          <strong>🔒 פרטיות:</strong> כל הנתונים המוצגים כאן הם מצטברים ואנונימיים בלבד.
          אין גישה למידע אישי מזהה (PII) של משתמשים.
        </p>
      </div>

      {/* Encouragement Modal */}
      {showEncouragementModal && selectedNotification && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-xl font-bold text-gray-900 mb-4">שלח הודעת עידוד</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">כותרת</label>
                <input
                  type="text"
                  value={encouragementTitle}
                  onChange={(e) => setEncouragementTitle(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                  placeholder="כותרת ההודעה"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">תוכן ההודעה</label>
                <textarea
                  value={encouragementMessage}
                  onChange={(e) => setEncouragementMessage(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-transparent outline-none"
                  placeholder="תוכן ההודעה"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleSendEncouragement}
                  disabled={sendingPush || !encouragementTitle || !encouragementMessage}
                  className="flex-1 px-6 py-3 bg-cyan-600 text-white rounded-lg font-bold hover:bg-cyan-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Send size={18} />
                  {sendingPush ? 'שולח...' : 'שלח'}
                </button>
                <button
                  onClick={() => {
                    setShowEncouragementModal(false);
                    setSelectedNotification(null);
                    setEncouragementTitle('');
                    setEncouragementMessage('');
                  }}
                  className="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-bold hover:bg-gray-300 transition-colors"
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
