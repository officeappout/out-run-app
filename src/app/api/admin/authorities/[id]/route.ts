import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { requireAdminApi } from '@/lib/api-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import type { PipelineStatus, ContactRole, TaskStatus } from '@/types/admin-types';

const COLLECTION = 'authorities';

// ─── Validation ──────────────────────────────────────────────────────────────

const VALID_PIPELINE_STATUSES: PipelineStatus[] = [
  'draft', 'lead', 'meeting', 'quote', 'follow_up', 'closing', 'active', 'upsell',
];
const VALID_CONTACT_ROLES: ContactRole[] = [
  'sports_head', 'ceo', 'health_coordinator', 'technical', 'other',
];
const VALID_TASK_STATUSES: TaskStatus[] = [
  'pending', 'in_progress', 'done', 'cancelled',
];

const BLOCKED_FIELDS = new Set([
  'name', 'type', 'vertical', 'hierarchyLevel', 'parentAuthorityId',
  'managerIds', 'coordinates', 'userCount', 'unitCount', 'isActiveClient',
  'gatingMode', 'kpiSettings', 'status', 'financials', 'logoUrl',
  'createdAt', 'updatedAt', 'id',
]);

const ALLOWED_PATCH_KEYS = new Set([
  'pipelineStatus', 'addActivity', 'addContact', 'updateContact', 'addTask', 'updateTask',
]);

const AGENT_ID = 'cali-agent';
const AGENT_NAME = 'Cali Agent';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getDoc(id: string) {
  const db = getAdminDb();
  const snap = await db.collection(COLLECTION).doc(id).get();
  if (!snap.exists) return null;
  return { id: snap.id, ...snap.data() } as Record<string, unknown>;
}

// ─── GET /api/admin/authorities/[id] ─────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  const doc = await getDoc(params.id);
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(doc);
}

// ─── PATCH /api/admin/authorities/[id] ───────────────────────────────────────
//
// Body (all optional — combine freely in one request):
//
//   pipelineStatus?: PipelineStatus
//   addActivity?:    { content: string }
//   addContact?:     { name, role, phone?, email?, isPrimary?, notes? }
//   updateContact?:  { id, name?, role?, phone?, email?, isPrimary?, notes? }
//   addTask?:        { title, description?, status?, dueDate?, assignedToName? }
//   updateTask?:     { id, title?, description?, status?, dueDate?, assignedToName? }

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const denied = await requireAdminApi(request);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Reject blocked or unknown top-level fields immediately
  const unknownKeys = Object.keys(body).filter(k => !ALLOWED_PATCH_KEYS.has(k));
  if (unknownKeys.length > 0) {
    const blocked = unknownKeys.filter(k => BLOCKED_FIELDS.has(k));
    return NextResponse.json(
      {
        error: blocked.length > 0
          ? `Field(s) not writable by agent: ${blocked.join(', ')}`
          : `Unknown field(s): ${unknownKeys.join(', ')}`,
      },
      { status: 400 }
    );
  }

  if (Object.keys(body).length === 0) {
    return NextResponse.json({ error: 'Empty body — nothing to update' }, { status: 400 });
  }

  const db = getAdminDb();
  const docRef = db.collection(COLLECTION).doc(params.id);
  const existing = await docRef.get();
  if (!existing.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const data = existing.data() as Record<string, unknown>;
  const applied: string[] = [];
  const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };

  // 1. pipelineStatus — direct field update
  if (body.pipelineStatus !== undefined) {
    const s = body.pipelineStatus as string;
    if (!VALID_PIPELINE_STATUSES.includes(s as PipelineStatus)) {
      return NextResponse.json(
        { error: `Invalid pipelineStatus "${s}". Valid: ${VALID_PIPELINE_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }
    updates.pipelineStatus = s;
    applied.push(`pipelineStatus → ${s}`);
  }

  // 2. addActivity — prepend to activityLog array (newest first)
  if (body.addActivity !== undefined) {
    const a = body.addActivity as Record<string, unknown>;
    if (!a.content || typeof a.content !== 'string' || !a.content.trim()) {
      return NextResponse.json(
        { error: 'addActivity.content must be a non-empty string' },
        { status: 400 }
      );
    }
    const newEntry = {
      id: crypto.randomUUID(),
      content: a.content.trim(),
      createdAt: new Date().toISOString(),
      createdBy: AGENT_ID,
      createdByName: AGENT_NAME,
    };
    const existing_log = (data.activityLog as unknown[]) ?? [];
    updates.activityLog = [newEntry, ...existing_log];
    applied.push('addActivity');
  }

  // 3. addContact — append to contacts array
  if (body.addContact !== undefined) {
    const c = body.addContact as Record<string, unknown>;
    if (!c.name || typeof c.name !== 'string') {
      return NextResponse.json({ error: 'addContact.name is required' }, { status: 400 });
    }
    if (!c.role || !VALID_CONTACT_ROLES.includes(c.role as ContactRole)) {
      return NextResponse.json(
        { error: `addContact.role required. Valid: ${VALID_CONTACT_ROLES.join(', ')}` },
        { status: 400 }
      );
    }
    const newContact: Record<string, unknown> = {
      id: crypto.randomUUID(),
      name: c.name,
      role: c.role,
      isPrimary: (c.isPrimary as boolean) ?? false,
      createdAt: new Date().toISOString(),
      ...(c.phone ? { phone: c.phone } : {}),
      ...(c.email ? { email: c.email } : {}),
      ...(c.notes ? { notes: c.notes } : {}),
    };
    let contacts = [...((data.contacts as unknown[]) ?? [])] as Record<string, unknown>[];
    // If new contact is primary, demote existing primaries
    if (newContact.isPrimary) contacts = contacts.map(ct => ({ ...ct, isPrimary: false }));
    contacts.push(newContact);
    updates.contacts = contacts;
    applied.push(`addContact → id:${newContact.id}`);
  }

  // 4. updateContact — merge by id
  if (body.updateContact !== undefined) {
    const c = body.updateContact as Record<string, unknown>;
    if (!c.id || typeof c.id !== 'string') {
      return NextResponse.json({ error: 'updateContact.id is required' }, { status: 400 });
    }
    if (c.role !== undefined && !VALID_CONTACT_ROLES.includes(c.role as ContactRole)) {
      return NextResponse.json(
        { error: `Invalid contact role "${c.role}". Valid: ${VALID_CONTACT_ROLES.join(', ')}` },
        { status: 400 }
      );
    }
    let contacts = [...((data.contacts as unknown[]) ?? [])] as Record<string, unknown>[];
    const idx = contacts.findIndex(ct => ct.id === c.id);
    if (idx === -1) {
      return NextResponse.json({ error: `Contact id "${c.id}" not found` }, { status: 404 });
    }
    const merged = { ...contacts[idx] };
    if (c.name !== undefined) merged.name = c.name;
    if (c.role !== undefined) merged.role = c.role;
    if (c.phone !== undefined) merged.phone = c.phone;
    if (c.email !== undefined) merged.email = c.email;
    if (c.isPrimary !== undefined) merged.isPrimary = c.isPrimary;
    if (c.notes !== undefined) merged.notes = c.notes;
    if (merged.isPrimary) contacts = contacts.map((ct, i) => i === idx ? ct : { ...ct, isPrimary: false });
    contacts[idx] = merged;
    updates.contacts = contacts;
    applied.push(`updateContact id:${c.id}`);
  }

  // 5. addTask — append to tasks array
  if (body.addTask !== undefined) {
    const t = body.addTask as Record<string, unknown>;
    if (!t.title || typeof t.title !== 'string') {
      return NextResponse.json({ error: 'addTask.title is required' }, { status: 400 });
    }
    const status: TaskStatus = VALID_TASK_STATUSES.includes(t.status as TaskStatus)
      ? (t.status as TaskStatus)
      : 'pending';
    const newTask: Record<string, unknown> = {
      id: crypto.randomUUID(),
      title: t.title,
      status,
      createdAt: new Date().toISOString(),
      ...(t.description ? { description: t.description } : {}),
      ...(t.dueDate ? { dueDate: t.dueDate } : {}),
      ...(t.assignedToName ? { assignedToName: t.assignedToName } : {}),
    };
    const tasks = [...((data.tasks as unknown[]) ?? []), newTask];
    updates.tasks = tasks;
    applied.push(`addTask → id:${newTask.id}`);
  }

  // 6. updateTask — merge by id
  if (body.updateTask !== undefined) {
    const t = body.updateTask as Record<string, unknown>;
    if (!t.id || typeof t.id !== 'string') {
      return NextResponse.json({ error: 'updateTask.id is required' }, { status: 400 });
    }
    if (t.status !== undefined && !VALID_TASK_STATUSES.includes(t.status as TaskStatus)) {
      return NextResponse.json(
        { error: `Invalid task status "${t.status}". Valid: ${VALID_TASK_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }
    const tasks = [...((data.tasks as unknown[]) ?? [])] as Record<string, unknown>[];
    const idx = tasks.findIndex(tk => tk.id === t.id);
    if (idx === -1) return NextResponse.json({ error: `Task id "${t.id}" not found` }, { status: 404 });
    const merged = { ...tasks[idx] };
    if (t.title !== undefined) merged.title = t.title;
    if (t.description !== undefined) merged.description = t.description;
    if (t.status !== undefined) {
      merged.status = t.status;
      if (t.status === 'done' && !merged.completedAt) merged.completedAt = new Date().toISOString();
    }
    if (t.dueDate !== undefined) merged.dueDate = t.dueDate;
    if (t.assignedToName !== undefined) merged.assignedToName = t.assignedToName;
    tasks[idx] = merged;
    updates.tasks = tasks;
    applied.push(`updateTask id:${t.id}`);
  }

  await docRef.update(updates);

  const updated = await getDoc(params.id);
  return NextResponse.json({ applied, authority: updated });
}
