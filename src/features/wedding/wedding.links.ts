import { BOOKING_LEADS, DEFAULT_LEAD } from './wedding.config';
import { daysUntil } from './wedding.calc';
import type { Vendor, VendorStatus, WeddingState, WeddingTask } from './wedding.types';

/**
 * Vendor ⇄ task link. Every vendor has a "close" task (task.vendorId) that
 * carries the date and who owns it. Kept in sync on every state update:
 * - a new vendor gets its task, dated by BOOKING_LEADS;
 * - vendor closed/paid ⇄ task done;
 * - renaming a vendor renames (and re-dates) its auto-made task;
 * - deleting a vendor deletes its auto-made task, and only unlinks a task the couple wrote.
 */

export const AUTO_PREFIX = 'לסגור: ';
const CLOSED: VendorStatus[] = ['נסגר', 'שולם במלואו'];
export const isClosed = (s: VendorStatus) => CLOSED.includes(s);

export function bookingLead(name: string): { days: number; label: string } {
  const n = name.toLowerCase();
  return BOOKING_LEADS.find((l) => l.match.some((m) => n.includes(m.toLowerCase()))) ?? DEFAULT_LEAD;
}

/** Ideal lead if there is still time for it, else squeezed into the time left (closing within ~2 weeks). */
export function closeWindow(name: string, weddingIso: string, today = new Date()): { startBefore: number; daysBefore: number; late: boolean } {
  const lead = bookingLead(name).days;
  const left = daysUntil(weddingIso, today);
  if (lead < left - 14) return { startBefore: Math.min(lead + 14, left), daysBefore: lead, late: false };
  const end = Math.max(1, Math.min(lead, left - 14));
  return { startBefore: Math.max(end, Math.min(left, end + 14)), daysBefore: end, late: true };
}

export function autoTask(v: Vendor, weddingIso: string, id: string, today = new Date()): WeddingTask {
  const w = closeWindow(v.name, weddingIso, today);
  return { id, name: `${AUTO_PREFIX}${v.name}`, startBefore: w.startBefore, daysBefore: w.daysBefore, done: isClosed(v.status), owners: [], vendorId: v.id };
}

/** Booking order: by due date, then by start; 1 = first to do. */
export function taskOrder(tasks: WeddingTask[]): Map<string, number> {
  const sorted = [...tasks].sort((a, b) => b.daysBefore - a.daysBefore || b.startBefore - a.startBefore || a.name.localeCompare(b.name, 'he'));
  return new Map(sorted.map((t, i) => [t.id, i + 1]));
}

export function syncVendorTasks(prev: WeddingState, next: WeddingState, today = new Date(), makeId = () => `vt${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`): WeddingState {
  if (prev.vendors === next.vendors && prev.tasks === next.tasks) return next;
  const pv = new Map(prev.vendors.map((v) => [v.id, v]));
  const nv = new Map(next.vendors.map((v) => [v.id, v]));
  const pt = new Map(prev.tasks.map((t) => [t.id, t]));
  let tasks = next.tasks;
  let vendors = next.vendors;
  let changed = false;

  // Vendor-side changes drive tasks.
  for (const v of next.vendors) {
    const old = pv.get(v.id);
    if (!old) {
      if (!tasks.some((t) => t.vendorId === v.id)) {
        tasks = [...tasks, autoTask(v, next.settings.date, makeId(), today)];
        changed = true;
      }
      continue;
    }
    if (old === v) continue;
    tasks = tasks.map((t) => {
      if (t.vendorId !== v.id) return t;
      let u = t;
      if (old.status !== v.status && isClosed(old.status) !== isClosed(v.status)) u = { ...u, done: isClosed(v.status) };
      if (old.name !== v.name && t.name === `${AUTO_PREFIX}${old.name}`) {
        const w = closeWindow(v.name, next.settings.date, today);
        u = { ...u, name: `${AUTO_PREFIX}${v.name}`, startBefore: w.startBefore, daysBefore: w.daysBefore };
      }
      if (u !== t) changed = true;
      return u;
    });
  }
  for (const old of prev.vendors) {
    if (nv.has(old.id)) continue;
    const before = tasks;
    tasks = tasks
      .filter((t) => !(t.vendorId === old.id && t.name === `${AUTO_PREFIX}${old.name}`))
      .map((t) => (t.vendorId === old.id ? { ...t, vendorId: '' } : t));
    if (tasks.length !== before.length || tasks.some((t, i) => t !== before[i])) changed = true;
  }

  // Task-side: ticking a linked task closes / reopens its vendor (unless the vendor changed in this same update).
  for (const t of tasks) {
    const old = pt.get(t.id);
    if (!t.vendorId || !old || old.done === t.done) continue;
    const v = nv.get(t.vendorId);
    if (!v || pv.get(v.id) !== v) continue;
    const status: VendorStatus | null = t.done && !isClosed(v.status) ? 'נסגר' : !t.done && v.status === 'נסגר' ? 'לברר' : null;
    if (status) {
      vendors = vendors.map((x) => (x.id === v.id ? { ...x, status } : x));
      changed = true;
    }
  }
  return changed ? { ...next, tasks, vendors } : next;
}
