import * as admin from 'firebase-admin';
const key = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY ?? '');
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(key as admin.ServiceAccount) });
const db = admin.firestore();

const he = (n: any): string => (typeof n === 'string' ? n : (n?.he ?? n?.en ?? '?'));
const lvl = (d: any): string => {
  const tp = Array.isArray(d.targetPrograms) ? d.targetPrograms : [];
  const l = tp.map((t: any) => t?.level).filter((x: any) => typeof x === 'number');
  return l.length ? `L${Math.min(...l)}${Math.max(...l) !== Math.min(...l) ? `-${Math.max(...l)}` : ''}` : 'L?';
};

const SPECS: { label: string; re: RegExp }[] = [
  { label: 'ברפי (burpee)', re: /ברפי/ },
  { label: 'סמוך-קום / get-up (≈burpee)', re: /סמוך.?קום/ },
  { label: 'קפיצות כוכב / jumping jacks', re: /כוכב|פישוק.*קפיצ|ג['׳]?אק|jumping.?jack/i },
  { label: 'ברכיים גבוהות / high knees', re: /ברכיים גבוה|ריצ(ה|ת).*ברכ|הרמ(ת|ות) ברכ.*ריצ/ },
  { label: 'מטפס הרים / mountain climber', re: /מטפס הרים|מטפס/ },
  { label: 'סקייטר / skater', re: /סקייטר|סקטר|skater|קפיצ.*צד|צעד(י)? צד/i },
  { label: 'טאק-ג\'אמפ / tuck jump', re: /טאק|tuck|קיפול.*קפיצ|קפיצ.*קיפול|ברכיים לחזה.*קפיצ|קפיצת קיפול/i },
  { label: 'סקוואט-קפיצה / jump squat', re: /סקוואט.*קפיצ|קפיצ.*סקוואט/ },
  { label: 'לאנג\'-קפיצה / jump lunge', re: /לאנג.*קפיצ|קפיצ.*לאנג/ },
  { label: 'קפיצה כללית (גובה X / רגל אחת)', re: /^קפיצה|קפיצה גובה|קפיצה על רגל/ },
  { label: 'קפיצה בחבל / סקיפ / jump rope', re: /חבל|סקיפ|skip|דילוג/i },
  { label: 'ריצה במקום / running in place', re: /ריצה במקום|ריצת מקום|ריצה נייחת/ },
];

(async () => {
  const snap = await db.collection('exercises').get();
  const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
  console.log(`\nCatalog search over ${all.length} exercises (READ-ONLY)\n`);
  for (const s of SPECS) {
    const hits = all.filter((e) => s.re.test(he(e.name)));
    console.log(`\n■ ${s.label}  →  ${hits.length ? `${hits.length} match(es)` : 'MISSING ❌'}`);
    for (const h of hits.sort((a, b) => lvl(a).localeCompare(lvl(b)))) {
      const role = h.exerciseRole && h.exerciseRole !== 'main' ? ` [role:${h.exerciseRole}]` : '';
      console.log(`     ${lvl(h).padEnd(6)} ${he(h.name).padEnd(30)} mg=${h.movementGroup ?? '—'}${role}  (${h.id})`);
    }
  }
  console.log('');
  process.exit(0);
})();
