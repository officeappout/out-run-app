'use client';

export const dynamic = 'force-dynamic';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowRight, Save, Loader2 } from 'lucide-react';
import {
  getPaceMapConfig,
  savePaceMapConfig,
} from '@/features/workout-engine/core/services/running-admin.service';
import {
  computeZones,
  formatPaceSeconds,
} from '@/features/workout-engine/core/services/running-engine.service';
import type {
  PaceMapConfig,
  PaceZoneRule,
  RunZoneType,
  RunnerProfileType,
} from '@/features/workout-engine/core/types/running.types';
import { ALL_RUN_ZONES } from '@/features/workout-engine/core/types/running.types';
import { DEFAULT_PACE_MAP_CONFIG } from '@/features/workout-engine/core/config/pace-map-config';

const PROFILE_LABELS: Record<string, string> = {
  profileFast: 'משפר מהיר (< 6:00)',
  profileSlow: 'משפר איטי (≥ 6:00)',
  profileBeginner: 'מתחיל',
  profileMaintenance: 'שימור',
};

const PROFILE_KEYS = ['profileFast', 'profileSlow', 'profileBeginner', 'profileMaintenance'] as const;

export default function PaceMapConfigPage() {
  const [config, setConfig] = useState<PaceMapConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewBasePace, setPreviewBasePace] = useState(330); // 5:30
  const [activeTab, setActiveTab] = useState<typeof PROFILE_KEYS[number]>('profileFast');

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const c = await getPaceMapConfig();
      setConfig(c);
    } catch (err) {
      console.error(err);
      setConfig(DEFAULT_PACE_MAP_CONFIG);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const updateRule = (
    profileKey: typeof PROFILE_KEYS[number],
    zone: RunZoneType,
    updates: Partial<PaceZoneRule>,
  ) => {
    if (!config) return;
    setConfig({
      ...config,
      [profileKey]: {
        ...config[profileKey],
        [zone]: { ...config[profileKey][zone], ...updates },
      },
    });
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    try {
      const ok = await savePaceMapConfig(config);
      if (ok) alert('המפה נשמרה בהצלחה');
      else alert('שגיאה בשמירה');
    } finally {
      setSaving(false);
    }
  };

  const previewZones = config
    ? computeZones(
        previewBasePace,
        activeTab === 'profileFast' ? 1 : activeTab === 'profileSlow' ? 2 : activeTab === 'profileBeginner' ? 3 : 4,
        config,
      )
    : null;

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  const c = config ?? DEFAULT_PACE_MAP_CONFIG;

  return (
    <div className="space-y-6 max-w-6xl" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href="/admin/running"
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-2"
          >
            <ArrowRight size={18} />
            חזור למנוע ריצה
          </Link>
          <h1 className="text-3xl font-black text-gray-900">מפת קצבים</h1>
          <p className="text-gray-500 mt-1">ערוך את טבלאות האחוזים לכל 4 סוגי הרצים</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-xl font-bold hover:bg-cyan-600 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
          {saving ? 'שומר...' : 'שמור'}
        </button>
      </div>

      {/* Preview base pace input */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <label className="block text-sm font-bold text-gray-700 mb-2">תצוגה מקדימה — קצב בסיס (דק׳:שניות לק״מ)</label>
        <div className="flex items-center gap-4">
          <input
            type="number"
            min="1"
            max="20"
            step="0.5"
            value={previewBasePace / 60}
            onChange={(e) => setPreviewBasePace(Math.round(parseFloat(e.target.value || '5.5') * 60))}
            className="w-24 px-3 py-2 border border-gray-300 rounded-lg"
          />
          <span className="text-gray-500">= {formatPaceSeconds(previewBasePace)} דק׳/ק״מ</span>
        </div>
      </div>

      {/* Profile tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {PROFILE_KEYS.map((key) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 font-bold text-sm rounded-t-lg transition-colors ${
              activeTab === key ? 'bg-cyan-100 text-cyan-800' : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            {PROFILE_LABELS[key]}
          </button>
        ))}
      </div>

      {/* Zone table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-right">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-sm font-bold text-gray-700">אזור</th>
              <th className="px-4 py-3 text-sm font-bold text-gray-700">מינ׳ %</th>
              <th className="px-4 py-3 text-sm font-bold text-gray-700">מקס׳ %</th>
              <th className="px-4 py-3 text-sm font-bold text-gray-700">קבוע מינ׳ (שניות)</th>
              <th className="px-4 py-3 text-sm font-bold text-gray-700">קבוע מקס׳ (שניות)</th>
              <th className="px-4 py-3 text-sm font-bold text-gray-700">תצוגה מקדימה</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {ALL_RUN_ZONES.map((zone) => {
              const rule = c[activeTab][zone];
              const isWalk = zone === 'walk';
              const preview = previewZones?.[zone];
              return (
                <tr key={zone} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{rule.label}</td>
                  <td className="px-4 py-2">
                    {!isWalk && (
                      <input
                        type="number"
                        value={rule.minPercent ?? ''}
                        onChange={(e) =>
                          updateRule(activeTab, zone, {
                            minPercent: e.target.value ? parseInt(e.target.value, 10) : undefined,
                          })
                        }
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder="—"
                      />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {!isWalk && (
                      <input
                        type="number"
                        value={rule.maxPercent ?? ''}
                        onChange={(e) =>
                          updateRule(activeTab, zone, {
                            maxPercent: e.target.value ? parseInt(e.target.value, 10) : undefined,
                          })
                        }
                        className="w-20 px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder="—"
                      />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isWalk && (
                      <input
                        type="number"
                        value={rule.fixedMinSeconds ?? ''}
                        onChange={(e) =>
                          updateRule(activeTab, zone, {
                            fixedMinSeconds: e.target.value ? parseInt(e.target.value, 10) : undefined,
                          })
                        }
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder="510"
                      />
                    )}
                  </td>
                  <td className="px-4 py-2">
                    {isWalk && (
                      <input
                        type="number"
                        value={rule.fixedMaxSeconds ?? ''}
                        onChange={(e) =>
                          updateRule(activeTab, zone, {
                            fixedMaxSeconds: e.target.value ? parseInt(e.target.value, 10) : undefined,
                          })
                        }
                        className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                        placeholder="690"
                      />
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-cyan-600 font-medium">
                    {preview ? `${formatPaceSeconds(preview.minPace)} – ${formatPaceSeconds(preview.maxPace)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
