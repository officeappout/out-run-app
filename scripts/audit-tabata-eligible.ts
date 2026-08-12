/**
 * scripts/audit-tabata-eligible.ts  —  READ-ONLY. No writes, ever.
 *
 * PHASE 1 proposal for the Tabata conditioning pool. Scans the `exercises`
 * collection and classifies each into INCLUDE / BORDERLINE / EXCLUDE against
 * David's criteria:
 *   gear = bodyweight + pull-up bar + bands only (no dumbbell/kettlebell/rings);
 *   metabolic-endurance movements sustainable for a 20s work interval;
 *   OUT: skill/strength (planche, levers, flag, handstand/HSPU, pull-ups, dips,
 *        muscle-up, one-arm, heavy pistol, L-sit/dragon) and hard equipment.
 *
 * Transparent heuristic over structured fields (equipment, mechanicalType, tags,
 * movementGroup, sweatLevel, exerciseRole) + Hebrew name fallbacks. Output is a
 * PROPOSAL for David to trim/extend — not an authority. Also reports whether the
 * existing `hiit_friendly` tag is already populated (reuse basis).
 *
 * Usage:  npx tsx --env-file=.env.local scripts/audit-tabata-eligible.ts
 */
import * as admin from 'firebase-admin';

const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!key?.project_id) { console.error('❌ FIREBASE_SERVICE_ACCOUNT_KEY missing — use --env-file=.env.local'); process.exit(1); }
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const BLOCKED_EQUIP = new Set(['dumbbells', 'kettlebell', 'rings']); // gear we don't have / skill-only
const SKILL_MECH = new Set(['straight_arm', 'hybrid']);              // planche/levers/flag/handstand, muscle-up
const STRENGTH_MG = new Set(['vertical_pull']);                       // pull-ups = strength, not 20s metabolic
const METABOLIC_MG = new Set(['squat', 'hinge', 'core', 'isolation']); // legs / core / cardio patterns
const SKILL_NAME = /פלאנ|פרונט|בק.?לבר|דגל|עמידת.?יד|hspu|מאסל|יד.?אחת|דרגון|l-?sit|קשת|פיסטול/i;
const STRENGTH_NAME = /דיפס|מקביל|מאסל.?אפ|pull.?up|muscle.?up|\bdip/i;

const he = (n: any): string => (typeof n === 'string' ? n : (n?.he ?? n?.en ?? '?'));
const levelsOf = (d: any): string => {
  const tp = Array.isArray(d.targetPrograms) ? d.targetPrograms : [];
  const lv = tp.map((t: any) => t?.level).filter((x: any) => typeof x === 'number');
  if (lv.length) return `L${Math.min(...lv)}${Math.max(...lv) !== Math.min(...lv) ? `-${Math.max(...lv)}` : ''}`;
  return typeof d.recommendedLevel === 'number' ? `L${d.recommendedLevel}?` : 'L?';
};

interface Row { id: string; name: string; level: string; domain: string; reason: string; hiit: boolean; }

async function main() {
  console.log(`\n🏷️  Tabata-eligible AUDIT (READ-ONLY) — project=${key.project_id}\n`);
  const snap = await db.collection('exercises').get();
  console.log(`Scanned ${snap.size} exercises.\n`);

  const include: Row[] = [], borderline: Row[] = [], excluded: Row[] = [];
  let hiitTagged = 0;
  const cov = { movementGroup: 0, mechanicalType: 0, tags: 0, equipment: 0, sweatLevel: 0 };

  for (const doc of snap.docs) {
    const d = doc.data() as any;
    const name = he(d.name);
    const equip: string[] = Array.isArray(d.equipment) ? d.equipment : [];
    const tags: string[] = Array.isArray(d.tags) ? d.tags : [];
    const mg: string = d.movementGroup ?? '';
    const mech: string = d.mechanicalType ?? '';
    const role: string = d.exerciseRole ?? 'main';
    const sweat: number = typeof d.sweatLevel === 'number' ? d.sweatLevel : 0;

    if (mg) cov.movementGroup++; if (mech) cov.mechanicalType++; if (tags.length) cov.tags++;
    if (equip.length) cov.equipment++; if (sweat) cov.sweatLevel++;
    const hiit = tags.includes('hiit_friendly');
    if (hiit) hiitTagged++;

    const domain = mg || d.primaryMuscle || 'unknown';
    const row = (reason: string): Row => ({ id: doc.id, name, level: levelsOf(d), domain, reason, hiit });

    const badEquip = equip.filter((e) => BLOCKED_EQUIP.has(e));
    const isSkill = tags.includes('skill') || SKILL_MECH.has(mech) || SKILL_NAME.test(name);
    const isStrength = STRENGTH_MG.has(mg) || equip.includes('dipStation') || STRENGTH_NAME.test(name);
    const metabolic = hiit || tags.includes('explosive') || sweat >= 2 || METABOLIC_MG.has(mg) || mech === 'none';

    if (badEquip.length) excluded.push(row(`equip:${badEquip.join('/')}`));
    else if (isSkill) excluded.push(row(`skill (${mech || tags.filter((t) => t === 'skill').join('') || 'name'})`));
    else if (isStrength) excluded.push(row(`strength (${mg || (equip.includes('dipStation') ? 'dipStation' : 'name')})`));
    else if (role !== 'main') excluded.push(row(`role:${role}`));
    else if (metabolic) include.push(row([
      hiit && '★hiit_friendly', tags.includes('explosive') && 'explosive',
      METABOLIC_MG.has(mg) && `mg:${mg}`, mech === 'none' && 'mech:none', sweat >= 2 && `sweat:${sweat}`,
    ].filter(Boolean).join(', ')));
    else borderline.push(row(`no clear metabolic signal (mg:${mg || '—'}, mech:${mech || '—'}, sweat:${sweat || '—'})`));
  }

  const byDomain = (rows: Row[]) => {
    const g = new Map<string, Row[]>();
    for (const r of rows) (g.get(r.domain) ?? g.set(r.domain, []).get(r.domain)!).push(r);
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length);
  };

  // ── CURATION pass (David's cleaning rules, 25.07) ────────────────────────
  // Candidate pool = INCLUDE ∪ BORDERLINE. INCLUDE kept unless a drop-rule
  // fires; BORDERLINE pulled in ONLY if it matches an explicit conditioning gem.
  const CONDI = /דוב|זחל|סרטן|אופניים|סמוך קום|בולגרי.*קפיצ|ברפי|כוכב|ג['׳]?אק|jack|ברכיים גבוה|מטפס הרים|קפיצ/;
  // David 25.07: tag these 2 warmup-named metabolic exercises into the pool.
  const FORCE_KEEP = new Set(['ZYssXGqyPrIgvV1vXJcn', 'GSPTjOAgRueyZZPkryqe']); // star jumps, running-in-place
  const curate = (r: Row, fromInclude: boolean): { keep: boolean; why: string } => {
    const n = r.name;
    if (FORCE_KEEP.has(r.id)) return { keep: true, why: 'metabolic (tag per David)' };
    if (/טבעות/.test(n)) return { keep: false, why: 'rings' };
    if (/נורדיק/.test(n)) return { keep: false, why: 'nordic (eccentric injury-risk)' };
    if (/פייק.*אגן/.test(n)) return { keep: false, why: 'deep-pike' };
    if (/גומיי|גומיה/.test(n)) return { keep: false, why: 'band (removable — no mid-block swap)' };
    if (/רצועות/.test(n)) return { keep: false, why: 'straps (removable — no mid-block swap)' };
    if (/חימום|מתיח/.test(n)) return { keep: false, why: 'warmup/stretch' };
    if (/כלב|חתול פרה|מתפלל|דוגמנית|שחיין|פולי|סיבוב חיצוני|הרחקת כתף|משיכות פנים|משיכות Y|גמישות/.test(n)) return { keep: false, why: 'prehab/mobility' };
    if (/תאומים/.test(n)) return { keep: false, why: 'calf-isolation' };
    // Arm isolation / advanced elbow skill (bicep curl / triceps extension), no compound movement
    if (/כפיפת מרפקים|פשיטת מרפקים/.test(n) && !/סקוואט|שכיב|לאנג|בטן|קראנ|היפ|גשר/.test(n)) return { keep: false, why: 'arm-isolation' };
    if (!n || n === '?') return { keep: false, why: 'unnamed' };
    // Band ISOLATION (band marker + isolation muscle, no compound movement)
    if (/גומי|התנגד/.test(n) && /מרפק|כתף|חזה|שורש|פרפר/.test(n) && !/סקוואט|שכיב|לאנג|בטן|קראנ|היפ|גשר/.test(n))
      return { keep: false, why: 'band-isolation' };
    // h-pull: easy australian rows only (angle ≥ 45°, dynamic, not Y/face)
    if (r.domain === 'horizontal_pull' || /חתיר|אוסטרל/.test(n)) {
      if (/החזק/.test(n)) return { keep: false, why: 'row-hold' };
      const m = n.match(/(\d+)\s*°/) || n.match(/ב-(\d+)/);
      const ang = m ? +m[1] : null;
      if (ang != null && ang < 45) return { keep: false, why: `hard-row ${ang}°` };
      if (ang == null && /(חתיר|אוסטרל)/.test(n)) return { keep: false, why: 'row-unspecified/hard' };
    }
    if (!fromInclude && !CONDI.test(n)) return { keep: false, why: 'borderline-nonconditioning' };
    return { keep: true, why: r.reason };
  };

  const writeTags = process.argv.includes('--write-tags');
  if (process.argv.includes('--curate') || writeTags) {
    const finalRows: Row[] = [];
    const dropped = new Map<string, number>();
    const bump = (w: string) => dropped.set(w.split(' ')[0], (dropped.get(w.split(' ')[0]) ?? 0) + 1);
    for (const r of include) { const v = curate(r, true); v.keep ? finalRows.push(r) : bump(v.why); }
    for (const r of borderline) { const v = curate(r, false); if (v.keep) finalRows.push(r); }

    const straps = finalRows.filter((r) => /רצועות/.test(r.name)); // flag: removable straps — David to decide
    const noDomain = finalRows.filter((r) => r.domain === 'unknown' || r.level === 'L?');

    console.log(`\n══ FINAL tabata pool (${finalRows.length}) ══  (★ = domain-less / no targetPrograms → defaults L1)`);
    for (const [domain, rows] of byDomain(finalRows)) {
      console.log(`\n  ▸ ${domain} (${rows.length})`);
      for (const r of rows.sort((a, b) => a.level.localeCompare(b.level))) {
        const star = r.domain === 'unknown' || r.level === 'L?' ? '★' : ' ';
        const strap = /רצועות/.test(r.name) ? ' ⚠️strap' : '';
        console.log(`   ${star} ${r.level.padEnd(6)} ${r.name.padEnd(30)}${strap} (${r.id})`);
      }
    }
    console.log(`\n── removed by curation: ${[...dropped.entries()].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w}:${n}`).join(', ')}`);
    console.log(`\n⚠️  STRAPS (רצועות) still in — removable equipment, David to confirm remove/keep (${straps.length}):`);
    for (const r of straps) console.log(`     ${r.level.padEnd(6)} ${r.name}  (${r.id})`);
    console.log(`\n── domain-less metabolic (${noDomain.length}) — no targetPrograms → default L1 → pass ≤level for all users:`);
    for (const r of noDomain) console.log(`     ${r.name}  (${r.id})`);
    console.log(`\n── FINAL total: ${finalRows.length}`);
    console.log(`── ID array (for the hiit_friendly write step):\n${JSON.stringify(finalRows.map((r) => r.id))}\n`);

    if (writeTags) {
      console.log(`\n⚠️  WRITE-TAGS: adding 'hiit_friendly' to ${finalRows.length} exercises…`);
      let n = 0;
      for (const r of finalRows) {
        await db.collection('exercises').doc(r.id).update({
          tags: admin.firestore.FieldValue.arrayUnion('hiit_friendly'),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        n++;
      }
      console.log(`✅ Tagged ${n} exercises hiit_friendly.\n`);
    }
    return;
  }

  console.log(`══ INCLUDE — proposed tabata pool (${include.length}) ══`);
  for (const [domain, rows] of byDomain(include)) {
    console.log(`\n  ▸ ${domain} (${rows.length})`);
    for (const r of rows.sort((a, b) => a.level.localeCompare(b.level)))
      console.log(`     ${r.hiit ? '★' : ' '} ${r.level.padEnd(6)} ${r.name.padEnd(30)} [${r.reason}]  (${r.id})`);
  }

  console.log(`\n\n══ BORDERLINE — excluded, pullable (${borderline.length}) ══`);
  for (const [domain, rows] of byDomain(borderline)) {
    console.log(`\n  ▸ ${domain} (${rows.length})`);
    for (const r of rows) console.log(`       ${r.level.padEnd(6)} ${r.name.padEnd(30)} [${r.reason}]  (${r.id})`);
  }

  const exReasons = new Map<string, number>();
  for (const r of excluded) { const k = r.reason.split(' ')[0]; exReasons.set(k, (exReasons.get(k) ?? 0) + 1); }
  console.log(`\n\n══ EXCLUDED summary (${excluded.length}) ══`);
  for (const [k, n] of [...exReasons.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${k}: ${n}`);

  console.log(`\n── field coverage (of ${snap.size}): movementGroup ${cov.movementGroup}, mechanicalType ${cov.mechanicalType}, tags ${cov.tags}, equipment ${cov.equipment}, sweatLevel ${cov.sweatLevel}`);
  console.log(`── hiit_friendly already tagged on ${hiitTagged} exercise(s) ${hiitTagged === 0 ? '(dormant — safe to populate)' : ''}\n`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
