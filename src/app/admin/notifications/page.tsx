'use client';

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Bell,
  Calendar,
  Users,
  MessageCircle,
  Trophy,
  Heart,
  Send,
  X,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Clock,
  Zap,
  AlertCircle,
  RefreshCw,
  Megaphone,
} from 'lucide-react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  orderBy,
  limit,
  query,
  Timestamp,
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { sendEncouragementPush } from '@/features/admin/services/engagement.service';
import { getAllUsers } from '@/features/admin/services/users.service';

// ─── Types ────────────────────────────────────────────────────────────────────

type ChannelKey =
  | 'progression'
  | 'retention'
  | 'training_reminder'
  | 'encouragement'
  | 'social'
  | 'chat';

interface ChannelConfig {
  enabled: boolean;
  titleTemplate: string;
  bodyTemplate: string;
}

interface NotifConfig {
  channels: Partial<Record<ChannelKey, ChannelConfig>>;
  /** Global emergency kill-switch — halts every channel except `system`.
   *  Absent/undefined = enabled (matches push.service.ts's safe default). */
  pushEnabled?: boolean;
  updatedAt?: unknown;
}

interface RecentSend {
  id: string;
  title: string;
  message: string;
  channel: string;
  status: string;
  targetAudience: string;
  sentAt: Date;
  deliveredCount: number;
}

// ─── Catalog definition ───────────────────────────────────────────────────────

interface CatalogEntry {
  channel: ChannelKey;
  label: string;
  type: 'auto' | 'manual';
  trigger: string;
  icon: React.ElementType;
  iconBg: string;
  templateVars?: string[];
  defaultTitle: string;
  defaultBody: string;
  rateCapHours?: number;
  implemented: boolean;
  note?: string;
}

const CATALOG: CatalogEntry[] = [
  {
    channel: 'progression',
    label: 'עליית רמה',
    type: 'auto',
    trigger: 'onChange users/{uid}.progression.globalLevel',
    icon: Trophy,
    iconBg: 'bg-yellow-100 text-yellow-600',
    templateVars: ['{level}'],
    defaultTitle: 'עלית לרמה {level}! 🎉',
    defaultBody: 'המשיכו כך — כל אימון מקדם אתכם!',
    rateCapHours: 24,
    implemented: true,
  },
  {
    channel: 'retention',
    label: 'חזרה לשגרה',
    type: 'auto',
    trigger: 'Scheduler — כל יום 10:00',
    icon: Heart,
    iconBg: 'bg-rose-100 text-rose-600',
    templateVars: ['{name}', '{days_since}'],
    defaultTitle: '{name}, {days_since} ימים בלי אימון',
    defaultBody: 'הגוף שלך מחכה לך. אפילו 15 דקות ישנו את מצב הרוח שלך.',
    rateCapHours: 48,
    implemented: true,
  },
  {
    channel: 'training_reminder',
    label: 'תזכורת אימון',
    type: 'auto',
    trigger: 'Scheduler — כל יום 07:30',
    icon: Calendar,
    iconBg: 'bg-amber-100 text-amber-600',
    templateVars: ['{workout_title}'],
    defaultTitle: '📅 {workout_title} היום',
    defaultBody: 'האימון שלך מחכה — פתח את האפליקציה ותתחיל.',
    rateCapHours: 22,
    implemented: true,
  },
  {
    channel: 'encouragement',
    label: 'עידוד מהעירייה',
    type: 'manual',
    trigger: 'שליחה ידנית מהפאנל',
    icon: Megaphone,
    iconBg: 'bg-blue-100 text-blue-600',
    defaultTitle: '',
    defaultBody: '',
    implemented: true,
  },
  {
    channel: 'social',
    label: 'הצטרפות לקבוצה',
    type: 'auto',
    trigger: 'onCreate community_groups/{groupId}/members/{uid}',
    icon: Users,
    iconBg: 'bg-purple-100 text-purple-600',
    templateVars: ['{joiner_name}', '{group_name}'],
    defaultTitle: '{joiner_name} הצטרף לקבוצה!',
    defaultBody: 'חבר חדש הצטרף — {group_name} גדלה 🎉',
    rateCapHours: 24,
    implemented: false,
    note: 'שלב 7 — בפיתוח',
  },
  {
    channel: 'chat',
    label: 'הודעה בצ\'אט',
    type: 'auto',
    trigger: 'onCreate chats/{chatId}/messages',
    icon: MessageCircle,
    iconBg: 'bg-green-100 text-green-600',
    defaultTitle: 'הודעה חדשה',
    defaultBody: 'תוכן דינמי — שם השולח + תחילת ההודעה',
    implemented: true,
    note: 'תוכן נגזר מהודעה עצמה',
  },
];

const AUDIENCE_LABELS: Record<string, string> = {
  all: 'כל המשתמשים',
  active_users: 'משתמשים פעילים',
  inactive_users: 'משתמשים לא פעילים',
  park_users: 'משתמשי פארק',
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  pending: { label: 'ממתין', cls: 'bg-yellow-100 text-yellow-700' },
  processing: { label: 'בעיבוד', cls: 'bg-blue-100 text-blue-700' },
  sent: { label: 'נשלח', cls: 'bg-green-100 text-green-700' },
  failed: { label: 'נכשל', cls: 'bg-red-100 text-red-700' },
};

const CONFIG_DOC = 'app_config/notification_configs';

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [config, setConfig] = useState<NotifConfig>({ channels: {} });
  const [editingChannel, setEditingChannel] = useState<ChannelKey | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBody, setDraftBody] = useState('');
  const [savingChannel, setSavingChannel] = useState<ChannelKey | null>(null);

  const [recentSends, setRecentSends] = useState<RecentSend[]>([]);
  const [statsLoading, setStatsLoading] = useState(true);

  // ── Per-channel test send
  const [testingChannel, setTestingChannel] = useState<ChannelKey | null>(null);
  // 'empty' = route reached OK but 0 devices registered (distinct from a real failure).
  const [testResults, setTestResults] = useState<
    Partial<Record<ChannelKey, { kind: 'ok' | 'err' | 'empty'; msg?: string }>>
  >({});

  const handleTestSend = async (channel: ChannelKey) => {
    if (!currentUserId || testingChannel) return;
    setTestingChannel(channel);
    setTestResults((prev) => { const r = { ...prev }; delete r[channel]; return r; });
    try {
      // Attach a Firebase ID token so auth no longer depends on the 1-hour
      // out_admin_session cookie silently expiring (the route accepts Bearer).
      const idToken = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/admin/notifications/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({ channel, uid: currentUserId }),
      });
      const json = await res.json() as { delivered?: number; error?: string; reason?: string };
      if (!res.ok || json.error) {
        setTestResults((prev) => ({
          ...prev,
          [channel]: { kind: 'err', msg: json.error ?? `HTTP ${res.status}` },
        }));
      } else if (!json.delivered || json.delivered === 0) {
        // Delivered nothing — surface the real reason instead of "failed".
        setTestResults((prev) => ({
          ...prev,
          [channel]: { kind: 'empty', msg: json.reason ?? 'לא נמסר — אין מכשירים רשומים' },
        }));
      } else {
        setTestResults((prev) => ({ ...prev, [channel]: { kind: 'ok' } }));
      }
    } catch (err) {
      console.error('[test-push] fetch failed', err);
      setTestResults((prev) => ({ ...prev, [channel]: { kind: 'err', msg: 'שגיאת רשת' } }));
    } finally {
      setTestingChannel(null);
    }
  };

  // ── Manual send modal
  const [manualOpen, setManualOpen] = useState(false);
  const [manualTitle, setManualTitle] = useState('');
  const [manualBody, setManualBody] = useState('');
  const [manualAudience, setManualAudience] = useState<'all' | 'active_users' | 'inactive_users' | 'park_users' | 'single_user'>('all');
  const [manualDeepLink, setManualDeepLink] = useState('/');
  const [manualSending, setManualSending] = useState(false);
  const [manualError, setManualError] = useState('');
  const [manualSuccess, setManualSuccess] = useState(false);
  const [manualSuccessMsg, setManualSuccessMsg] = useState('');

  // ── Single-user targeting (manualAudience === 'single_user')
  const [userList, setUserList] = useState<{ id: string; name: string; email?: string; fcmTokenCount: number }[]>([]);
  const [userListLoading, setUserListLoading] = useState(false);
  const [userSearch, setUserSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string; fcmTokenCount: number } | null>(null);

  // ── Auth
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setCurrentUserId(user?.uid ?? null));
    return unsub;
  }, []);

  // ── Lazy-load the user list for single-user targeting (only when first needed).
  useEffect(() => {
    if (manualAudience !== 'single_user' || userList.length > 0 || userListLoading) return;
    setUserListLoading(true);
    getAllUsers()
      .then((users) =>
        setUserList(
          users.map((u) => ({ id: u.id, name: u.name, email: u.email, fcmTokenCount: u.fcmTokenCount })),
        ),
      )
      .catch((e) => console.error('[notifications] user list load failed:', e))
      .finally(() => setUserListLoading(false));
  }, [manualAudience, userList.length, userListLoading]);

  const userQuery = userSearch.trim().toLowerCase();
  const userMatches = manualAudience === 'single_user' && userQuery.length >= 2
    ? userList
        .filter((u) => u.name.toLowerCase().includes(userQuery) || (u.email?.toLowerCase().includes(userQuery) ?? false))
        .slice(0, 8)
    : [];

  // ── Load Firestore config
  const loadConfig = useCallback(async () => {
    try {
      const snap = await getDoc(doc(db, 'app_config', 'notification_configs'));
      if (snap.exists()) {
        setConfig(snap.data() as NotifConfig);
      }
    } catch (err) {
      console.error('[notifications] config load failed:', err);
    }
  }, []);

  // ── Load recent sends
  const loadRecentSends = useCallback(async () => {
    setStatsLoading(true);
    try {
      const q = query(
        collection(db, 'push_messages'),
        orderBy('sentAt', 'desc'),
        limit(15),
      );
      const snap = await getDocs(q);
      setRecentSends(
        snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          const sentAt = data.sentAt instanceof Timestamp
            ? data.sentAt.toDate()
            : new Date();
          return {
            id: d.id,
            title: String(data.title ?? ''),
            message: String(data.message ?? ''),
            channel: String(data.channel ?? 'encouragement'),
            status: String(data.status ?? 'sent'),
            targetAudience: String(data.targetAudience ?? 'all'),
            sentAt,
            deliveredCount: Number(data.deliveredCount ?? 0),
          };
        }),
      );
    } catch (err) {
      console.error('[notifications] recent sends load failed:', err);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
    loadRecentSends();
  }, [loadConfig, loadRecentSends]);

  // ── Global emergency kill-switch — halts ALL channels (except `system`,
  // which push.service.ts always exempts). Confirm-dialog-gated since this
  // is a real "stop everything" action, not a routine per-channel toggle.
  const isGlobalEnabled = config.pushEnabled !== false; // default true

  const handleGlobalToggle = async () => {
    const next = !isGlobalEnabled;
    const confirmed = window.confirm(
      next
        ? 'להפעיל מחדש את כל הפושים באפליקציה?'
        : 'לעצור את כל הפושים באפליקציה כולה? זו פעולת חירום — כל הערוצים ייעצרו מיידית (למעט הודעות מערכת קריטיות).',
    );
    if (!confirmed) return;

    const updated: NotifConfig = { ...config, pushEnabled: next };
    setConfig(updated);
    try {
      await setDoc(doc(db, 'app_config', 'notification_configs'), {
        ...updated,
        updatedAt: Timestamp.now(),
      });
    } catch (err) {
      console.error('[notifications] global kill-switch save failed:', err);
      setConfig(config); // revert optimistic update
    }
  };

  // ── Per-channel enable toggle
  const handleToggle = async (channel: ChannelKey, enabled: boolean) => {
    const updated: NotifConfig = {
      ...config,
      channels: {
        ...config.channels,
        [channel]: {
          enabled,
          titleTemplate: config.channels[channel]?.titleTemplate ?? CATALOG.find(c => c.channel === channel)?.defaultTitle ?? '',
          bodyTemplate: config.channels[channel]?.bodyTemplate ?? CATALOG.find(c => c.channel === channel)?.defaultBody ?? '',
        },
      },
    };
    setConfig(updated);
    try {
      await setDoc(doc(db, 'app_config', 'notification_configs'), {
        ...updated,
        updatedAt: Timestamp.now(),
      });
    } catch (err) {
      console.error('[notifications] toggle save failed:', err);
      // Revert optimistic update on failure
      setConfig(config);
    }
  };

  // ── Open template editor for a channel
  const handleEditOpen = (entry: CatalogEntry) => {
    setEditingChannel(entry.channel);
    setDraftTitle(config.channels[entry.channel]?.titleTemplate ?? entry.defaultTitle);
    setDraftBody(config.channels[entry.channel]?.bodyTemplate ?? entry.defaultBody);
  };

  // ── Save template
  const handleTemplateSave = async () => {
    if (!editingChannel) return;
    setSavingChannel(editingChannel);
    const updated: NotifConfig = {
      ...config,
      channels: {
        ...config.channels,
        [editingChannel]: {
          enabled: config.channels[editingChannel]?.enabled ?? true,
          titleTemplate: draftTitle,
          bodyTemplate: draftBody,
        },
      },
    };
    setConfig(updated);
    try {
      await setDoc(doc(db, 'app_config', 'notification_configs'), {
        ...updated,
        updatedAt: Timestamp.now(),
      });
      setEditingChannel(null);
    } catch (err) {
      console.error('[notifications] template save failed:', err);
    } finally {
      setSavingChannel(null);
    }
  };

  // ── Manual send
  const handleManualSend = async () => {
    if (!manualTitle.trim() || !manualBody.trim() || !currentUserId) return;
    if (manualAudience === 'single_user' && !selectedUser) {
      setManualError('בחר משתמש לשליחה.');
      return;
    }
    setManualSending(true);
    setManualError('');
    try {
      if (manualAudience === 'single_user' && selectedUser) {
        // Targeted single-user send via the direct FCM route (all the user's devices).
        const idToken = await auth.currentUser?.getIdToken();
        const res = await fetch('/api/admin/notifications/test', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({
            channel: 'encouragement',
            uid: selectedUser.id,
            title: manualTitle.trim(),
            body: manualBody.trim(),
            deepLink: manualDeepLink || '/',
          }),
        });
        const json = await res.json() as { delivered?: number; error?: string; reason?: string };
        if (!res.ok || json.error) {
          setManualError(json.error ?? `שגיאה (HTTP ${res.status})`);
          return;
        }
        if (!json.delivered || json.delivered === 0) {
          setManualError(json.reason ?? 'לא נמסר — אין מכשירים רשומים למשתמש.');
          return;
        }
        setManualSuccessMsg(`ההודעה נשלחה ל-${selectedUser.name} ✓`);
      } else if (manualAudience !== 'single_user') {
        await sendEncouragementPush('all', {
          title: manualTitle.trim(),
          message: manualBody.trim(),
          targetAudience: manualAudience,
          sentBy: { adminId: currentUserId, adminName: 'Admin' },
          channel: 'encouragement',
          deepLink: manualDeepLink || '/',
        });
        setManualSuccessMsg('ההתראה נוספה לתור השליחה ✓');
      }
      setManualSuccess(true);
      setManualTitle('');
      setManualBody('');
      setManualDeepLink('/');
      setManualAudience('all');
      setSelectedUser(null);
      setUserSearch('');
      loadRecentSends();
      setTimeout(() => {
        setManualSuccess(false);
        setManualOpen(false);
      }, 2000);
    } catch (err) {
      console.error('[notifications] manual send failed:', err);
      setManualError('שגיאה בשליחה. נסה שוב.');
    } finally {
      setManualSending(false);
    }
  };

  // ── Stats helpers
  const channelSendCount = (channel: string) =>
    recentSends.filter((s) => s.channel === channel).length;

  const totalDelivered = (channel: string) =>
    recentSends.filter((s) => s.channel === channel).reduce((acc, s) => acc + s.deliveredCount, 0);

  const isEnabled = (channel: ChannelKey) =>
    config.channels[channel]?.enabled !== false; // default true

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8" dir="rtl">
      {/* ── Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">מרכז התראות</h1>
          <p className="text-sm text-gray-400 mt-1">ניהול כל ערוצי הפוש — אוטומטי וידני</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { loadConfig(); loadRecentSends(); }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-sm transition-colors"
          >
            <RefreshCw size={14} />
            רענן
          </button>
          <button
            onClick={() => { setManualOpen(true); setManualSuccess(false); setManualError(''); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
          >
            <Send size={14} />
            שלח ידנית
          </button>
        </div>
      </div>

      {/* ── Global emergency kill-switch */}
      <div className={`rounded-xl border p-4 flex items-center justify-between gap-4 ${
        isGlobalEnabled ? 'bg-white/5 border-white/10' : 'bg-red-950/40 border-red-800'
      }`}>
        <div className="flex items-center gap-3">
          <AlertCircle size={18} className={isGlobalEnabled ? 'text-gray-400' : 'text-red-400'} />
          <div>
            <p className="text-sm font-semibold text-white">
              {isGlobalEnabled ? 'כל הפושים פעילים' : '⚠️ כל הפושים עצורים — מתג חירום פעיל'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              מתג חירום גלובלי — עוצר את כל שליחת הפוש באפליקציה (למעט הודעות מערכת קריטיות).
            </p>
          </div>
        </div>
        <button
          onClick={handleGlobalToggle}
          className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 mt-1 ${
            isGlobalEnabled ? 'bg-green-500' : 'bg-red-600'
          }`}
          title={isGlobalEnabled ? 'עצור הכל' : 'הפעל מחדש'}
        >
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
            isGlobalEnabled ? 'translate-x-1' : 'translate-x-5'
          }`} />
        </button>
      </div>

      {/* ── Catalog */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CATALOG.map((entry) => {
          const Icon = entry.icon;
          const enabled = isEnabled(entry.channel);
          const isEditing = editingChannel === entry.channel;
          const sendCount = channelSendCount(entry.channel);
          const delivered = totalDelivered(entry.channel);
          const savedTitle = config.channels[entry.channel]?.titleTemplate ?? entry.defaultTitle;
          const savedBody = config.channels[entry.channel]?.bodyTemplate ?? entry.defaultBody;

          return (
            <div
              key={entry.channel}
              className={`rounded-xl border transition-colors ${
                enabled
                  ? 'bg-white/5 border-white/10'
                  : 'bg-white/[0.02] border-white/5 opacity-60'
              }`}
            >
              {/* Card header */}
              <div className="flex items-start gap-3 p-4">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${entry.iconBg}`}>
                  <Icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{entry.label}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      entry.type === 'auto'
                        ? 'bg-indigo-900/50 text-indigo-300'
                        : 'bg-orange-900/50 text-orange-300'
                    }`}>
                      {entry.type === 'auto' ? 'אוטומטי' : 'ידני'}
                    </span>
                    {!entry.implemented && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
                        בפיתוח
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 truncate">{entry.trigger}</p>
                </div>
                {/* Toggle */}
                <button
                  onClick={() => handleToggle(entry.channel, !enabled)}
                  disabled={!entry.implemented}
                  className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 mt-1 ${
                    !entry.implemented ? 'opacity-30 cursor-not-allowed' :
                    enabled ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                  title={enabled ? 'כבה' : 'הפעל'}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    enabled ? 'translate-x-1' : 'translate-x-5'
                  }`} />
                </button>
              </div>

              {/* Stats row */}
              {!statsLoading && (
                <div className="flex gap-4 px-4 pb-3 text-xs text-gray-500">
                  <span>{sendCount} שליחות (15 אחרונות)</span>
                  {delivered > 0 && <span>· {delivered.toLocaleString()} נמסרו</span>}
                  {entry.rateCapHours && (
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      cap {entry.rateCapHours}h
                    </span>
                  )}
                </div>
              )}

              {/* Test send button */}
              {entry.implemented && currentUserId && (
                <div className="px-4 pb-3 flex items-center gap-2">
                  <button
                    onClick={() => handleTestSend(entry.channel)}
                    disabled={testingChannel !== null}
                    className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {testingChannel === entry.channel ? (
                      <RefreshCw size={11} className="animate-spin" />
                    ) : (
                      <Zap size={11} />
                    )}
                    שלח טסט אליי
                  </button>
                  {testResults[entry.channel]?.kind === 'ok' && (
                    <span className="flex items-center gap-1 text-xs text-green-400">
                      <CheckCircle2 size={11} />
                      נשלח
                    </span>
                  )}
                  {testResults[entry.channel]?.kind === 'empty' && (
                    <span
                      className="flex items-center gap-1 text-xs text-amber-400"
                      title={testResults[entry.channel]?.msg}
                    >
                      <AlertCircle size={11} />
                      אין מכשירים רשומים
                    </span>
                  )}
                  {testResults[entry.channel]?.kind === 'err' && (
                    <span
                      className="flex items-center gap-1 text-xs text-red-400"
                      title={testResults[entry.channel]?.msg}
                    >
                      <AlertCircle size={11} />
                      נכשל
                    </span>
                  )}
                </div>
              )}

              {/* Template section — only for auto channels with template vars */}
              {entry.type === 'auto' && entry.templateVars && entry.channel !== 'chat' && (
                <div className="border-t border-white/5 px-4 py-3">
                  {isEditing ? (
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">כותרת</label>
                        <input
                          value={draftTitle}
                          onChange={(e) => setDraftTitle(e.target.value)}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">גוף</label>
                        <textarea
                          value={draftBody}
                          onChange={(e) => setDraftBody(e.target.value)}
                          rows={2}
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1 flex-wrap">
                          {entry.templateVars.map((v) => (
                            <span key={v} className="text-xs bg-indigo-900/40 text-indigo-300 px-1.5 py-0.5 rounded font-mono">
                              {v}
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-2 mr-auto">
                          <button
                            onClick={() => setEditingChannel(null)}
                            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded"
                          >
                            ביטול
                          </button>
                          <button
                            onClick={handleTemplateSave}
                            disabled={savingChannel === entry.channel}
                            className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1 rounded font-medium disabled:opacity-50"
                          >
                            {savingChannel === entry.channel ? '...' : 'שמור'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-gray-300 font-medium truncate">{savedTitle}</p>
                        <p className="text-xs text-gray-500 truncate">{savedBody}</p>
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {entry.templateVars.map((v) => (
                            <span key={v} className="text-xs bg-indigo-900/30 text-indigo-400 px-1.5 py-0.5 rounded font-mono">
                              {v}
                            </span>
                          ))}
                        </div>
                      </div>
                      <button
                        onClick={() => handleEditOpen(entry)}
                        className="text-xs text-gray-500 hover:text-indigo-400 whitespace-nowrap flex-shrink-0 mt-0.5"
                      >
                        ערוך
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Chat note */}
              {entry.note && entry.channel === 'chat' && (
                <div className="border-t border-white/5 px-4 py-2">
                  <p className="text-xs text-gray-500">{entry.note}</p>
                </div>
              )}

              {/* Manual channel note */}
              {entry.type === 'manual' && (
                <div className="border-t border-white/5 px-4 py-2">
                  <p className="text-xs text-gray-500">
                    שלח הודעה חופשית לכל קהל דרך{' '}
                    <button
                      onClick={() => setManualOpen(true)}
                      className="text-indigo-400 hover:text-indigo-300 underline"
                    >
                      כפתור שלח ידנית
                    </button>
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Recent sends */}
      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">שליחות אחרונות</h2>
        {statsLoading ? (
          <div className="text-sm text-gray-500 py-4">טוען...</div>
        ) : recentSends.length === 0 ? (
          <div className="text-sm text-gray-500 py-4">אין שליחות עדיין</div>
        ) : (
          <div className="rounded-xl border border-white/10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-xs text-gray-500">
                  <th className="text-right px-4 py-2.5 font-medium">כותרת</th>
                  <th className="text-right px-4 py-2.5 font-medium">ערוץ</th>
                  <th className="text-right px-4 py-2.5 font-medium">קהל</th>
                  <th className="text-right px-4 py-2.5 font-medium">סטטוס</th>
                  <th className="text-right px-4 py-2.5 font-medium">נמסרו</th>
                  <th className="text-right px-4 py-2.5 font-medium">תאריך</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentSends.map((send) => {
                  const badge = STATUS_BADGE[send.status] ?? { label: send.status, cls: 'bg-gray-800 text-gray-400' };
                  return (
                    <tr key={send.id} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-2.5 text-gray-200 max-w-[200px] truncate">{send.title}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded">
                          {send.channel}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">
                        {AUDIENCE_LABELS[send.targetAudience] ?? send.targetAudience}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 text-xs">
                        {send.deliveredCount > 0 ? send.deliveredCount.toLocaleString() : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs whitespace-nowrap">
                        {send.sentAt.toLocaleDateString('he-IL')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Manual send modal */}
      {manualOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 shadow-2xl rounded-2xl w-full max-w-md p-6 space-y-5" dir="rtl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Megaphone size={18} className="text-indigo-600" />
                שלח הודעה ידנית
              </h2>
              <button
                onClick={() => setManualOpen(false)}
                className="text-gray-400 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">כותרת *</label>
                <input
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="כותרת ההתראה"
                  maxLength={80}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">גוף ההודעה *</label>
                <textarea
                  value={manualBody}
                  onChange={(e) => setManualBody(e.target.value)}
                  placeholder="טקסט מלא..."
                  maxLength={200}
                  rows={3}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:bg-white resize-none"
                />
                <p className="text-xs text-gray-500 mt-1 text-left">{manualBody.length}/200</p>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">קהל יעד</label>
                <select
                  value={manualAudience}
                  onChange={(e) => {
                    setManualAudience(e.target.value as typeof manualAudience);
                    setManualError('');
                    if (e.target.value !== 'single_user') { setSelectedUser(null); setUserSearch(''); }
                  }}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-indigo-500 focus:bg-white"
                >
                  <option value="all">כל המשתמשים</option>
                  <option value="active_users">משתמשים פעילים</option>
                  <option value="inactive_users">משתמשים לא פעילים</option>
                  <option value="park_users">משתמשי פארק</option>
                  <option value="single_user">משתמש בודד (לפי שם / מייל)</option>
                </select>
              </div>

              {/* Single-user picker — autocomplete over the user list */}
              {manualAudience === 'single_user' && (
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1.5 block">בחר משתמש</label>
                  {selectedUser ? (
                    <div className="flex items-center justify-between gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                      <span className="text-sm text-gray-900 truncate">
                        {selectedUser.name}
                        <span className="text-xs text-gray-500 mr-2">· {selectedUser.fcmTokenCount} מכשירים</span>
                      </span>
                      <button
                        onClick={() => { setSelectedUser(null); setUserSearch(''); }}
                        className="text-xs text-indigo-600 hover:text-indigo-700 flex-shrink-0"
                      >
                        שנה
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder={userListLoading ? 'טוען משתמשים…' : 'הקלד שם או מייל…'}
                        disabled={userListLoading}
                        className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:bg-white disabled:opacity-50"
                      />
                      {userQuery.length >= 2 && !userListLoading && (
                        <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100 bg-white">
                          {userMatches.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-gray-500">אין תוצאות</div>
                          ) : (
                            userMatches.map((u) => (
                              <button
                                key={u.id}
                                onClick={() => { setSelectedUser({ id: u.id, name: u.name, fcmTokenCount: u.fcmTokenCount }); setUserSearch(''); }}
                                className="w-full text-right px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 flex items-center justify-between gap-2"
                              >
                                <span className="truncate">
                                  {u.name}
                                  {u.email && <span className="text-xs text-gray-500"> · {u.email}</span>}
                                </span>
                                <span className="text-xs text-gray-500 flex-shrink-0">{u.fcmTokenCount} 📱</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}
                      <p className="text-xs text-gray-500 mt-1">שולח לכל המכשירים הרשומים של המשתמש.</p>
                    </>
                  )}
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1.5 block">קישור עמוק (deep link)</label>
                <input
                  value={manualDeepLink}
                  onChange={(e) => setManualDeepLink(e.target.value)}
                  placeholder="/"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:bg-white font-mono"
                />
              </div>
            </div>

            {/* Preview */}
            {(manualTitle || manualBody) && (
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                  <Bell size={10} />
                  תצוגה מקדימה
                </p>
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                    <Bell size={14} className="text-gray-700" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{manualTitle || '...'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{manualBody || '...'}</p>
                  </div>
                </div>
              </div>
            )}

            {manualError && (
              <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle size={14} />
                {manualError}
              </div>
            )}
            {manualSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle2 size={14} />
                {manualSuccessMsg || 'נשלח ✓'}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setManualOpen(false)}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-800 transition-colors"
              >
                ביטול
              </button>
              <button
                onClick={handleManualSend}
                disabled={
                  manualSending || !manualTitle.trim() || !manualBody.trim() || !currentUserId ||
                  (manualAudience === 'single_user' && !selectedUser)
                }
                className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {manualSending ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                {manualSending ? 'שולח...' : 'שלח'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
