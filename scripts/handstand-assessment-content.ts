/**
 * Handstand Triad level-assessment content (owner-approved table, 31.10.2026:
 * appout-website/handstand-research/ASSESSMENT-LEVELS.md).
 *
 * Writes visual_assessment_content docs `${category}_${level}` for the three
 * triad sliders (handstand_strength / _balance / _mobility). Same shape as the
 * push docs: the slider shows the linked exercise's PARK video and name;
 * onboardingBubbleText = the "I can…" anchor; showInOnboarding = true.
 * Only read when HANDSTAND_TRIAD_ENABLED expands the handstand slider.
 *
 * DRY-RUN by default (checks every exercise exists and has a park video);
 * --apply writes. New docs only: an existing doc id is reported, never overwritten.
 *
 * Run: npx tsx --env-file=.env.local scripts/handstand-assessment-content.ts [--apply]
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

type Anchor = { level: number; exerciseId: string | null; he: string; en: string; target?: string; unit?: 'reps' | 'seconds' };

const CONTENT: Record<string, Anchor[]> = {
  handstand_strength: [
    { level: 1, exerciseId: null, he: 'עוד לא עשיתי תרגילי כתפיים על הידיים', en: "I haven't trained my shoulders on my hands yet" },
    { level: 3, exerciseId: 'EnS9ade12iVKtUEDuiGW', he: 'שכיבות סמיכה לשכמות', en: 'Scapular push-ups', target: '10', unit: 'reps' },
    { level: 4, exerciseId: '9BBOvu1SNMzNxgPun8ZH', he: 'להחזיק עמידת פייק', en: 'Hold a pike stance', target: '20', unit: 'seconds' },
    { level: 6, exerciseId: 'MwH75rBMKq65J9B86yUq', he: 'שכיבות סמיכה פייק', en: 'Pike push-ups', target: '8', unit: 'reps' },
    { level: 7, exerciseId: 'ANvq7ORET7uhLRK4XP6X', he: 'הליכות קיר', en: 'Wall walks', target: '3', unit: 'reps' },
    { level: 11, exerciseId: 'PVqGiE3xg76Dg0EXUsqZ', he: 'עמידת ידיים חזה לקיר, 30 שניות', en: 'Chest-to-wall handstand, 30 seconds', target: '30', unit: 'seconds' },
    { level: 12, exerciseId: 'bZv8poy3HRMKDzgGmt24', he: 'העברות משקל מול קיר', en: 'Wall weight shifts', target: '6', unit: 'reps' },
    { level: 15, exerciseId: 'PVqGiE3xg76Dg0EXUsqZ', he: 'עמידת ידיים חזה לקיר, 60 שניות', en: 'Chest-to-wall handstand, 60 seconds', target: '60', unit: 'seconds' },
  ],
  handstand_balance: [
    { level: 1, exerciseId: null, he: 'עוד לא ניסיתי להתאזן על הידיים', en: "I haven't tried balancing on my hands yet" },
    { level: 5, exerciseId: 'Z0bUVhrBLErcP1I1j6z9', he: 'עמידת צפרדע', en: 'Frog stand', target: '10', unit: 'seconds' },
    { level: 7, exerciseId: 'phUAJMYyBKsYcrEJMBnv', he: 'עמידת עורב', en: 'Crow pose', target: '10', unit: 'seconds' },
    { level: 8, exerciseId: 'eVlxFr0tH7O4MHmmgBbS', he: 'קיק אפ לעמידת ידיים', en: 'Kick up to a handstand', target: '5', unit: 'reps' },
    { level: 10, exerciseId: 's3MiKMUhjkwpRIubKlRQ', he: 'ניתוקי בהונות מהקיר', en: 'Toe pulls off the wall', target: '10', unit: 'seconds' },
    { level: 12, exerciseId: 'WSt4R7cvvvha88aMpgR2', he: 'ניתוקי עקבים מהקיר', en: 'Heel pulls off the wall', target: '10', unit: 'seconds' },
    { level: 13, exerciseId: '441SgXc1HkzPoKrKMLm9', he: 'ניתוקי מספריים', en: 'Scissor pulls', target: '10', unit: 'seconds' },
    { level: 14, exerciseId: 'T95vtujpj07Tq4jRvRxf', he: 'עמידת ידיים חופשית, 5 שניות', en: 'Freestanding handstand, 5 seconds', target: '5', unit: 'seconds' },
    { level: 15, exerciseId: 'T95vtujpj07Tq4jRvRxf', he: 'עמידת ידיים חופשית, 15-30 שניות', en: 'Freestanding handstand, 15-30 seconds', target: '15-30', unit: 'seconds' },
  ],
  handstand_mobility: [
    { level: 2, exerciseId: 'gWHaGzObmixb1vr66l5I', he: 'מתיחת מתפלל', en: 'Prayer stretch', target: '30', unit: 'seconds' },
    { level: 3, exerciseId: '2xsOhAmdtN0mKOLZF1FT', he: 'פתיחת כתף בעזרת מעקה', en: 'Rail shoulder opener', target: '30', unit: 'seconds' },
    { level: 5, exerciseId: 'KL9Xg7Yu3QLQmDRYkzqr', he: 'מתיחת קצבים', en: "Butcher's block stretch", target: '30', unit: 'seconds' },
    { level: 6, exerciseId: 'DnRgN3J7j5k6aTKX7lj3', he: 'תלייה פסיבית בתמיכת רגליים', en: 'Passive hang with feet support', target: '30', unit: 'seconds' },
    { level: 8, exerciseId: 'VAON86ZHQ0ysFJaEJFFp', he: 'הרמות ידיים בשכיבה על הבטן', en: 'Prone arm raises', target: '8', unit: 'reps' },
    { level: 10, exerciseId: 'Ka7xoggWoDPUUC7WpICt', he: 'קוברה תלויה', en: 'Hanging cobra', target: '20', unit: 'seconds' },
    { level: 14, exerciseId: 'jGXhRd8mnnUqrRnzTjnE', he: 'הרמת שכמות בעמידת ידיים חזה לקיר', en: 'Chest-to-wall handstand shrugs', target: '8', unit: 'reps' },
  ],
};

const apply = process.argv.includes('--apply');

async function main() {
  console.log(apply ? '⚠️  APPLY: writing visual_assessment_content' : 'DRY-RUN (no writes). Add --apply to write.');
  const col = db.collection('visual_assessment_content');
  let toWrite = 0;
  for (const [category, anchors] of Object.entries(CONTENT)) {
    for (const a of anchors) {
      const id = `${category}_${a.level}`;
      let video = '-';
      if (a.exerciseId) {
        const ex = (await db.collection('exercises').doc(a.exerciseId).get()).data();
        if (!ex) { console.log(`${id}: ❌ exercise ${a.exerciseId} not found`); continue; }
        const park = (ex.execution_methods ?? []).find((m: any) => m.location === 'park' || (m.locationMapping ?? []).includes('park'));
        video = park?.media?.mainVideoUrl ? 'park video ✓' : '⚠ NO park video';
      }
      const exists = (await col.doc(id).get()).exists;
      console.log(`${id}: ${a.he} | ${a.target ?? ''} ${a.unit ?? ''} | ${video}${exists ? ' | exists, skipped' : ''}`);
      if (exists) continue;
      toWrite++;
      if (!apply) continue;
      const text = (he: string, en: string) => ({ he: { neutral: he }, en: { neutral: en } });
      await col.doc(id).set({
        category,
        level: a.level,
        videoVariants: [],
        exerciseId: a.exerciseId,
        boldTitle: text(a.he, a.en),
        detailedDescription: text('', ''),
        onboardingBubbleText: a.he,
        showInOnboarding: true,
        ...(a.target ? { targetReps: a.target, unitType: a.unit ?? 'reps' } : {}),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
  console.log(`\n${toWrite} doc(s) ${apply ? 'written' : 'would be written'}.`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
