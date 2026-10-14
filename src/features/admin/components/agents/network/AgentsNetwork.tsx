'use client';

/**
 * Agents network — the /admin/agents overview drawn as a node graph
 * (React Flow, @xyflow/react v12). Loaded lazily by the page (next/dynamic,
 * ssr:false), so the library never reaches any other admin bundle.
 *
 * Pure presentation: it receives data the page already fetched through the
 * root-only /api/admin/agents routes and reports clicks back up. No fetch,
 * no Firestore, no tokens here.
 *
 * Accessibility: the canvas is not interactive (no drag/select/zoom/pan),
 * React Flow's own node focus is off, and every node renders ONE real
 * <button> with an aria-label — so keyboard users tab through the nodes in
 * order (commander → agents → future → add) and activate with Enter/Space.
 * Motion (pulsing ring, flowing edges) is skipped under
 * prefers-reduced-motion.
 */
import '@xyflow/react/dist/base.css';
import { useEffect, useMemo, useState } from 'react';
import {
  BaseEdge,
  Handle,
  Position,
  ReactFlow,
  getStraightPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import { AGENT_REGISTRY, FUTURE_AGENTS, agentLabel } from '@/features/admin/agents/agent-registry';
import { agentNodeStatus, ringPositions, type AgentNodeStatus, type NetworkSummary } from '@/features/admin/agents/agents-network.logic';
import type { AgentOverview } from '@/features/admin/agents/agent-findings.types';

// ── Brand tokens (OUT, light mode) ───────────────────────────────────────────
const BRAND_FROM = '#00baf7';
const BRAND_TO = '#0cf2e3';
const BRAND_GRADIENT = `linear-gradient(135deg, ${BRAND_FROM}, ${BRAND_TO})`;
const ON_GRADIENT = '#04222b'; // text on the gradient — never white
const BRAND_TEXT = '#007399'; // brand text on white
const STATUS_ACTIVE = '#10b981';
const STATUS_PENDING = '#cbd5e1';
const CRITICAL = '#ef4444';
const SHADOW = '0 10px 30px rgba(91, 194, 242, 0.25)';

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return reduced;
}

/** Invisible, centered connection point (nodes use nodeOrigin [0.5,0.5]). */
function CenterHandle({ type }: { type: 'source' | 'target' }) {
  return (
    <Handle
      type={type}
      position={Position.Top}
      isConnectable={false}
      style={{ top: '50%', left: '50%', width: 1, height: 1, minWidth: 0, minHeight: 0, opacity: 0, border: 0, transform: 'translate(-50%, -50%)' }}
    />
  );
}

// ── Node data types ──────────────────────────────────────────────────────────
type CommanderData = { summary: NetworkSummary; reducedMotion: boolean; onActivate: () => void };
type AgentData = {
  agentId: string;
  displayName: string;
  role: string;
  monogram: string;
  accent: string;
  status: AgentNodeStatus;
  unread: number;
  onActivate: (agentId: string) => void;
};
type GhostData = { displayName: string; role: string; monogram: string; onActivate: (label: string) => void };
type AddData = { onActivate: (label: string) => void };

type CommanderNode = Node<CommanderData, 'commander'>;
type AgentNodeT = Node<AgentData, 'agent'>;
type GhostNodeT = Node<GhostData, 'ghost'>;
type AddNodeT = Node<AddData, 'add'>;
type NetworkNode = CommanderNode | AgentNodeT | GhostNodeT | AddNodeT;

const LABEL_CLASS = 'pointer-events-none absolute top-full left-1/2 mt-2 w-44 -translate-x-1/2 text-center leading-tight';

// ── Nodes ────────────────────────────────────────────────────────────────────
function CommanderNodeView({ data }: NodeProps<CommanderNode>) {
  const { summary, reducedMotion, onActivate } = data;
  const critical = summary.critical === null ? 'לא ידוע' : String(summary.critical);
  return (
    <div className="relative" dir="rtl">
      <CenterHandle type="source" />
      {!reducedMotion && (
        <span
          aria-hidden="true"
          className="absolute inset-0 rounded-full animate-ping"
          style={{ background: BRAND_GRADIENT, opacity: 0.25 }}
        />
      )}
      <button
        type="button"
        onClick={onActivate}
        aria-label={`מפקד הרשת: ${summary.agentCount} סוכנים, ${summary.openFindings} ממצאים פתוחים, ${critical} קריטיים. לחץ לרענון.`}
        className="relative flex h-44 w-44 flex-col items-center justify-center rounded-full font-sans focus:outline-none focus-visible:ring-4 focus-visible:ring-offset-2"
        style={{ background: BRAND_GRADIENT, color: ON_GRADIENT, boxShadow: SHADOW, ['--tw-ring-color' as string]: BRAND_TEXT }}
      >
        <span className="text-xs font-bold">מפקד</span>
        <span className="text-4xl font-black leading-none mt-1">{summary.openFindings}</span>
        <span className="text-xs font-bold">ממצאים פתוחים</span>
        <span className="mt-2 flex items-center gap-1.5 text-xs font-bold">
          <span>{summary.agentCount} סוכנים</span>
          <span aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full" style={{ background: CRITICAL }} />
            {critical} קריטיים
          </span>
        </span>
      </button>
    </div>
  );
}

function AgentNodeView({ data }: NodeProps<AgentNodeT>) {
  const statusLabel = data.status === 'active' ? 'פעיל' : 'ממתין';
  return (
    <div className="relative" dir="rtl">
      <CenterHandle type="target" />
      <button
        type="button"
        onClick={() => data.onActivate(data.agentId)}
        aria-label={`${agentLabel(data)}. סטטוס: ${statusLabel}. ${data.unread} ממצאים לא נקראו. לחץ לפתיחת הממצאים.`}
        className="relative block rounded-full p-[3px] focus:outline-none focus-visible:ring-4 focus-visible:ring-offset-2"
        style={{ background: `linear-gradient(135deg, ${data.accent}, ${BRAND_TO})`, boxShadow: SHADOW, ['--tw-ring-color' as string]: BRAND_TEXT }}
      >
        <span className="flex h-28 w-28 items-center justify-center rounded-full bg-white font-sans text-4xl font-black" style={{ color: BRAND_TEXT }}>
          {data.monogram}
        </span>
        {/* Status dot — the dark outline keeps it visible on white even for the light "pending" grey. */}
        <span
          aria-hidden="true"
          className="absolute bottom-2 left-2 h-4 w-4 rounded-full border-2 border-white"
          style={{ background: data.status === 'active' ? STATUS_ACTIVE : STATUS_PENDING, outline: '1px solid #64748b' }}
        />
        {data.unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 min-w-[1.75rem] rounded-full border-2 border-white px-1.5 py-0.5 text-center font-sans text-xs font-black text-white"
            style={{ background: '#dc2626' }}
          >
            {data.unread}
          </span>
        )}
      </button>
      <div className={LABEL_CLASS}>
        <p className="font-sans text-sm font-black text-slate-900">{data.displayName}</p>
        <p className="font-sans text-xs text-slate-600">{data.role}</p>
        <p className="font-sans text-[11px] font-bold" style={{ color: data.status === 'active' ? '#047857' : '#475569' }}>
          {statusLabel}
        </p>
      </div>
    </div>
  );
}

function GhostNodeView({ data }: NodeProps<GhostNodeT>) {
  return (
    <div className="relative" dir="rtl">
      <CenterHandle type="target" />
      <button
        type="button"
        onClick={() => data.onActivate(data.displayName)}
        aria-label={`${data.displayName} — ${data.role}. סוכן עתידי, בקרוב.`}
        className="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed bg-white/70 font-sans text-3xl font-black text-slate-500 focus:outline-none focus-visible:ring-4 focus-visible:ring-offset-2"
        style={{ borderColor: STATUS_PENDING, ['--tw-ring-color' as string]: BRAND_TEXT }}
      >
        {data.monogram}
      </button>
      <div className={LABEL_CLASS}>
        <p className="font-sans text-sm font-bold text-slate-600">{data.displayName}</p>
        <p className="font-sans text-xs text-slate-600">{data.role} · בקרוב</p>
      </div>
    </div>
  );
}

function AddNodeView({ data }: NodeProps<AddNodeT>) {
  return (
    <div className="relative" dir="rtl">
      <CenterHandle type="target" />
      <button
        type="button"
        onClick={() => data.onActivate('הוספת סוכן')}
        aria-label="הוסף סוכן — בקרוב"
        className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-dashed bg-white/70 focus:outline-none focus-visible:ring-4 focus-visible:ring-offset-2"
        style={{ borderColor: STATUS_PENDING, color: BRAND_TEXT, ['--tw-ring-color' as string]: BRAND_TEXT }}
      >
        <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
      <div className={LABEL_CLASS}>
        <p className="font-sans text-xs font-bold text-slate-600">הוסף סוכן</p>
      </div>
    </div>
  );
}

// ── Edge ─────────────────────────────────────────────────────────────────────
type LinkEdge = Edge<{ live: boolean; reducedMotion: boolean }, 'link'>;

function LinkEdgeView({ id, sourceX, sourceY, targetX, targetY, data }: EdgeProps<LinkEdge>) {
  const [path] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  if (!data?.live) {
    return <BaseEdge id={id} path={path} style={{ stroke: STATUS_PENDING, strokeWidth: 2, strokeDasharray: '4 6' }} />;
  }
  const gradId = `agents-link-${id}`;
  return (
    <>
      <defs>
        <linearGradient id={gradId} gradientUnits="userSpaceOnUse" x1={sourceX} y1={sourceY} x2={targetX} y2={targetY}>
          <stop offset="0%" stopColor={BRAND_FROM} />
          <stop offset="100%" stopColor={BRAND_TO} />
        </linearGradient>
      </defs>
      <path d={path} fill="none" stroke={`url(#${gradId})`} strokeWidth={3} strokeLinecap="round" strokeDasharray="10 8">
        {!data.reducedMotion && (
          <animate attributeName="stroke-dashoffset" from="36" to="0" dur="1.2s" repeatCount="indefinite" />
        )}
      </path>
    </>
  );
}

const nodeTypes = { commander: CommanderNodeView, agent: AgentNodeView, ghost: GhostNodeView, add: AddNodeView };
const edgeTypes = { link: LinkEdgeView };

// ── Graph ────────────────────────────────────────────────────────────────────
export interface AgentsNetworkProps {
  agents: AgentOverview[];
  summary: NetworkSummary;
  onSelectAgent: (agentId: string) => void;
  onComingSoon: (label: string) => void;
  onRefresh: () => void;
}

export default function AgentsNetwork({ agents, summary, onSelectAgent, onComingSoon, onRefresh }: AgentsNetworkProps) {
  const reducedMotion = usePrefersReducedMotion();

  const { nodes, edges } = useMemo(() => {
    const now = Date.now();
    const satellites = AGENT_REGISTRY.length + FUTURE_AGENTS.length + 1;
    const pos = ringPositions(satellites);
    const n: NetworkNode[] = [
      { id: 'commander', type: 'commander', position: { x: 0, y: 0 }, data: { summary, reducedMotion, onActivate: onRefresh } },
    ];
    const e: LinkEdge[] = [];
    let i = 0;
    for (const def of AGENT_REGISTRY) {
      const ov = agents.find((a) => a.agentId === def.id);
      const status = agentNodeStatus(ov, now);
      const id = `agent-${def.id}`;
      n.push({
        id, type: 'agent', position: pos[i++],
        data: {
          agentId: def.id, displayName: def.displayName, role: def.role, monogram: def.monogram, accent: def.accent,
          status, unread: ov?.unreadCount ?? 0, onActivate: onSelectAgent,
        },
      });
      e.push({ id: `e-${id}`, source: 'commander', target: id, type: 'link', data: { live: status === 'active', reducedMotion } });
    }
    for (const ghost of FUTURE_AGENTS) {
      const id = `ghost-${ghost.key}`;
      n.push({ id, type: 'ghost', position: pos[i++], data: { displayName: ghost.displayName, role: ghost.role, monogram: ghost.monogram, onActivate: onComingSoon } });
      e.push({ id: `e-${id}`, source: 'commander', target: id, type: 'link', data: { live: false, reducedMotion } });
    }
    n.push({ id: 'add', type: 'add', position: pos[i++], data: { onActivate: onComingSoon } });
    e.push({ id: 'e-add', source: 'commander', target: 'add', type: 'link', data: { live: false, reducedMotion } });
    return { nodes: n, edges: e };
  }, [agents, summary, reducedMotion, onSelectAgent, onComingSoon, onRefresh]);

  return (
    <div
      dir="ltr"
      className="h-[480px] w-full overflow-hidden rounded-[20px] border border-slate-200 sm:h-[540px]"
      style={{ background: '#f8fafc', boxShadow: '0 4px 20px rgba(91, 194, 242, 0.12)' }}
      role="group"
      aria-label="רשת הסוכנים"
    >
      <ReactFlow<NetworkNode, LinkEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodeOrigin={[0.5, 0.5]}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={1.2}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        panOnDrag={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        preventScrolling={false}
        disableKeyboardA11y
      />
    </div>
  );
}
