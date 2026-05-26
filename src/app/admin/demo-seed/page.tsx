'use client';

export const dynamic = 'force-dynamic';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FlaskConical,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
  MapPin,
} from 'lucide-react';
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import {
  cleanSderotMockData,
  runSderotDemoSeed,
  type ProgressUpdate,
  type StepName,
} from '@/features/admin/services/demo-seed-sderot';

// ── Types ─────────────────────────────────────────────────────────────────────

type RunPhase      = 'idle' | 'running' | 'done' | 'error';
type SegmentTab    = 'active' | 'city' | 'school' | 'military' | 'all';
type GatingMode    = 'soft_launch' | 'hard_gate';
type GatingSaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Structural segment of an authority, inferred from name/type heuristics. */
type AuthoritySegment = 'city' | 'school' | 'military';

interface AuthorityTarget {
  id: string;
  name: string;
  isActiveClient: boolean;
  segment: AuthoritySegment;
  /** Fetched from Firestore; falls back to 'hard_gate' if missing. */
  gatingMode: GatingMode;
}

interface StepRow {
  id: StepName;
  label: string;
  status: 'pending' | 'running' | 'done' | 'error';
  message: string;
  count: number | null;
}

interface CityResult {
  label: string;
  success: boolean;
  counts?: Record<string, number>;
  deleted?: Record<string, number>;
  error?: string;
}

// ── Segment classification heuristics ────────────────────────────────────────

const MILITARY_RE =
  /גדוד|חטיבה|פלוגה|צוות.?קרבי|בסיס.?צבאי|חיל\s|מג"ב|גבעתי|גולני|נח"ל|מגלן|קומנדו|שייטת|יחידה\s\d|תעש|להב\s|ימ"מ|בני.?חיל|שד"מ|מפקדה|brigade|battalion|idf|military/i;

const SCHOOL_RE =
  /בית.?ספר|ביה"ס|אוניברסיטה|מכללה|תיכון|יסודי|גן.?ילדים|אקדמי|ישיבה|סמינר|מדרשה|אולפן|school|university|college|academy|education/i;

function classifySegment(name: string, rawType?: string): AuthoritySegment {
  const t = (rawType ?? '').toLowerCase();
  if (t === 'military' || MILITARY_RE.test(name))                 return 'military';
  if (t === 'school' || t === 'education' || SCHOOL_RE.test(name)) return 'school';
  return 'city';
}

// ── Step labels ───────────────────────────────────────────────────────────────

const STEP_DEFINITIONS: ReadonlyArray<{ id: StepName; label: string }> = [
  { id: 'cleanup',               label: '1. ניקוי דאטה ישנה' },
  { id: 'users',                 label: '2. יצירת 10 משתמשים [דמו]' },
  { id: 'workouts',              label: '3. יצירת היסטוריית אימונים' },
  { id: 'presence',              label: '4. נוכחות חיה' },
  { id: 'active_workouts',       label: '5. אימונים פעילים' },
  { id: 'sessions',              label: '6. ביקורים בפארקים' },
  { id: 'feed_posts',            label: '7. פוסטים לפיד' },
  { id: 'community_groups',      label: '8. עדכון קבוצות קהילה' },
  { id: 'manager_notifications', label: '9. התראות מנהל' },
  { id: 'route_analytics',       label: '10. עדכון נתוני מסלולים' },
];

const COLLECTION_LABELS: Record<string, string> = {
  cleanup_legacy:             'דאטה ישנה (נמחקה)',
  users:                      'users',
  workouts:                   'workouts',
  presence:                   'presence',
  active_workouts:            'active_workouts',
  sessions:                   'sessions',
  feed_posts:                 'feed_posts',
  community_groups:           'community_groups',
  manager_notifications:      'manager_notifications',
  route_analytics:            'official_routes (מסלולים)',
  route_analytics_reset:      'official_routes (איפוס analytics)',
  authority_userCount_reset:  'authorities (איפוס userCount)',
};

function buildInitialSteps(): StepRow[] {
  return STEP_DEFINITIONS.map((d) => ({
    id: d.id,
    label: d.label,
    status: 'pending' as const,
    message: '',
    count: null,
  }));
}

// ── Tab definitions ───────────────────────────────────────────────────────────

interface TabDef {
  id: SegmentTab;
  emoji: string;
  label: string;
  color: string;
  activeColor: string;
}

const TAB_DEFS: TabDef[] = [
  { id: 'active',   emoji: '🟢', label: 'לקוחות פעילים',        color: 'text-green-700',   activeColor: 'bg-green-600 text-white'   },
  { id: 'city',     emoji: '🏙️', label: 'ערים ושכונות',         color: 'text-blue-700',    activeColor: 'bg-blue-600 text-white'    },
  { id: 'school',   emoji: '🏫', label: 'בתי ספר וחינוך',       color: 'text-amber-700',   activeColor: 'bg-amber-500 text-white'   },
  { id: 'military', emoji: '🪖', label: 'צה״ל וכוחות ביטחון',  color: 'text-slate-700',   activeColor: 'bg-slate-700 text-white'   },
  { id: 'all',      emoji: '🌐', label: 'הצג הכל',              color: 'text-fuchsia-700', activeColor: 'bg-fuchsia-600 text-white' },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function DemoSeedPage() {

  // ── All authorities from Firestore ────────────────────────────────────────
  const [authorities, setAuthorities] = useState<AuthorityTarget[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // ── Selection state: only pre-checked IDs; starts as only active clients ──
  const [selectedAuthorityIds, setSelectedAuthorityIds] = useState<string[]>([]);

  // ── Active segment tab ────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<SegmentTab>('active');

  // ── Live gating mode per authority (optimistically updated on save) ───────
  const [gatingModes, setGatingModes] = useState<Record<string, GatingMode>>({});
  // Per-authority save state for transient feedback: 'idle'|'saving'|'saved'|'error'
  const [gatingSaveStates, setGatingSaveStates] = useState<Record<string, GatingSaveState>>({});

  const fetchAuthorities = useCallback(async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      const snap = await getDocs(
        query(collection(db, 'authorities'), orderBy('name', 'asc')),
      );
      const results: AuthorityTarget[] = snap.docs
        .filter(
          (d) =>
            !d.id.includes('__SCHEMA_INIT__') &&
            d.data()?.name !== '__SCHEMA_INIT__',
        )
        .map((d) => {
          const rawMode = d.data()?.gatingMode as string | undefined;
          const gatingMode: GatingMode =
            rawMode === 'soft_launch' ? 'soft_launch' : 'hard_gate';
          return {
            id: d.id,
            name: d.data().name as string,
            isActiveClient: d.data()?.isActiveClient === true,
            segment: classifySegment(
              d.data().name as string,
              d.data()?.type as string | undefined,
            ),
            gatingMode,
          };
        });
      setAuthorities(results);
      // Seed the mutable gating mode map from fetched values.
      setGatingModes(
        Object.fromEntries(results.map((a) => [a.id, a.gatingMode])),
      );
      // Safety default: only pre-select live-deployment accounts to prevent
      // accidental writes to all 362 entries on first load.
      setSelectedAuthorityIds(results.filter((a) => a.isActiveClient).map((a) => a.id));
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'שגיאה בטעינת רשויות');
    } finally {
      setAuthLoading(false);
    }
  }, []);

  useEffect(() => { fetchAuthorities(); }, [fetchAuthorities]);

  // ── Derived: pool visible under the active tab ────────────────────────────
  const tabPool = useMemo<AuthorityTarget[]>(() => {
    switch (activeTab) {
      case 'active':   return authorities.filter((a) => a.isActiveClient);
      case 'city':     return authorities.filter((a) => a.segment === 'city');
      case 'school':   return authorities.filter((a) => a.segment === 'school');
      case 'military': return authorities.filter((a) => a.segment === 'military');
      case 'all':      return authorities;
    }
  }, [activeTab, authorities]);

  const tabPoolIds = useMemo(() => tabPool.map((a) => a.id), [tabPool]);

  // Per-tab totals for tab bar badges
  const tabCounts = useMemo(() => ({
    active:   authorities.filter((a) => a.isActiveClient).length,
    city:     authorities.filter((a) => a.segment === 'city').length,
    school:   authorities.filter((a) => a.segment === 'school').length,
    military: authorities.filter((a) => a.segment === 'military').length,
    all:      authorities.length,
  }), [authorities]);

  // Per-tab selected counts for tab bar secondary badges
  const tabSelectedCounts = useMemo(() => {
    const sel = new Set(selectedAuthorityIds);
    return {
      active:   authorities.filter((a) => a.isActiveClient && sel.has(a.id)).length,
      city:     authorities.filter((a) => a.segment === 'city' && sel.has(a.id)).length,
      school:   authorities.filter((a) => a.segment === 'school' && sel.has(a.id)).length,
      military: authorities.filter((a) => a.segment === 'military' && sel.has(a.id)).length,
      all:      sel.size,
    };
  }, [authorities, selectedAuthorityIds]);

  // ── Master checkbox — scoped strictly to visible tabPool ──────────────────
  const allTabSelected  = tabPool.length > 0 && tabPoolIds.every((id) => selectedAuthorityIds.includes(id));
  const someTabSelected = tabPoolIds.some((id) => selectedAuthorityIds.includes(id)) && !allTabSelected;

  const masterCheckRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (masterCheckRef.current) {
      masterCheckRef.current.indeterminate = someTabSelected;
    }
  }, [someTabSelected]);

  const handleMasterToggle = useCallback(() => {
    if (allTabSelected) {
      setSelectedAuthorityIds((prev) => prev.filter((id) => !tabPoolIds.includes(id)));
    } else {
      setSelectedAuthorityIds((prev) => Array.from(new Set([...prev, ...tabPoolIds])));
    }
  }, [allTabSelected, tabPoolIds]);

  const handleToggleAuthority = useCallback((id: string) => {
    setSelectedAuthorityIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }, []);

  // ── Gating mode live sync to Firestore ────────────────────────────────────
  const handleGatingModeChange = useCallback(
    async (authorityId: string, newMode: GatingMode) => {
      // Optimistic UI update
      setGatingModes((prev) => ({ ...prev, [authorityId]: newMode }));
      setGatingSaveStates((prev) => ({ ...prev, [authorityId]: 'saving' }));
      try {
        await updateDoc(doc(db, 'authorities', authorityId), {
          gatingMode: newMode,
          updatedAt: serverTimestamp(),
        });
        setGatingSaveStates((prev) => ({ ...prev, [authorityId]: 'saved' }));
        // Clear the success pulse after 2 s
        setTimeout(() => {
          setGatingSaveStates((prev) => ({ ...prev, [authorityId]: 'idle' }));
        }, 2000);
      } catch {
        // Roll back optimistic update on failure
        setGatingModes((prev) => {
          const rolled = { ...prev };
          const original = authorities.find((a) => a.id === authorityId)?.gatingMode ?? 'hard_gate';
          rolled[authorityId] = original;
          return rolled;
        });
        setGatingSaveStates((prev) => ({ ...prev, [authorityId]: 'error' }));
        setTimeout(() => {
          setGatingSaveStates((prev) => ({ ...prev, [authorityId]: 'idle' }));
        }, 3000);
      }
    },
    [authorities],
  );

  // ── Run state ────────────────────────────────────────────────────────────
  const [seedPhase, setSeedPhase] = useState<RunPhase>('idle');
  const [cleanPhase, setCleanPhase] = useState<RunPhase>('idle');

  const [steps, setSteps] = useState<StepRow[]>(buildInitialSteps);
  const [currentCityLabel, setCurrentCityLabel] = useState<string | null>(null);
  const [cityResults, setCityResults] = useState<CityResult[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const onProgress = useCallback((update: ProgressUpdate) => {
    setSteps((prev) =>
      prev.map((s) =>
        s.id === update.step
          ? { ...s, status: update.status, message: update.message, count: update.count ?? s.count }
          : s,
      ),
    );
  }, []);

  // Ordered list of authorities to process — intersection of selection + Firestore order.
  const selectedAuthorities = useMemo(
    () => authorities.filter((a) => selectedAuthorityIds.includes(a.id)),
    [authorities, selectedAuthorityIds],
  );

  const isRunning = seedPhase === 'running' || cleanPhase === 'running';

  // ── Seed selected authorities sequentially ────────────────────────────────
  const handleSeed = useCallback(async () => {
    if (selectedAuthorities.length === 0) return;
    setSeedPhase('running');
    setCityResults([]);
    setErrorMsg('');

    const allErrors: string[] = [];

    for (const auth of selectedAuthorities) {
      setCurrentCityLabel(auth.name);
      setSteps(buildInitialSteps());

      try {
        const result = await runSderotDemoSeed(onProgress, auth.id);
        setCityResults((prev) => [
          ...prev,
          { label: auth.name, success: result.success, counts: result.counts },
        ]);
        if (!result.success) {
          allErrors.push(`[${auth.name}] ${result.errors.join(', ')}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        allErrors.push(`[${auth.name}] ${msg}`);
        setCityResults((prev) => [
          ...prev,
          { label: auth.name, success: false, error: msg },
        ]);
      }
    }

    setCurrentCityLabel(null);
    setSeedPhase(allErrors.length === 0 ? 'done' : 'error');
    if (allErrors.length > 0) setErrorMsg(allErrors.join('\n'));
  }, [selectedAuthorities, onProgress]);

  // ── Clean selected authorities sequentially ───────────────────────────────
  const handleClean = useCallback(async () => {
    if (selectedAuthorities.length === 0) return;
    const cityNames = selectedAuthorities.map((a) => a.name).join(', ');
    if (!confirm(`האם למחוק את כל נתוני הדמו מהרשויות הנבחרות?\n(${cityNames})`)) return;

    setCleanPhase('running');
    setCityResults([]);
    setErrorMsg('');

    const allErrors: string[] = [];

    for (const auth of selectedAuthorities) {
      setCurrentCityLabel(auth.name);
      setSteps(buildInitialSteps());

      try {
        const result = await cleanSderotMockData(onProgress, auth.id);
        setCityResults((prev) => [
          ...prev,
          { label: auth.name, success: result.success, deleted: result.deleted },
        ]);
        if (!result.success) {
          allErrors.push(`[${auth.name}] ${result.errors.join(', ')}`);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        allErrors.push(`[${auth.name}] ${msg}`);
        setCityResults((prev) => [
          ...prev,
          { label: auth.name, success: false, error: msg },
        ]);
      }
    }

    setCurrentCityLabel(null);
    setCleanPhase(allErrors.length === 0 ? 'done' : 'error');
    if (allErrors.length > 0) setErrorMsg(allErrors.join('\n'));
  }, [selectedAuthorities, onProgress]);

  const totalSeeded = useMemo(
    () =>
      cityResults
        .flatMap((r) => Object.entries(r.counts ?? {}))
        .filter(([k]) => k !== 'cleanup_legacy')
        .reduce((sum, [, n]) => sum + n, 0),
    [cityResults],
  );

  const totalDeleted = useMemo(
    () =>
      cityResults
        .flatMap((r) => Object.entries(r.deleted ?? {}))
        .reduce((sum, [, n]) => sum + n, 0),
    [cityResults],
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6 py-8" dir="rtl">

      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <FlaskConical className="text-fuchsia-500" size={28} />
          <h1 className="text-2xl font-black text-gray-900">כלי דמו — בחירת רשויות</h1>
        </div>
        <p className="text-gray-500 text-sm leading-relaxed">
          בחר רשויות מהרשימה ולחץ על &quot;הפעל דמו מלא&quot;. כל רשות תקבל{' '}
          <strong>10 משתמשי דמו</strong>{' '}
          <code className="text-xs bg-gray-100 px-1 rounded">[דמו]</code>{' '}
          עם{' '}
          <code className="text-xs bg-gray-100 px-1 rounded">isMockData: true</code>.{' '}
          ברירת המחדל בוחרת רק לקוחות פעילים — הגנה מפני הצפת כלל הרשויות במערכת.
        </p>
      </div>

      {/* Authority selection panel */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">

        {/* ── Segment tab bar ───────────────────────────────────────────────── */}
        <div className="bg-slate-100 border-b border-slate-200 overflow-x-auto">
          <div className="flex min-w-max">
            {TAB_DEFS.map((tab) => {
              const total    = tabCounts[tab.id];
              const selected = tabSelectedCounts[tab.id];
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  disabled={isRunning}
                  className={`
                    flex flex-col items-center gap-0.5 px-4 py-2.5 text-xs font-semibold
                    transition-all duration-150 border-b-2 disabled:opacity-50
                    ${isActive
                      ? 'border-fuchsia-500 bg-white text-fuchsia-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}
                  `}
                >
                  <span className="text-base leading-none">{tab.emoji}</span>
                  <span className="whitespace-nowrap">{tab.label}</span>
                  <span className="flex items-center gap-1 mt-0.5">
                    <span className={`font-mono ${isActive ? 'text-fuchsia-600' : 'text-slate-400'}`}>
                      {total}
                    </span>
                    {selected > 0 && (
                      <span className="bg-fuchsia-500 text-white rounded-full px-1.5 py-px text-[9px] font-bold leading-none">
                        ✓{selected}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Panel header: master toggle + refresh ────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 bg-white">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              ref={masterCheckRef}
              type="checkbox"
              checked={allTabSelected}
              onChange={handleMasterToggle}
              disabled={isRunning || authLoading || tabPool.length === 0}
              className="w-4 h-4 rounded accent-fuchsia-600 cursor-pointer disabled:cursor-not-allowed"
            />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              {allTabSelected
                ? `בטל בחירה (${tabPool.length})`
                : someTabSelected
                  ? `${tabPoolIds.filter((id) => selectedAuthorityIds.includes(id)).length} / ${tabPool.length} נבחרו — סמן הכל`
                  : `סמן הכל (${tabPool.length})`}
            </span>
          </label>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400 font-mono">
              {selectedAuthorityIds.length} נבחרו סה&quot;כ
            </span>
            <button
              onClick={fetchAuthorities}
              disabled={authLoading || isRunning}
              className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-40 transition-colors"
              aria-label="רענן רשויות"
            >
              <RefreshCw
                size={13}
                className={authLoading ? 'animate-spin text-fuchsia-500' : 'text-slate-400'}
              />
            </button>
          </div>
        </div>

        {/* ── Loading / error / empty states ───────────────────────────────── */}
        {authLoading && (
          <div className="flex items-center gap-2 text-sm text-slate-500 px-4 py-5">
            <Loader2 size={15} className="animate-spin" />
            טוען רשויות מ-Firestore…
          </div>
        )}

        {authError && (
          <div className="px-4 py-3">
            <p className="text-xs text-red-600 flex items-center gap-1.5">
              <AlertCircle size={13} />
              {authError}
            </p>
          </div>
        )}

        {!authLoading && !authError && tabPool.length === 0 && (
          <div className="px-4 py-4">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              {authorities.length === 0
                ? 'לא נמצאו רשויות ב-Firestore.'
                : 'אין רשויות בקטגוריה זו.'}
            </p>
          </div>
        )}

        {/* ── Checkbox rows — scoped to active tab ─────────────────────────── */}
        {!authLoading && tabPool.length > 0 && (
          <ul
            className="divide-y divide-slate-100 overflow-y-auto"
            style={{ maxHeight: '420px' }}
          >
            {tabPool.map((a) => {
              const checked   = selectedAuthorityIds.includes(a.id);
              const mode      = gatingModes[a.id] ?? 'hard_gate';
              const saveState = gatingSaveStates[a.id] ?? 'idle';
              return (
                <li key={a.id}>
                  {/* Outer div (not label) so the gating select click doesn't
                      accidentally toggle the checkbox. The checkbox label is
                      a separate inline element. */}
                  <div
                    className={`flex items-center gap-2 px-3 py-2 transition-colors ${
                      checked ? 'bg-fuchsia-50' : 'bg-white hover:bg-slate-50'
                    } ${isRunning ? 'opacity-60' : ''}`}
                  >
                    {/* Checkbox + icon + name — wrapped in its own label */}
                    <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleAuthority(a.id)}
                        disabled={isRunning}
                        className="w-4 h-4 rounded accent-fuchsia-600 cursor-pointer flex-shrink-0 disabled:cursor-not-allowed"
                      />

                      <MapPin
                        size={12}
                        className={checked ? 'text-fuchsia-500 flex-shrink-0' : 'text-slate-300 flex-shrink-0'}
                      />

                      <span className="min-w-0">
                        <span className={`text-xs font-semibold leading-tight block truncate ${checked ? 'text-slate-900' : 'text-slate-500'}`}>
                          {a.name}
                        </span>
                        <code className="text-[9px] text-slate-400 font-mono truncate block">
                          {a.id}
                        </code>
                      </span>
                    </label>

                    {/* Right-side badges + gating select */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {/* Segment + active badges */}
                      <span className={`text-[9px] font-medium px-1 py-px rounded border ${
                        a.segment === 'military'
                          ? 'bg-slate-100 text-slate-600 border-slate-200'
                          : a.segment === 'school'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-blue-50 text-blue-600 border-blue-100'
                      }`}>
                        {a.segment === 'military' ? '🪖' : a.segment === 'school' ? '🏫' : '🏙️'}
                      </span>

                      {a.isActiveClient && (
                        <span className="text-[9px] font-bold bg-green-100 text-green-700 border border-green-200 px-1 py-px rounded">
                          פעיל
                        </span>
                      )}

                      {/* ── Gating mode selector ─────────────────────────── */}
                      <div className="relative flex items-center gap-1">
                        <select
                          value={mode}
                          disabled={isRunning || saveState === 'saving'}
                          onChange={(e) => {
                            e.stopPropagation();
                            void handleGatingModeChange(a.id, e.target.value as GatingMode);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className={`
                            text-[10px] font-medium rounded border cursor-pointer
                            py-0.5 pl-1 pr-5 appearance-none bg-no-repeat
                            disabled:opacity-50 disabled:cursor-not-allowed
                            focus:outline-none focus:ring-1 focus:ring-fuchsia-400
                            transition-colors
                            ${mode === 'soft_launch'
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : 'bg-red-50 border-red-200 text-red-700'}
                          `}
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236B7280'/%3E%3C/svg%3E")`,
                            backgroundPosition: 'left 4px center',
                          }}
                          dir="ltr"
                          aria-label={`gating mode for ${a.name}`}
                        >
                          <option value="soft_launch">🟢 Soft Launch</option>
                          <option value="hard_gate">🔒 Hard Gate</option>
                        </select>

                        {/* Save-state pulse indicator */}
                        {saveState === 'saving' && (
                          <Loader2 size={11} className="animate-spin text-fuchsia-500 flex-shrink-0" />
                        )}
                        {saveState === 'saved' && (
                          <CheckCircle2 size={11} className="text-emerald-500 flex-shrink-0" />
                        )}
                        {saveState === 'error' && (
                          <AlertCircle size={11} className="text-red-500 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Warning */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>שים לב:</strong> כל הרצה מנקה אוטומטית דאטה ישנה (
        <code dir="ltr">sderot-demo-user-*</code>, <code dir="ltr">mock_lemur_*</code>,{' '}
        <code dir="ltr">sderot-mock-*</code>) <strong>בכל רשות נבחרת</strong> לפני יצירת
        הדאטה החדשה. הרצה חוזרת בטוחה.
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleSeed}
          disabled={isRunning || authLoading || selectedAuthorityIds.length === 0}
          className="flex items-center gap-2 px-6 py-3 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all"
        >
          {seedPhase === 'running'
            ? <Loader2 size={18} className="animate-spin" />
            : <Play size={18} />}
          הפעל דמו מלא — {selectedAuthorityIds.length} רשויות
        </button>

        <button
          onClick={handleClean}
          disabled={isRunning || authLoading || selectedAuthorityIds.length === 0}
          className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all"
        >
          {cleanPhase === 'running'
            ? <Loader2 size={18} className="animate-spin" />
            : <Trash2 size={18} />}
          נקה מוק דאטה — {selectedAuthorityIds.length} רשויות
        </button>
      </div>

      {/* Active-city live progress */}
      {isRunning && currentCityLabel && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-bold text-fuchsia-700">
            <Loader2 size={15} className="animate-spin" />
            מעבד: {currentCityLabel}
            <span className="font-normal text-slate-400 text-xs">
              ({cityResults.length + 1} / {selectedAuthorityIds.length})
            </span>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
            {steps.map((s) => (
              <StepIndicator key={s.id} row={s} />
            ))}
          </div>
        </div>
      )}

      {/* Per-city accumulated results */}
      {cityResults.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            תוצאות לפי רשות ({cityResults.length} / {selectedAuthorityIds.length})
          </p>
          {cityResults.map((r) => (
            <div
              key={r.label}
              className={`rounded-xl border p-4 ${
                r.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-2">
                {r.success
                  ? <CheckCircle2 size={16} className="text-green-600" />
                  : <AlertCircle size={16} className="text-red-600" />}
                <span className={`font-bold text-sm ${r.success ? 'text-green-800' : 'text-red-800'}`}>
                  {r.label}
                </span>
                {!r.success && r.error && (
                  <span className="text-xs text-red-600 font-mono">{r.error}</span>
                )}
              </div>
              {r.counts  && <ResultTable counts={r.counts} />}
              {r.deleted && <ResultTable counts={r.deleted} />}
            </div>
          ))}
        </div>
      )}

      {/* Grand totals */}
      {(seedPhase === 'done' || seedPhase === 'error') && totalSeeded > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-green-700 font-bold text-base">
            <CheckCircle2 size={20} />
            סה&quot;כ {totalSeeded.toLocaleString('he-IL')} מסמכים נוצרו ב-{cityResults.length} רשויות
          </div>
        </div>
      )}
      {(cleanPhase === 'done' || cleanPhase === 'error') && totalDeleted > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-2 text-blue-700 font-bold text-base">
            <CheckCircle2 size={20} />
            סה&quot;כ {totalDeleted.toLocaleString('he-IL')} מסמכים נמחקו מ-{cityResults.length} רשויות
          </div>
        </div>
      )}

      {/* Error display */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-2 text-red-700">
          <AlertCircle size={20} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-bold">שגיאות:</p>
            <pre className="text-xs font-mono mt-1 whitespace-pre-wrap">{errorMsg}</pre>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StepIndicator({ row }: { row: StepRow }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <StatusIcon status={row.status} />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-slate-900 text-sm">{row.label}</p>
        {row.message && <p className="text-xs text-slate-500 mt-0.5">{row.message}</p>}
      </div>
      {row.count !== null && row.status === 'done' && (
        <span className="text-xs font-mono bg-slate-100 text-slate-700 px-2 py-1 rounded">
          {row.count.toLocaleString('he-IL')}
        </span>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: StepRow['status'] }) {
  if (status === 'running') return <Loader2 size={18} className="text-fuchsia-500 animate-spin" />;
  if (status === 'done')    return <CheckCircle2 size={18} className="text-green-500" />;
  if (status === 'error')   return <AlertCircle size={18} className="text-red-500" />;
  return <div className="w-[18px] h-[18px] rounded-full border-2 border-slate-300" />;
}

function ResultTable({ counts }: { counts: Record<string, number> }) {
  const entries = Object.entries(counts);
  if (entries.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white mt-2">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wider">
          <tr>
            <th className="px-3 py-2 text-start">קולקציה</th>
            <th className="px-3 py-2 text-end">מסמכים</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map(([key, count]) => (
            <tr key={key}>
              <td className="px-3 py-2 text-slate-900">{COLLECTION_LABELS[key] ?? key}</td>
              <td className="px-3 py-2 text-end font-mono text-slate-700">
                {count.toLocaleString('he-IL')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
