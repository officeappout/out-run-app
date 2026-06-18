/**
 * Account Metrics Service — Social KPIs for the Marketing Hub.
 *
 * Stores manually-entered (and future API-sourced) social stats per
 * account × platform. Each write creates a new timestamped record so
 * history is preserved for future trend graphs. Reads always surface
 * the most-recent entry per account × platform.
 *
 * Collection: `account_metrics/{id}` (top-level).
 * Security: admin-only read/write.
 *
 * source field:
 *   'manual' — entered via the admin panel (current)
 *   'api'    — future Instagram/TikTok Graph API integration
 *   Switching sources only requires changing the writer; the UI reads
 *   this collection the same way regardless of source.
 */

import {
  collection,
  doc,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  serverTimestamp,
  Timestamp,
  getCountFromServer,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const COLLECTION = 'account_metrics' as const;

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccountMetricPlatform =
  | 'instagram'
  | 'tiktok'
  | 'linkedin'
  | 'youtube'
  | 'facebook';

export type AccountMetricAccount = 'personal' | 'brand';
export type AccountMetricSource  = 'manual' | 'api';

export interface AccountMetric {
  id: string;
  account: AccountMetricAccount;
  platform: AccountMetricPlatform;
  followers: number;
  saves?: number;
  impressions?: number;
  source: AccountMetricSource;
  notes?: string;
  recordedAt: Date;
  updatedAt: Date;
}

export interface CreateAccountMetricInput {
  account: AccountMetricAccount;
  platform: AccountMetricPlatform;
  followers: number;
  saves?: number;
  impressions?: number;
  notes?: string;
  recordedAt?: Date;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const VALID_PLATFORMS: AccountMetricPlatform[] = [
  'instagram', 'tiktok', 'linkedin', 'youtube', 'facebook',
];
const VALID_ACCOUNTS: AccountMetricAccount[] = ['personal', 'brand'];

function tsToDate(v: unknown): Date {
  if (v instanceof Timestamp) return v.toDate();
  if (v instanceof Date) return v;
  return new Date();
}

function rowToMetric(id: string, d: Record<string, unknown>): AccountMetric {
  return {
    id,
    account: VALID_ACCOUNTS.includes(d.account as AccountMetricAccount)
      ? (d.account as AccountMetricAccount)
      : 'personal',
    platform: VALID_PLATFORMS.includes(d.platform as AccountMetricPlatform)
      ? (d.platform as AccountMetricPlatform)
      : 'instagram',
    followers:
      typeof d.followers === 'number' && Number.isFinite(d.followers)
        ? d.followers
        : 0,
    saves:
      typeof d.saves === 'number' && Number.isFinite(d.saves)
        ? d.saves
        : undefined,
    impressions:
      typeof d.impressions === 'number' && Number.isFinite(d.impressions)
        ? d.impressions
        : undefined,
    source: d.source === 'api' ? 'api' : 'manual',
    notes: typeof d.notes === 'string' ? d.notes : undefined,
    recordedAt: tsToDate(d.recordedAt),
    updatedAt:  tsToDate(d.updatedAt),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** All metrics, newest first. */
export async function getAccountMetrics(): Promise<AccountMetric[]> {
  const q = query(collection(db, COLLECTION), orderBy('updatedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) =>
    rowToMetric(d.id, d.data() as Record<string, unknown>),
  );
}

/**
 * Latest metric for a given account × platform combination.
 * Returns null when no record exists yet.
 */
export async function getLatestMetric(
  account: AccountMetricAccount,
  platform: AccountMetricPlatform,
): Promise<AccountMetric | null> {
  const q = query(
    collection(db, COLLECTION),
    where('account', '==', account),
    where('platform', '==', platform),
    orderBy('updatedAt', 'desc'),
    limit(1),
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return rowToMetric(d.id, d.data() as Record<string, unknown>);
}

/** Add a new snapshot. Always creates; history is preserved intentionally. */
export async function addAccountMetric(
  input: CreateAccountMetricInput,
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTION), {
    account:     input.account,
    platform:    input.platform,
    followers:   input.followers,
    saves:       input.saves    ?? null,
    impressions: input.impressions ?? null,
    source:      'manual',
    notes:       input.notes?.trim() ?? null,
    recordedAt:  input.recordedAt
      ? Timestamp.fromDate(input.recordedAt)
      : serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/**
 * Count of app users attributed to a marketing campaign (UTM).
 * A user qualifies when marketingAttribution.campaign is set
 * (i.e. they arrived via a link carrying utm_campaign).
 *
 * Uses getCountFromServer — O(1) read cost, no document payloads.
 * Returns 0 on any error so the KPI card degrades gracefully.
 */
export async function getMarketingAttributedCount(): Promise<number> {
  try {
    const q = query(
      collection(db, 'users'),
      where('marketingAttribution.campaign', '!=', null),
    );
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch {
    return 0;
  }
}
