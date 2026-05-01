'use client';

export const dynamic = 'force-dynamic';

import { useState, useMemo } from 'react';
import {
  Map as MapIcon,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Database,
  Eye,
} from 'lucide-react';
import {
  runOsmImport,
  type ImportResult,
  type ScoreHistogram,
} from '@/features/admin/services/osm-segment-importer';

// ── BBox presets ──────────────────────────────────────────────────────────────

interface Preset {
  id: string;
  label: string;
  cityName: string;
  authorityId: string;
  bbox: { south: number; west: number; north: number; east: number };
}

const PRESETS: Preset[] = [
  {
    id: 'tlv',
    label: 'תל אביב',
    cityName: 'תל אביב',
    authorityId: 'placeholder_tlv',
    bbox: { south: 32.04, west: 34.75, north: 32.1, east: 34.82 },
  },
  {
    id: 'sderot',
    label: 'שדרות',
    cityName: 'שדרות',
    authorityId: 'CdiRk1QP5UrUGSbGjCkU',
    bbox: { south: 31.51, west: 34.57, north: 31.55, east: 34.62 },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function bboxAreaKm2(bbox: { south: number; west: number; north: number; east: number }): number {
  // Rough rectangle area on the WGS84 sphere — fine for sanity-checking
  // user input ("did I paste this in degrees or radians?").
  const latKm = (bbox.north - bbox.south) * 111;
  const midLat = (bbox.north + bbox.south) / 2;
  const lngKm = (bbox.east - bbox.west) * 111 * Math.cos((midLat * Math.PI) / 180);
  return Math.max(0, latKm * lngKm);
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SegmentsImportPage() {
  // Form state — defaults to the Tel Aviv preset
  const [cityName, setCityName] = useState(PRESETS[0].cityName);
  const [authorityId, setAuthorityId] = useState(PRESETS[0].authorityId);
  const [south, setSouth] = useState(PRESETS[0].bbox.south);
  const [west, setWest] = useState(PRESETS[0].bbox.west);
  const [north, setNorth] = useState(PRESETS[0].bbox.north);
  const [east, setEast] = useState(PRESETS[0].bbox.east);
  const [minScore, setMinScore] = useState(3);
  const [dryRun, setDryRun] = useState(true);

  // Run state
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const bboxArea = useMemo(
    () => bboxAreaKm2({ south, west, north, east }),
    [south, west, north, east],
  );

  const bboxValid = south < north && west < east;

  function applyPreset(preset: Preset) {
    setCityName(preset.cityName);
    setAuthorityId(preset.authorityId);
    setSouth(preset.bbox.south);
    setWest(preset.bbox.west);
    setNorth(preset.bbox.north);
    setEast(preset.bbox.east);
    setLog([]);
    setResult(null);
    setError(null);
  }

  async function handleRun() {
    setRunning(true);
    setError(null);
    setResult(null);
    setLog([]);

    try {
      const res = await runOsmImport(
        {
          bbox: { south, west, north, east },
          cityName: cityName.trim(),
          authorityId: authorityId.trim(),
          minScore,
          commit: !dryRun,
        },
        (msg) => setLog((prev) => [...prev, msg]),
      );
      setResult(res);
    } catch (err) {
      setError((err as Error).message ?? 'Unknown error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-8" dir="rtl">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <MapIcon className="text-cyan-500" size={28} />
          <h1 className="text-2xl font-black text-gray-900">ייבוא קטעי רחוב מ-OSM</h1>
        </div>
        <p className="text-gray-500 text-sm">
          שולף ways מ-OpenStreetMap בתוך Bounding Box, מחשב ציון 0–10 לכל קטע, ושומר ב-
          <code className="mx-1 px-1.5 py-0.5 rounded bg-gray-100 font-mono text-xs" dir="ltr">street_segments</code>
          לצורך מחולל המסלולים.
        </p>
      </div>

      {/* Presets */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-3">
        <h2 className="text-sm font-black text-gray-700 uppercase tracking-widest">
          ערים מוגדרות מראש
        </h2>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              onClick={() => applyPreset(p)}
              disabled={running}
              className="px-4 py-2 rounded-xl border border-gray-200 bg-gray-50 hover:bg-cyan-50 hover:border-cyan-300 text-sm font-bold text-gray-700 transition-colors disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-5">
        {/* City + authority */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">
              שם עיר (cityName)
            </span>
            <input
              type="text"
              value={cityName}
              onChange={(e) => setCityName(e.target.value)}
              disabled={running}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:bg-gray-50"
            />
          </label>
          <label className="block">
            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">
              authorityId
            </span>
            <input
              type="text"
              value={authorityId}
              onChange={(e) => setAuthorityId(e.target.value)}
              disabled={running}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:bg-gray-50"
              dir="ltr"
            />
          </label>
        </div>

        {/* BBox */}
        <div>
          <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">
            Bounding Box (degrees)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'South', value: south, setter: setSouth, key: 'south' },
              { label: 'West', value: west, setter: setWest, key: 'west' },
              { label: 'North', value: north, setter: setNorth, key: 'north' },
              { label: 'East', value: east, setter: setEast, key: 'east' },
            ].map(({ label, value, setter, key }) => (
              <label key={key} className="block">
                <span className="text-[11px] font-bold text-gray-500">{label}</span>
                <input
                  type="number"
                  step="0.0001"
                  value={value}
                  onChange={(e) => setter(Number(e.target.value))}
                  disabled={running}
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:bg-gray-50"
                  dir="ltr"
                />
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            שטח מוערך:{' '}
            <span className="font-bold text-gray-700">{bboxArea.toFixed(1)} קמ&quot;ר</span>
            {!bboxValid && (
              <span className="ms-2 text-red-600 font-bold">
                BBox לא תקין — south &lt; north, west &lt; east
              </span>
            )}
          </p>
        </div>

        {/* Min score + Dry-run */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="text-xs font-black text-gray-500 uppercase tracking-widest">
              ציון מינימלי (min-score)
            </span>
            <input
              type="number"
              min={0}
              max={10}
              step={0.5}
              value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              disabled={running}
              className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm font-mono text-gray-900 focus:outline-none focus:ring-2 focus:ring-cyan-400 disabled:bg-gray-50"
              dir="ltr"
            />
          </label>

          <div className="flex items-end">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={dryRun}
                onChange={(e) => setDryRun(e.target.checked)}
                disabled={running}
                className="w-5 h-5 rounded border-gray-300 text-cyan-500 focus:ring-cyan-400"
              />
              <div>
                <p className="text-sm font-black text-gray-900 flex items-center gap-1.5">
                  <Eye size={14} />
                  Dry Run
                </p>
                <p className="text-xs text-gray-500">
                  ללא כתיבה ל-Firestore (מומלץ לבדיקה ראשונית)
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* CTA */}
        <div className="pt-2 border-t border-gray-100">
          <button
            onClick={handleRun}
            disabled={
              running ||
              !bboxValid ||
              !cityName.trim() ||
              !authorityId.trim()
            }
            className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-black transition-colors"
          >
            {running ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                מריץ Import…
              </>
            ) : (
              <>
                <Play size={18} fill="currentColor" />
                הרץ Import
              </>
            )}
          </button>
          {!dryRun && (
            <p className="mt-2 text-xs text-amber-700 font-bold flex items-center gap-1.5">
              <AlertCircle size={14} />
              מצב Commit — ייכתבו מסמכים ל-Firestore (street_segments).
            </p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertCircle className="text-red-600 mt-0.5 shrink-0" size={20} />
          <div>
            <p className="font-black text-red-900">שגיאה בריצה:</p>
            <p className="text-sm font-mono text-red-800 mt-1 break-all">{error}</p>
          </div>
        </div>
      )}

      {/* Result */}
      {result && <ResultCard result={result} dryRun={dryRun} />}

      {/* Log */}
      {log.length > 0 && (
        <div className="bg-gray-950 rounded-2xl p-4 max-h-80 overflow-y-auto" dir="ltr">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
            Run log
          </h3>
          <div className="font-mono text-[11px] text-green-400 space-y-1">
            {log.map((line, i) => (
              <p key={i} className="whitespace-pre-wrap">
                {line}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Result card ───────────────────────────────────────────────────────────────

function ResultCard({ result, dryRun }: { result: ImportResult; dryRun: boolean }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <CheckCircle2 className="text-green-500" size={22} />
        <h2 className="text-lg font-black text-gray-900">תוצאות Import</h2>
        <span
          className={`ms-auto text-[11px] font-black px-2 py-0.5 rounded-full ${
            dryRun
              ? 'bg-amber-100 text-amber-800'
              : 'bg-green-100 text-green-800'
          }`}
        >
          {dryRun ? 'DRY RUN' : 'COMMITTED'}
        </span>
      </div>

      {/* Summary numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="OSM ways" value={result.fetchedFromOSM} />
        <Stat label="עברו סינון" value={result.passedScoreFilter} accent="cyan" />
        <Stat label="קצר/לא תקין" value={result.skippedTooShort} muted />
        <Stat label="ציון נמוך" value={result.skippedLowScore} muted />
      </div>

      {!dryRun && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
          <Database className="text-green-600" size={18} />
          <p className="text-sm font-bold text-green-900">
            נכתבו {result.committed} מסמכים לאוסף street_segments.
          </p>
        </div>
      )}

      {/* Histogram */}
      <div>
        <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2">
          התפלגות ציונים
        </h3>
        <Histogram histogram={result.histogram} total={result.passedScoreFilter} />
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: number;
  accent?: 'cyan';
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-3 text-center ${
        accent === 'cyan'
          ? 'bg-cyan-50 border border-cyan-200'
          : muted
            ? 'bg-gray-50 border border-gray-200'
            : 'bg-white border border-gray-200'
      }`}
    >
      <p
        className={`text-2xl font-black ${
          accent === 'cyan'
            ? 'text-cyan-700'
            : muted
              ? 'text-gray-500'
              : 'text-gray-900'
        }`}
      >
        {value.toLocaleString('he-IL')}
      </p>
      <p className="text-[11px] font-bold text-gray-500 mt-1">{label}</p>
    </div>
  );
}

function Histogram({
  histogram,
  total,
}: {
  histogram: ScoreHistogram;
  total: number;
}) {
  const buckets: Array<{ label: string; value: number; color: string }> = [
    { label: '3–4', value: histogram.bucket3to4, color: 'bg-gray-400' },
    { label: '5–6', value: histogram.bucket5to6, color: 'bg-amber-400' },
    { label: '7–8', value: histogram.bucket7to8, color: 'bg-cyan-500' },
    { label: '9–10', value: histogram.bucket9to10, color: 'bg-green-500' },
  ];
  const max = Math.max(1, ...buckets.map((b) => b.value));

  return (
    <div className="space-y-2">
      {buckets.map((b) => {
        const widthPct = (b.value / max) * 100;
        const sharePct = total > 0 ? (b.value / total) * 100 : 0;
        return (
          <div key={b.label} className="flex items-center gap-3">
            <span className="w-12 text-xs font-bold text-gray-700 font-mono" dir="ltr">
              {b.label}
            </span>
            <div className="flex-1 h-6 bg-gray-100 rounded-md overflow-hidden">
              <div
                className={`h-full ${b.color} transition-all duration-500`}
                style={{ width: `${widthPct}%` }}
              />
            </div>
            <span className="w-24 text-xs font-mono text-gray-600 text-end" dir="ltr">
              {b.value.toLocaleString('he-IL')} ({sharePct.toFixed(1)}%)
            </span>
          </div>
        );
      })}
    </div>
  );
}
