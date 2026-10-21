/**
 * The demo world's social layer (pure): private groups (isPublic:false — never offered
 * to a real user), their group chats, a few DMs, follows and the membership mirrors.
 * Every participant is a demo persona; viewers are added only by add-viewer.ts --groups.
 * Group ids carry the `demo-` prefix, so league scope stats count them as demo scopes.
 */
import { tenantById, type DemoCity } from './config';
import { offset } from './geo';
import { PERSONAS, personaUid, type Persona } from './personas';
import { intBetween, pick, rngFrom } from './rng';
import type { DocWrite } from './history';

export interface DemoGroupDef {
  id: string;
  name: string;
  description: string;
  category: 'walking' | 'running' | 'calisthenics' | 'other';
  groupType: 'neighborhood' | 'park' | 'friends' | 'military';
  tenantId: string;
  members: string[];
}

export const DEMO_GROUPS: DemoGroupDef[] = [
  { id: 'demo-grp-tlv-run', name: 'דמו · רצים בצפון', description: 'ריצות ערב בפארק', category: 'running', groupType: 'neighborhood', tenantId: 'demo-tlv', members: ['tlv02', 'tlv05', 'tlv08', 'tlv10', 'tlv06'] },
  { id: 'demo-grp-tlv-park', name: 'דמו · כוח במתקנים', description: 'אימוני כוח במתקני הכושר בפארק', category: 'calisthenics', groupType: 'park', tenantId: 'demo-tlv', members: ['tlv01', 'tlv03', 'tlv06', 'tlv09'] },
  { id: 'demo-grp-tlv-walk', name: 'דמו · הליכת בוקר', description: 'הולכים יחד לפני העבודה', category: 'walking', groupType: 'neighborhood', tenantId: 'demo-tlv', members: ['tlv07', 'tlv04', 'tlv10'] },
  { id: 'demo-grp-b7-walk', name: 'דמו · הולכים בבוקר', description: 'הליכה של חצי שעה בשכונה', category: 'walking', groupType: 'neighborhood', tenantId: 'demo-b7', members: ['b704', 'b702', 'b706'] },
  { id: 'demo-grp-b7-fit', name: 'דמו · כושר בשכונה', description: 'כוח וריצה, כל הרמות', category: 'calisthenics', groupType: 'park', tenantId: 'demo-b7', members: ['b701', 'b703', 'b705', 'b707'] },
  { id: 'demo-grp-haifa-carmel', name: 'דמו · ריצות בכרמל', description: 'עליות, ירידות ונוף', category: 'running', groupType: 'friends', tenantId: 'demo-haifa', members: ['hfa03', 'hfa05', 'hfa07', 'hfa02'] },
  { id: 'demo-grp-haifa-walk', name: 'דמו · הליכה בנווה שאנן', description: 'הליכה רגועה בשכונה', category: 'walking', groupType: 'neighborhood', tenantId: 'demo-haifa', members: ['hfa01', 'hfa04', 'hfa06'] },
  { id: 'demo-grp-unit-a', name: 'דמו · כושר יחידה א׳', description: 'אימוני הכושר של היחידה', category: 'other', groupType: 'military', tenantId: 'demo-unit-a', members: ['ua01', 'ua02', 'ua03'] },
  { id: 'demo-grp-unit-b', name: 'דמו · כושר יחידה ב׳', description: 'אימוני הכושר של היחידה', category: 'other', groupType: 'military', tenantId: 'demo-unit-b', members: ['ub01', 'ub02', 'ub03'] },
  { id: 'demo-grp-reserve', name: 'דמו · מילואימניקים בכושר', description: 'שומרים על כושר בין הסבבים', category: 'running', groupType: 'military', tenantId: 'demo-reserve', members: ['rs01', 'rs02', 'rs03'] },
];

/**
 * Weekly meetups of the demo groups (PR 5, the viewer's "לא לבד" / partner finder need
 * them — a group with no slot is never suggested). Military groups meet in the unit.
 */
export function demoGroupSlots(category: DemoGroupDef['category'], groupType: DemoGroupDef['groupType']) {
  if (groupType === 'military') return [];
  const at = (dayOfWeek: number, time: string, durationMinutes: number) => ({ dayOfWeek, time, frequency: 'weekly' as const, durationMinutes });
  if (category === 'walking') return [at(0, '07:00', 45), at(2, '07:00', 45), at(4, '18:30', 45)];
  if (category === 'running') return [at(1, '19:00', 60), at(3, '19:00', 60), at(5, '07:30', 75)];
  return [at(0, '18:00', 50), at(3, '18:00', 50)];
}

/**
 * Where a demo group meets: a city group at one of its demo neighbourhoods (an exact,
 * fictional point near the real city — "לא לבד" / nearby groups only use exact points);
 * a unit group stays city-precision (no distance is ever claimed from it).
 */
function meetingPointOf(g: DemoGroupDef, city: DemoCity | null, centre: { lat: number; lng: number }, tenantName: string) {
  if (!city || !city.neighborhoods.length || g.groupType === 'military') return { address: tenantName, location: centre, precision: 'city' as const };
  const n = city.neighborhoods[Math.abs(hashOf(g.id)) % city.neighborhoods.length];
  return { address: n.name, location: offset(centre, n.offset[0], n.offset[1]), precision: 'exact' as const };
}

function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export const DEMO_DMS: Array<[string, string]> = [
  ['tlv01', 'tlv06'],
  ['b701', 'b707'],
  ['hfa02', 'hfa05'],
  ['ua01', 'ua03'],
];

const GROUP_LINES = [
  'מי מגיע מחר בבוקר?',
  'אני בפנים',
  'איזה אימון היה היום, תודה לכולם',
  'מישהו יודע אם המתקנים בפארק פתוחים?',
  'עשיתי היום שיא אישי!',
  'נפגשים בכניסה לפארק ב-7',
  'קצת חם היום, בואו נתחיל מוקדם יותר',
  'כל הכבוד על ההתמדה השבוע',
  'אני אאחר בעשר דקות',
  'מחר מנוחה, נתראה ביום ראשון',
  'מי בא לריצה ארוכה בשישי?',
  'המסלול של אתמול היה מעולה',
];
const DM_LINES = ['היי, מתאמנים מחר?', 'כן, ב-19:00 בפארק', 'מעולה, אני מביא גומיות', 'סגור, נתראה', 'איך הרגליים אחרי אתמול?', 'כואבות אבל שווה'];

const byKey = (k: string): Persona => {
  const p = PERSONAS.find((x) => x.key === k);
  if (!p) throw new Error(`group member ${k} is not a persona`);
  return p;
};

export function groupIdsOf(key: string): string[] {
  return DEMO_GROUPS.filter((g) => g.members.includes(key)).map((g) => g.id);
}

export const dmChatId = (a: string, b: string) => [personaUid({ key: a }), personaUid({ key: b })].sort().join('_');
export const groupChatId = (groupId: string) => `group_${groupId}`;

function messages(chatPath: string, lines: readonly string[], speakers: Persona[], now: Date, seed: string, count: number): { docs: DocWrite[]; last: { text: string; at: Date; uid: string } } {
  const r = rngFrom(seed);
  const docs: DocWrite[] = [];
  let at = new Date(now.getTime() - 21 * 86_400_000);
  let last = { text: '', at, uid: personaUid(speakers[0]) };
  for (let i = 0; i < count; i++) {
    at = new Date(at.getTime() + intBetween(r, 6, 60) * 3_600_000);
    if (at > now) break;
    const who = count === lines.length ? speakers[i % speakers.length] : speakers[intBetween(r, 0, speakers.length - 1)];
    const text = count === lines.length ? lines[i] : pick(r, lines);
    const uid = personaUid(who);
    docs.push({ path: `${chatPath}/messages/m${String(i).padStart(3, '0')}`, data: { senderUid: uid, senderName: who.name, text, sentAt: at, readBy: [uid], type: 'text', isDemo: true } });
    last = { text, at, uid };
  }
  return { docs, last };
}

export function buildSocial(now: Date): DocWrite[] {
  const docs: DocWrite[] = [];
  for (const g of DEMO_GROUPS) {
    const members = g.members.map(byKey);
    const creator = members[0];
    const tenant = tenantById(g.tenantId);
    const centre = tenant.center;
    const createdAt = new Date(now.getTime() - 75 * 86_400_000);
    docs.push({
      path: `community_groups/${g.id}`,
      data: {
        authorityId: g.tenantId,
        name: g.name,
        description: g.description,
        category: g.category,
        groupType: g.groupType,
        scopeId: g.tenantId,
        isPublic: false,
        allowJoinRequests: false,
        ageRestriction: 'adult',
        schedule: null,
        scheduleSlots: demoGroupSlots(g.category, g.groupType),
        meetingLocation: meetingPointOf(g, tenant.kind === 'city' ? (tenant as DemoCity) : null, centre, tenant.name),
        rules: null,
        images: [],
        source: 'user',
        isOfficial: false,
        isLocked: false,
        hasMeetups: demoGroupSlots(g.category, g.groupType).length > 0,
        currentParticipants: members.length,
        memberCount: members.length,
        minimumMembers: 1,
        isActive: true,
        createdBy: personaUid(creator),
        createdAt,
        updatedAt: now,
        isDemo: true,
      },
    });
    members.forEach((m, i) => {
      docs.push({ path: `community_groups/${g.id}/members/${personaUid(m)}`, data: { uid: personaUid(m), name: m.name, joinedAt: new Date(createdAt.getTime() + i * 86_400_000), role: i === 0 ? 'admin' : 'member', isDemo: true } });
    });
    const chatPath = `chats/${groupChatId(g.id)}`;
    const msg = messages(chatPath, GROUP_LINES, members, now, g.id, 10);
    docs.push(...msg.docs);
    docs.push({
      path: chatPath,
      data: {
        participants: members.map(personaUid),
        participantNames: Object.fromEntries(members.map((m) => [personaUid(m), m.name])),
        lastMessage: msg.last.text,
        lastMessageAt: msg.last.at,
        lastSenderId: msg.last.uid,
        unreadCount: {},
        createdAt,
        type: 'group',
        groupId: g.id,
        groupName: g.name,
        isDemo: true,
      },
    });
  }

  for (const [a, b] of DEMO_DMS) {
    const pa = byKey(a);
    const pb = byKey(b);
    const chatPath = `chats/${dmChatId(a, b)}`;
    const msg = messages(chatPath, DM_LINES, [pa, pb], now, `${a}|${b}`, DM_LINES.length);
    docs.push(...msg.docs);
    docs.push({
      path: chatPath,
      data: {
        participants: [personaUid(pa), personaUid(pb)],
        participantNames: { [personaUid(pa)]: pa.name, [personaUid(pb)]: pb.name },
        lastMessage: msg.last.text,
        lastMessageAt: msg.last.at,
        lastSenderId: msg.last.uid,
        unreadCount: {},
        createdAt: new Date(now.getTime() - 21 * 86_400_000),
        type: 'dm',
        isDemo: true,
      },
    });
  }

  // Follows: everyone follows everyone they share a group with (mutual "partners").
  for (const p of PERSONAS) {
    const mates = new Set<string>();
    for (const g of DEMO_GROUPS) if (g.members.includes(p.key)) g.members.forEach((m) => m !== p.key && mates.add(personaUid({ key: m })));
    for (const [a, b] of DEMO_DMS) {
      if (a === p.key) mates.add(personaUid({ key: b }));
      if (b === p.key) mates.add(personaUid({ key: a }));
    }
    const list = Array.from(mates).sort();
    docs.push({ path: `connections/${personaUid(p)}`, data: { following: list, followers: list, isDemo: true } });
    docs.push({ path: `user_memberships/${personaUid(p)}`, data: { groupIds: groupIdsOf(p.key), updatedAt: now, isDemo: true } });
  }
  return docs;
}
