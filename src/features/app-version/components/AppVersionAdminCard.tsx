'use client';

/**
 * Admin — "עדכון חובה" card for /admin/system-settings. Self-contained:
 * loads and saves `app_config/app_version` on its own.
 */
import { useEffect, useState } from 'react';
import { CheckCircle2, Save, Smartphone } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { DEFAULT_APP_VERSION_CONFIG } from '../app-version.logic';
import { loadAppVersionConfig, saveAppVersionConfig } from '../app-version.service';
import type { AppPlatform, AppVersionConfig } from '../app-version.types';

const PLATFORMS: { key: AppPlatform; label: string; buildHint: string }[] = [
  { key: 'ios', label: 'אייפון (iOS)', buildHint: 'מספר ה-Build ב-App Store Connect' },
  { key: 'android', label: 'אנדרואיד', buildHint: 'ה-versionCode ב-Play Console' },
];

const input = 'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none';

export default function AppVersionAdminCard() {
  const [config, setConfig] = useState<AppVersionConfig>(DEFAULT_APP_VERSION_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadAppVersionConfig().then((c) => {
      setConfig(c);
      setLoading(false);
    });
  }, []);

  const setRule = (p: AppPlatform, patch: Partial<AppVersionConfig[AppPlatform]>) =>
    setConfig((c) => ({ ...c, [p]: { ...c[p], ...patch } }));

  const save = async () => {
    if (config.enabled && !window.confirm('עדכון החובה יופעל: כל מי שבגרסה ישנה מהמינימום ייחסם עד שיעדכן. להמשיך?')) return;
    setSaving(true);
    setError(null);
    try {
      await saveAppVersionConfig(config, auth.currentUser?.email ?? null);
      setSavedAt(Date.now());
    } catch {
      setError('השמירה נכשלה. נסה שוב.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return null;

  return (
    <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-cyan-50">
          <Smartphone size={18} className="text-cyan-600" />
        </div>
        <div>
          <h2 className="text-lg font-black text-slate-900">עדכון חובה לאפליקציה</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            מי שמותקנת אצלו גרסה ישנה מהמינימום יראה מסך &quot;עדכנו כדי להמשיך&quot; עם כפתור לחנות. 0 = לא חוסמים.
            להפעיל רק אחרי שהגרסה החדשה כבר זמינה בחנות.
          </p>
        </div>
      </div>

      <label className="mb-4 flex cursor-pointer items-center gap-2 text-sm font-bold text-slate-800">
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => setConfig((c) => ({ ...c, enabled: e.target.checked }))}
          className="h-4 w-4 accent-cyan-500"
        />
        עדכון חובה פעיל
      </label>

      <div className="grid gap-4 md:grid-cols-2">
        {PLATFORMS.map(({ key, label, buildHint }) => (
          <div key={key} className="space-y-2 rounded-xl bg-slate-50 p-3">
            <div className="text-sm font-bold text-slate-800">{label}</div>
            <label className="block text-xs text-slate-500">
              גרסת מינימום ({buildHint})
              <input
                type="number"
                min={0}
                value={config[key].minBuild}
                onChange={(e) => setRule(key, { minBuild: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                className={input}
                dir="ltr"
              />
            </label>
            <label className="block text-xs text-slate-500">
              קישור לחנות
              <input
                value={config[key].storeUrl}
                onChange={(e) => setRule(key, { storeUrl: e.target.value })}
                className={input}
                dir="ltr"
              />
            </label>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-2">
        <label className="block text-xs text-slate-500">
          כותרת
          <input value={config.title} onChange={(e) => setConfig((c) => ({ ...c, title: e.target.value }))} className={input} />
        </label>
        <label className="block text-xs text-slate-500">
          הודעה
          <textarea
            value={config.message}
            onChange={(e) => setConfig((c) => ({ ...c, message: e.target.value }))}
            rows={2}
            className={input}
          />
        </label>
        <label className="block text-xs text-slate-500">
          טקסט הכפתור
          <input
            value={config.buttonLabel}
            onChange={(e) => setConfig((c) => ({ ...c, buttonLabel: e.target.value }))}
            className={input}
          />
        </label>
      </div>

      {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-xl bg-cyan-500 px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-cyan-600 disabled:opacity-60"
        >
          <Save size={16} />
          {saving ? 'שומר...' : 'שמור'}
        </button>
        {savedAt && !saving && (
          <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
            <CheckCircle2 size={16} />
            נשמר בהצלחה
          </div>
        )}
      </div>
    </div>
  );
}
