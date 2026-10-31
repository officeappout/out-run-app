/**
 * Camera scan accuracy log (owner 31.10): what the model detected vs what the user confirmed or
 * corrected, never the photo. One scan_feedback doc per outcome; the admin reads them to measure
 * accuracy per (equipment, brand) and to fix weak visual-index lines. Pure: schema + record.
 *
 *   via  confirm      "כן, נכון" on the top item
 *        alternative  picked one of "אולי זה אחד מאלה?"
 *        search       picked from "חיפוש בכל המתקנים" / "בחירה מהרשימה"
 *        cancel       closed without an answer
 *        park_submit  a mapped park was sent: kept / removed / added items
 */
import { z } from 'zod';
import { brandKey } from './scan-candidates';

const ID = z.string().min(1).max(128).regex(/^[A-Za-z0-9_:-]+$/);
const BRAND = z.string().trim().min(1).max(80);
const Pick = z.object({ equipmentId: ID, brandName: BRAND.optional() });

export const ScanFeedbackSchema = z.object({
  mode: z.enum(['single', 'park']),
  via: z.enum(['confirm', 'alternative', 'search', 'cancel', 'park_submit']),
  detected: z.array(Pick.extend({ confidence: z.number().min(0).max(1) })).max(20),
  confirmed: Pick.nullable().optional(),
  kept: z.array(Pick).max(60).optional(),
  removed: z.array(ID).max(60).optional(),
  added: z.array(ID).max(60).optional(),
  parkId: ID.optional(),
});

export type ScanFeedback = z.infer<typeof ScanFeedbackSchema>;

/** The stored doc: the body plus who / when and two derived flags for quick queries. */
export function feedbackRecord(uid: string, body: ScanFeedback, now: Date) {
  const top = body.detected[0];
  const hit = !!top && !!body.confirmed && top.equipmentId === body.confirmed.equipmentId;
  const brandHit = hit && !!top.brandName && !!body.confirmed?.brandName && brandKey(top.brandName) === brandKey(body.confirmed.brandName);
  return {
    ...body,
    uid,
    createdAt: now,
    topHit: body.mode === 'single' ? hit : null,
    brandHit: body.mode === 'single' && hit && !!top.brandName ? brandHit : null,
  };
}
