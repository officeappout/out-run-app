/**
 * Finance module — vendor catalog seed.
 * Spec: מודול כספים §3 + David's Phase-0 vendor model.
 *
 * The catalog lives in Firestore `finance_vendors` (a management tool, editable
 * from the panel), but the baseline is version-controlled here and planted by
 * an *idempotent* seed: a vendor doc is created only when absent, so re-running
 * NEVER clobbers edits made in the panel.
 *
 * The scanner auto-identifies incoming mail by matching `aliases` (sender
 * domain / subject keywords) and copies category / paymentMethod /
 * expenseNature onto the captured transaction.
 *
 * Firestore is imported as a *type only*; the sole runtime dependency
 * (`firebase-admin/firestore` for FieldValue) is loaded lazily inside the
 * seeder, so the data array + types stay client-safe.
 */
import type { Firestore } from 'firebase-admin/firestore';
import type {
  Currency,
  ExpenseCategory,
  ExpenseNature,
  PaymentMethod,
} from './transaction.types';

export type VendorRecurring = 'monthly' | 'one_time' | 'irregular';

export interface FinanceVendor {
  id: string;
  name: string;
  /** Sender domains / subject keywords used to auto-identify from mail. */
  aliases: string[];
  expenseNature: ExpenseNature;
  category: ExpenseCategory;
  paymentMethod: PaymentMethod;
  currency: Currency;
  /** Expected amount (anomaly hint); null for variable spend. */
  expectedAmount: number | null;
  recurring: VendorRecurring;
  /** false = a subscription that was cancelled. */
  active: boolean;
  notes: string;
}

export const FINANCE_VENDORS_COLLECTION = 'finance_vendors';

/**
 * Baseline catalog (§3). Where `aliases` is empty or a note says
 * "להשלים בהרצה", the real sender domain / name is filled from mail on the
 * first scan and learned back to Firestore.
 */
export const FINANCE_VENDORS_SEED: FinanceVendor[] = [
  { id: 'anthropic',                  name: 'קלוד / Anthropic',        aliases: ['anthropic', 'claude'],           expenseNature: 'fixed',          category: 'תוכנה/כלים',      paymentMethod: 'אשראי',  currency: 'ILS', expectedAmount: 72,   recurring: 'monthly',   active: true, notes: 'חודשי ~₪72' },
  { id: 'cursor',                     name: 'Cursor AI',               aliases: ['cursor'],                        expenseNature: 'fixed',          category: 'תוכנה/כלים',      paymentMethod: 'אשראי',  currency: 'ILS', expectedAmount: null, recurring: 'monthly',   active: true, notes: 'יורד מחשבון דוד' },
  { id: 'summit-accounting',          name: 'סמיט הנהלת חשבונות',       aliases: ['סמיט', 'summit'],                 expenseNature: 'fixed',          category: 'הנהלת חשבונות',   paymentMethod: 'אשראי',  currency: 'ILS', expectedAmount: 149,  recurring: 'monthly',   active: true, notes: '~₪149' },
  { id: 'freeconvert',                name: 'freeconvert',             aliases: ['freeconvert', 'מכווץ'],           expenseNature: 'fixed',          category: 'תוכנה/כלים',      paymentMethod: 'אשראי',  currency: 'ILS', expectedAmount: 46,   recurring: 'monthly',   active: true, notes: '~₪46-64' },
  { id: 'artlist',                    name: 'Artlist',                 aliases: ['artlist'],                       expenseNature: 'fixed',          category: 'תוכנה/כלים',      paymentMethod: 'אשראי',  currency: 'ILS', expectedAmount: 65,   recurring: 'monthly',   active: true, notes: '~₪65' },
  { id: 'onelink',                    name: 'onelink',                 aliases: ['onelink'],                       expenseNature: 'fixed',          category: 'תוכנה/כלים',      paymentMethod: 'אשראי',  currency: 'ILS', expectedAmount: 82,   recurring: 'monthly',   active: true, notes: '~₪82' },
  { id: 'google-workspace',           name: 'חשבון גוגל ארגוני',       aliases: ['google workspace', 'גוגל', 'google'], expenseNature: 'fixed',     category: 'תוכנה/כלים',      paymentMethod: 'אשראי',  currency: 'ILS', expectedAmount: 196,  recurring: 'monthly',   active: true, notes: '~₪196' },
  { id: 'wati',                       name: 'wati',                    aliases: ['wati'],                          expenseNature: 'variable',       category: 'תוכנה/כלים',      paymentMethod: 'אשראי',  currency: 'ILS', expectedAmount: null, recurring: 'irregular', active: true, notes: 'לוודא לא כפול' },
  { id: 'facebook-ads',               name: 'פרסום פייסבוק',           aliases: ['facebook', 'meta'],              expenseNature: 'variable',       category: 'שיווק',           paymentMethod: 'אשראי',  currency: 'ILS', expectedAmount: null, recurring: 'monthly',   active: true, notes: 'משתנה' },
  { id: 'software-house-maintenance', name: 'בית תוכנה תחזוקה',         aliases: [],                                expenseNature: 'human_supplier', category: 'פיתוח',           paymentMethod: 'ספקים',  currency: 'ILS', expectedAmount: 3304, recurring: 'monthly',   active: true, notes: 'דומיין הספק — להשלים בהרצה' },
  { id: 'software-house-adhoc',       name: 'בית תוכנה — קוד קופון',    aliases: [],                                expenseNature: 'human_supplier', category: 'פיתוח',           paymentMethod: 'ספקים',  currency: 'ILS', expectedAmount: null, recurring: 'irregular', active: true, notes: 'דומיין הספק — להשלים בהרצה' },
  { id: 'accountant',                 name: 'רואה חשבון',              aliases: [],                                expenseNature: 'human_supplier', category: 'הנהלת חשבונות',   paymentMethod: 'ספקים',  currency: 'ILS', expectedAmount: 826,  recurring: 'monthly',   active: true, notes: 'שם רו"ח — להשלים בהרצה' },
  { id: 'loan',                       name: 'הלוואה',                  aliases: [],                                expenseNature: 'fixed',          category: 'הלוואות ומימון',  paymentMethod: 'הלוואה', currency: 'ILS', expectedAmount: 3434, recurring: 'monthly',   active: true, notes: 'הבנק — להשלים בהרצה' },
  { id: 'mobile-power',               name: 'מתח נייד',                aliases: [],                                expenseNature: 'variable',       category: 'ציוד',            paymentMethod: 'אשראי',  currency: 'ILS', expectedAmount: null, recurring: 'one_time',  active: true, notes: '' },
  { id: 'photographer-editor',        name: 'צלם ועורך',               aliases: [],                                expenseNature: 'human_supplier', category: 'שיווק',           paymentMethod: 'ספקים',  currency: 'ILS', expectedAmount: null, recurring: 'irregular', active: true, notes: '' },
  { id: 'lawyer',                     name: 'עורך דין',                aliases: [],                                expenseNature: 'human_supplier', category: 'משפטי',           paymentMethod: 'ספקים',  currency: 'ILS', expectedAmount: null, recurring: 'irregular', active: true, notes: '' },
];

/**
 * Idempotent planter. Creates a vendor doc only when it does not already exist
 * — existing docs (possibly edited in the panel) are left untouched. Pass an
 * Admin Firestore instance (`getAdminDb()`).
 *
 * `dryRun: true` inspects only — reports which vendors WOULD be created without
 * writing anything.
 */
export async function seedFinanceVendors(
  db: Firestore,
  opts: { dryRun?: boolean } = {},
): Promise<{ created: string[]; skipped: string[]; dryRun: boolean; report: string }> {
  const { FieldValue } = await import('firebase-admin/firestore');
  const col = db.collection(FINANCE_VENDORS_COLLECTION);
  // Safe by default: a bare seedFinanceVendors(db) previews. Callers must pass
  // dryRun:false explicitly to write.
  const dryRun = opts.dryRun ?? true;

  const created: string[] = [];
  const skipped: string[] = [];

  for (const vendor of FINANCE_VENDORS_SEED) {
    const ref = col.doc(vendor.id);
    const snap = await ref.get();
    if (snap.exists) {
      skipped.push(vendor.id);
      continue;
    }
    if (!dryRun) {
      await ref.set({
        ...vendor,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    created.push(vendor.id);
  }

  const verb = dryRun ? 'would create' : 'created';
  const report = `finance_vendors seed${dryRun ? ' (dry-run)' : ''}: ${verb} ${created.length}, skipped ${skipped.length} (already present)`;
  console.log(`[finance-seed] ${report}`);
  return { created, skipped, dryRun, report };
}
