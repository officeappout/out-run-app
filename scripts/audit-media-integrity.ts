/**
 * scripts/audit-media-integrity.ts — READ ONLY. Media-integrity audit of
 * gym_equipment × brands. No fixes. Flags:
 *   🔴 mismatch  — media URL embeds a DIFFERENT item's docId (wrong media)
 *   🔴 firebase  — image/video still on Firebase (not migrated to Bunny)
 *   🔴 no-image / no-video — item has none across all brands
 *   🟡 dup       — same URL used by ≥2 items
 *   🟡 cross     — image from one brand, video from another (no single brand has both)
 */
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import * as admin from 'firebase-admin';
function initFirebase() {
  if (admin.apps.length) return;
  const c = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  admin.initializeApp({ credential: admin.credential.cert(c), projectId: c.project_id });
}
function host(url: string): 'Firebase' | 'Bunny' | 'other' | '' {
  if (!url) return '';
  if (url.includes('firebasestorage.googleapis.com')) return 'Firebase';
  if (url.includes('b-cdn.net') || url.includes('iframe.bunnycdn.com')) return 'Bunny';
  return 'other';
}
/** docId embedded in an equipment media URL (Firebase %2F or Bunny /), else null. */
function urlDocId(url: string): string | null {
  if (!url) return null;
  const dec = decodeURIComponent(url);
  const m = dec.match(/equipment\/([A-Za-z0-9]+)\//);
  return m ? m[1] : null;
}
/** brandId embedded in a Bunny equipment image URL (equipment/{doc}/{brand}.ext), else null. */
function urlBrandId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/equipment\/[A-Za-z0-9]+\/([A-Za-z0-9]+)\.(?:jpg|png|webp)/);
  return m ? m[1] : null;
}

async function main() {
  initFirebase();
  const snap = await admin.firestore().collection('gym_equipment').get();
  const items = snap.docs.map((d) => ({ id: d.id, name: (d.data() as any).name ?? '?', brands: ((d.data() as any).brands ?? []) as any[] }));

  // URL → items[] (duplicate detection)
  const urlUsers = new Map<string, Set<string>>();
  for (const it of items) for (const b of it.brands) for (const u of [b.imageUrl, b.videoUrl]) {
    if (u) { if (!urlUsers.has(u)) urlUsers.set(u, new Set()); urlUsers.get(u)!.add(it.name); }
  }
  const isDup = (u?: string) => !!u && (urlUsers.get(u)?.size ?? 0) > 1;

  type Row = { name: string; sev: number; flags: string[]; brandLines: string[] };
  const rows: Row[] = items.map((it) => {
    const flags = new Set<string>();
    let anyImg = false, anyVid = false;
    let imgBrand = '', vidBrand = '';
    const brandLines: string[] = [];
    for (const b of it.brands) {
      const bn = b.brandName ?? '?';
      const ih = host(b.imageUrl), vh = host(b.videoUrl);
      const iDoc = urlDocId(b.imageUrl), vDoc = urlDocId(b.videoUrl);
      const iMis = iDoc && iDoc !== it.id, vMis = vDoc && vDoc !== it.id;
      if (b.imageUrl) { anyImg = true; if (!imgBrand) imgBrand = bn; }
      if (b.videoUrl) { anyVid = true; if (!vidBrand) vidBrand = bn; }
      if (ih === 'Firebase') flags.add('🔴firebase');
      if (vh === 'Firebase') flags.add('🔴firebase');
      if (iMis || vMis) flags.add('🔴mismatch');
      // brand present with a video but NO image (e.g. מאמן: Ludos vid, no img)
      if (b.videoUrl && !b.imageUrl) flags.add(`🔴${bn}-no-img`);
      // brand's Bunny image belongs to a DIFFERENT brand (e.g. אופניים: Ludos uses Urbanics img)
      const iBrand = urlBrandId(b.imageUrl);
      if (iBrand && b.brandId && iBrand !== b.brandId) flags.add('🔴wrong-brand-img');
      if (isDup(b.imageUrl) || isDup(b.videoUrl)) flags.add('🟡dup');
      const imgS = b.imageUrl ? `${ih}${iMis ? `‼️→${iDoc}` : ''}${isDup(b.imageUrl) ? '·dup' : ''}` : '—';
      const vidS = b.videoUrl ? `${vh}${vMis ? `‼️→${vDoc}` : ''}${isDup(b.videoUrl) ? '·dup' : ''}` : '—';
      brandLines.push(`      ${bn.padEnd(9)} img:${imgS.padEnd(20)} vid:${vidS}`);
    }
    if (!anyImg) flags.add('🔴no-image');
    if (!anyVid) flags.add('🔴no-video');
    if (anyImg && anyVid && imgBrand && vidBrand && imgBrand !== vidBrand) flags.add('🟡cross');
    const fa = Array.from(flags);
    const sev = (fa.includes('🔴mismatch') ? 100 : 0) + (fa.includes('🔴wrong-brand-img') ? 60 : 0) +
      (fa.includes('🔴no-image') || fa.includes('🔴no-video') ? 50 : 0) + (fa.some((f) => f.endsWith('-no-img')) ? 40 : 0) +
      (fa.includes('🔴firebase') ? 20 : 0) + (fa.includes('🟡dup') ? 8 : 0) + (fa.includes('🟡cross') ? 4 : 0);
    return { name: it.name, sev, flags: fa, brandLines };
  });

  rows.sort((a, b) => b.sev - a.sev || a.name.localeCompare(b.name));
  console.log('\n════════ MEDIA INTEGRITY AUDIT (gym_equipment × brands) ════════\n');
  for (const r of rows) {
    if (r.sev === 0) continue; // clean items omitted from the flagged view
    console.log(`■ ${r.name}   [${r.flags.join(' ')}]`);
    r.brandLines.forEach((l) => console.log(l));
  }
  const clean = rows.filter((r) => r.sev === 0).length;
  console.log(`\n── summary ── flagged: ${rows.length - clean} · clean: ${clean} · total: ${rows.length}`);
  console.log('legend: 🔴mismatch(wrong item) 🔴firebase(not on Bunny) 🔴no-image/no-video 🟡dup(shared URL) 🟡cross(img/vid different brand)');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
