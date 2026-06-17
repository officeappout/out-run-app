/**
 * Content Items Service — Marketing Hub toor (תור תוכן).
 *
 * Collection: `content_items/{id}` (top-level).
 * Security: admin-only read/write (governed by Firestore rules + admin fallback).
 *
 * Status pipeline (forward-only in the UI; manual publish only):
 *   idea → raw → scripted → scheduled → published
 */

import {
  collection,
  doc,
  addDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const COLLECTION = 'content_items' as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContentPillar =
  | 'strength'
  | 'mobility'
  | 'mindset'
  | 'nutrition'
  | 'community';

export type ContentStatus =
  | 'idea'
  | 'raw'
  | 'scripted'
  | 'scheduled'
  | 'published';

export type ContentAccount = 'personal' | 'brand';
export type ContentPlatform = 'instagram' | 'tiktok' | 'linkedin';

export interface ContentItem {
  id: string;
  title: string;
  pillar: ContentPillar;
  status: ContentStatus;
  account: ContentAccount;
  platform?: ContentPlatform;
  sourceUrl?: string;
  scheduledDate?: Date;
  publishedDate?: Date;
  caption?: string;
  agentGenerated?: boolean;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateContentItemInput {
  title: string;
  pillar: ContentPillar;
  status?: ContentStatus;
  account: ContentAccount;
  platform?: ContentPlatform;
  sourceUrl?: string;
  scheduledDate?: Date;
  caption?: string;
  agentGenerated?: boolean;
  createdBy?: string;
}

export interface UpdateContentItemInput {
  title?: string;
  pillar?: ContentPillar;
  status?: ContentStatus;
  account?: ContentAccount;
  platform?: ContentPlatform;
  sourceUrl?: string;
  scheduledDate?: Date | null;
  publishedDate?: Date | null;
  caption?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tsToDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return new Date();
}

function tsToDateOrUndef(v: unknown): Date | undefined {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return undefined;
}

const VALID_PILLARS: ContentPillar[] = [
  'strength', 'mobility', 'mindset', 'nutrition', 'community',
];
const VALID_STATUSES: ContentStatus[] = [
  'idea', 'raw', 'scripted', 'scheduled', 'published',
];
const VALID_ACCOUNTS: ContentAccount[] = ['personal', 'brand'];
const VALID_PLATFORMS: ContentPlatform[] = ['instagram', 'tiktok', 'linkedin'];

function rowToItem(id: string, d: Record<string, unknown>): ContentItem {
  return {
    id,
    title: typeof d.title === 'string' ? d.title : '',
    pillar: VALID_PILLARS.includes(d.pillar as ContentPillar)
      ? (d.pillar as ContentPillar)
      : 'strength',
    status: VALID_STATUSES.includes(d.status as ContentStatus)
      ? (d.status as ContentStatus)
      : 'idea',
    account: VALID_ACCOUNTS.includes(d.account as ContentAccount)
      ? (d.account as ContentAccount)
      : 'personal',
    platform: VALID_PLATFORMS.includes(d.platform as ContentPlatform)
      ? (d.platform as ContentPlatform)
      : undefined,
    sourceUrl: typeof d.sourceUrl === 'string' ? d.sourceUrl : undefined,
    scheduledDate: tsToDateOrUndef(d.scheduledDate),
    publishedDate: tsToDateOrUndef(d.publishedDate),
    caption: typeof d.caption === 'string' ? d.caption : undefined,
    agentGenerated: d.agentGenerated === true,
    createdBy: typeof d.createdBy === 'string' ? d.createdBy : undefined,
    createdAt: tsToDate(d.createdAt),
    updatedAt: tsToDate(d.updatedAt),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function getContentItems(): Promise<ContentItem[]> {
  const q = query(collection(db, COLLECTION), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => rowToItem(d.id, d.data() as Record<string, unknown>));
}

export async function createContentItem(
  input: CreateContentItemInput,
): Promise<string> {
  if (!input.title?.trim()) throw new Error('title is required');

  const ref = await addDoc(collection(db, COLLECTION), {
    title: input.title.trim(),
    pillar: input.pillar,
    status: input.status ?? 'idea',
    account: input.account,
    platform: input.platform ?? null,
    sourceUrl: input.sourceUrl?.trim() ?? null,
    scheduledDate: input.scheduledDate
      ? Timestamp.fromDate(input.scheduledDate)
      : null,
    publishedDate: null,
    caption: input.caption?.trim() ?? null,
    agentGenerated: input.agentGenerated ?? false,
    createdBy: input.createdBy ?? null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateContentItem(
  id: string,
  input: UpdateContentItemInput,
): Promise<void> {
  if (!id) throw new Error('id is required');

  const patch: Record<string, unknown> = {
    updatedAt: serverTimestamp(),
  };

  if (input.title !== undefined) patch.title = input.title.trim();
  if (input.pillar !== undefined) patch.pillar = input.pillar;
  if (input.status !== undefined) patch.status = input.status;
  if (input.account !== undefined) patch.account = input.account;
  if (input.platform !== undefined) patch.platform = input.platform ?? null;
  if (input.sourceUrl !== undefined)
    patch.sourceUrl = input.sourceUrl?.trim() ?? null;
  if (input.scheduledDate !== undefined)
    patch.scheduledDate = input.scheduledDate
      ? Timestamp.fromDate(input.scheduledDate)
      : null;
  if (input.publishedDate !== undefined)
    patch.publishedDate = input.publishedDate
      ? Timestamp.fromDate(input.publishedDate)
      : null;
  if (input.caption !== undefined) patch.caption = input.caption?.trim() ?? null;

  await updateDoc(doc(db, COLLECTION, id), patch);
}

export async function deleteContentItem(id: string): Promise<void> {
  if (!id) throw new Error('id is required');
  await deleteDoc(doc(db, COLLECTION, id));
}
