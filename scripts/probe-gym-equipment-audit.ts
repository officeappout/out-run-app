/**
 * scripts/probe-gym-equipment-audit.ts — READ ONLY, throwaway (do not commit).
 *
 * Full gym_equipment audit: per item → canonical gear · #exercises in catalog ·
 * has image? · has video? · (for media-less calisthenics items) a fallback
 * exercise whose media can host it. Groups: 🟢 ok · 🟡 missing-media · ⚪ machines.
 *
 * Usage: npx tsx scripts/probe-gym-equipment-audit.ts
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';
// eslint-disable-next-line @typescript-eslint/no-var-requires
(globalThis as any).React = require('react');

function initFirebase() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}
const heName = (ex: any) => ex?.content?.name?.he ?? ex?.content?.name ?? ex?.name?.he ?? ex?.name ?? ex?.id ?? '?';
const exHasVideo = (ex: any) => {
  const ms = ex.execution_methods || ex.executionMethods || [];
  return !!ex.media?.videoUrl || ms.some((m: any) => m?.media?.mainVideoUrl);
};
const exHasImage = (ex: any) => {
  const ms = ex.execution_methods || ex.executionMethods || [];
  return !!ex.media?.imageUrl || ms.some((m: any) => m?.media?.imageUrl);
};

async function main() {
  initFirebase();
  const db = admin.firestore();
  const [gymSnap, exSnap] = await Promise.all([
    db.collection('gym_equipment').get(),
    db.collection('exercises').get(),
  ]);
  const gymEquip = gymSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  const exercises = exSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

  const { seedEquipmentCaches, normalizeGearId } = await import(
    '../src/features/workout-engine/shared/utils/gear-mapping.utils'
  );
  seedEquipmentCaches([], gymEquip as any);

  // canonical → { count, mediaExample } from the exercise catalog.
  const byCanonical = new Map<string, { count: number; mediaExample: string | null }>();
  for (const ex of exercises) {
    const ms = (ex as any).execution_methods || (ex as any).executionMethods || [];
    const refs = new Set<string>();
    for (const m of ms) {
      for (const id of [...(m.equipmentIds || []), ...(m.gearIds || []), m.equipmentId, m.gearId].filter(Boolean)) {
        refs.add(normalizeGearId(String(id)));
      }
    }
    const hasMedia = exHasVideo(ex) || exHasImage(ex);
    for (const c of Array.from(refs)) {
      const cur = byCanonical.get(c) ?? { count: 0, mediaExample: null };
      cur.count += 1;
      if (!cur.mediaExample && hasMedia) cur.mediaExample = heName(ex);
      byCanonical.set(c, cur);
    }
  }

  const rows = (gymEquip as any[]).map((g) => {
    const norm = normalizeGearId(g.id);
    const translated = norm !== String(g.id).toLowerCase();
    const brands = Array.isArray(g.brands) ? g.brands : [];
    const hasImg = !!g.imageUrl || !!g.media?.imageUrl || brands.some((b: any) => b?.imageUrl);
    const hasVid = !!g.videoUrl || !!g.media?.videoUrl || brands.some((b: any) => b?.videoUrl);
    const cat = byCanonical.get(norm) ?? { count: 0, mediaExample: null };
    return { name: g.name ?? '?', norm, translated, exCount: cat.count, hasImg, hasVid, fallback: cat.mediaExample };
  });

  const P = (r: any) => `${(r.name + '').padEnd(34).slice(0, 34)} ${(r.translated ? r.norm : '—').padEnd(20)} ${String(r.exCount).padStart(4)}  ${r.hasImg ? '🖼️' : '  '}   ${r.hasVid ? '🎬' : '  '}`;

  const green = rows.filter((r) => r.translated && r.exCount > 0 && (r.hasImg || r.hasVid));
  const yellow = rows.filter((r) => r.translated && r.exCount > 0 && !r.hasImg && !r.hasVid);
  const gapNoEx = rows.filter((r) => r.translated && r.exCount === 0);
  const machines = rows.filter((r) => !r.translated);

  const header = `${'name'.padEnd(34)} ${'canonical'.padEnd(20)} #ex  img  vid`;
  console.log(`\n🟢 CALISTHENICS OK — translates · has exercises · has media (${green.length})`);
  console.log(header); green.sort((a, b) => b.exCount - a.exCount).forEach((r) => console.log(P(r)));
  console.log(`\n🟡 MISSING MEDIA — translates · has exercises · NO image/video on the item (${yellow.length})`);
  console.log(header); yellow.forEach((r) => console.log(P(r) + `   ↳ fallback: ${r.fallback ?? '(no media exercise found)'}`));
  console.log(`\n◽ TRANSLATES BUT 0 EXERCISES — canonical exists, catalog gap (${gapNoEx.length})`);
  console.log(header); gapNoEx.forEach((r) => console.log(P(r)));
  console.log(`\n⚪ MACHINES / non-calisthenics — phase ד (${machines.length})`);
  console.log(header); machines.sort((a, b) => b.exCount - a.exCount).forEach((r) => console.log(P(r)));

  console.log(`\nTOTAL ${rows.length}: 🟢${green.length} · 🟡${yellow.length} · ◽${gapNoEx.length} · ⚪${machines.length}`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
