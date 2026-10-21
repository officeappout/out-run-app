/**
 * Namespace `community`, `social.*` keys (i18n wave 2 — src/features/social/components): every Hebrew
 * key returns exactly what the code rendered before the extraction. The `old` side of each case is the
 * original literal / template expression, copied verbatim from the components (helpers re-declared below
 * as they were).
 *
 * The parity snapshots (src/features/social/components/__tests__/social-i18n-*.test.tsx) cover the keys in
 * context; this test also pins what a render can't reach (toasts, the delete-failed alert), every select
 * branch, and counts ≥ 1000 (no thousands separator).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/community.json';
import { community } from '@/messages/ns/community';
import { makeT } from '../t';

const t = makeT('he', community);
type Key = keyof typeof he;

describe('community (he) social.* — byte-identical to the pre-extraction literals', () => {
  it('owns exactly the social.* keys this test pins (count per prefix, not the namespace total)', () => {
    expect(Object.keys(he).filter((k) => k.startsWith('social.')).length).toBe(124);
  });

  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      // ActivityPanel
      ['social.activity.title', 'פעילות'],
      ['social.activity.loading', 'טוען פעילות...'],
      ['social.activity.empty.title', 'עדיין אין פעילות...'],
      ['social.activity.empty.body', 'כשאווטירים יעלו לך ידיים או יצטרפו לקבוצה, זה יופיע כאן'],
      ['social.activity.highFiveBack', '🤘 בחזרה'],
      ['social.activity.time.now', 'עכשיו'],
      // PartnerCard / RouteLine
      ['social.partner.following', 'עוקב'],
      ['social.partner.follow', 'מעקב'], // gender batch 3 (was: עקוב)
      ['social.partner.self', 'אני'],
      ['social.routeLine.label', 'קו המסלול'],
      // FeedPostCard
      ['social.post.time.now', 'עכשיו'],
      ['social.post.time.yesterday', 'אתמול'],
      ['social.post.deleteFailed', 'מחיקת הפוסט נכשלה. אנא נסה/י שוב.'],
      ['social.post.menu.label', 'פעולות נוספות'],
      ['social.post.menu.delete', 'מחק פוסט'],
      ['social.post.menu.report', 'דווח על פוסט'],
      ['social.post.confirm.title', 'למחוק את הפוסט?'],
      ['social.post.confirm.body', 'הפעולה הזו אינה ניתנת לביטול.'],
      ['social.post.confirm.cancel', 'ביטול'],
      ['social.post.confirm.delete', 'מחיקה'],
      // FeedPostCardV2
      ['social.post.paceBars.title', 'קצב לפי הקפה'],
      ['social.post.cheered', 'עודדת'],
      ['social.post.cheer', 'עידוד'],
      ['social.post.shareImage', 'שיתוף לרשתות'],
      ['social.post.segmentKm', ' ק״מ'],
      ['social.post.minutes', 'דקות'],
      // FeedPublishSheets
      ['social.publish.audience.partners.label', 'שותפים'],
      ['social.publish.audience.partners.hint', 'מי שעוקב אחריך ואת/ה אחריו'],
      ['social.publish.audience.public.label', 'כולם'],
      ['social.publish.audience.public.hint', 'כל משתמשי OUT'],
      ['social.publish.audience.private.label', 'רק אני'],
      ['social.publish.audience.private.hint', 'נשמר אצלך, לא מתפרסם'],
      ['social.publish.fallbackTitle', 'האימון האחרון שלך'],
      ['social.publish.prompt.share', 'שיתוף'],
      ['social.publish.card.shareImage', 'שיתוף לרשתות'],
      ['social.publish.card.published', 'האימון פורסם בפיד'],
      ['social.publish.card.queued', 'האימון יפורסם בפיד'],
      ['social.publish.card.queuedHint', 'ברגע שתסיים/י את הסיכום'],
      ['social.publish.card.ask', 'לשתף את האימון בפיד?'],
      ['social.publish.card.share', 'שיתוף'],
      ['social.publish.card.dismiss', 'לא הפעם'],
      ['social.publish.sheet.close', 'סגירה'],
      ['social.publish.share.photoError', 'לא הצלחנו לפתוח את התמונה'],
      ['social.publish.share.title', 'לשתף את האימון?'],
      ['social.publish.share.captionLabel', 'כמה מילים על האימון'],
      ['social.publish.share.captionPlaceholder', 'כמה מילים על האימון (לא חובה)'],
      ['social.publish.share.photoAlt', 'התמונה שתצורף לפוסט'],
      ['social.publish.share.removePhoto', 'הסרת התמונה'],
      ['social.publish.share.addPhoto', 'הוספת תמונה'],
      ['social.publish.share.audienceTitle', 'מי יראה'],
      ['social.publish.share.park.label', 'להראות באיזה פארק'],
      ['social.publish.share.park.hint', 'בלי מפה ובלי כתובת, רק שם הפארק'],
      ['social.publish.share.route.label', 'להראות את קו המסלול'],
      ['social.publish.share.route.hint', 'רק צורת הקו, בלי מפה. 200 המטרים הראשונים והאחרונים לא מוצגים'],
      ['social.publish.share.savePrivate', 'שמירה אצלי'],
      ['social.publish.share.publish', 'פרסום'],
      ['social.publish.share.skip', 'לא הפעם'],
      ['social.publish.share.autoPublish', 'לפרסם אוטומטית בפעם הבאה?'],
      ['social.publish.privacy.title', 'מי רואה מה'],
      ['social.publish.privacy.intro', 'שום דבר לא מתפרסם בלי שבחרת. האימונים נספרים בליגות גם אם לא פרסמת אותם.'],
      ['social.publish.privacy.autoTitle', 'פרסום אוטומטי אחרי אימון'],
      ['social.publish.privacy.audienceTitle', 'מי רואה את הפוסטים שלי'],
      ['social.publish.privacy.locationTitle', 'מיקום'],
      ['social.publish.privacy.park.label', 'שם הפארק על הפוסט'],
      ['social.publish.privacy.park.hint', 'בלי מפה ובלי כתובת'],
      ['social.publish.privacy.route.label', 'קו המסלול על פוסט אירובי'],
      ['social.publish.privacy.route.hint', 'רק צורת הקו, בלי מפה. בלי 200 המטרים הראשונים והאחרונים'],
      ['social.publish.privacy.save', 'שמירה'],
      // ShareImageSheetV2 + share-v2 controls
      ['social.share.title', 'שיתוף לרשתות'],
      ['social.share.subtitle.run', 'ריצה'],
      ['social.share.subtitle.strength', 'אימון כוח'],
      ['social.share.toast.photoError', 'לא הצלחנו לפתוח את התמונה'],
      ['social.share.toast.saved', 'התמונה נשמרה'],
      ['social.share.toast.shareFailed', 'השיתוף לא הצליח'],
      ['social.share.toast.denied', 'אין הרשאה לשמור בגלריה — אפשר לאשר בהגדרות הטלפון'],
      ['social.share.toast.saveFailed', 'השמירה לא הצליחה'],
      ['social.share.stickerInkTitle', 'צבע הסטיקר'],
      ['social.share.backgroundTitle', 'רקע'],
      ['social.share.share', 'שיתוף'],
      ['social.share.saveToGallery', 'שמירה לגלריה'],
      ['social.share.format.label', 'גודל'],
      ['social.share.format.story', 'סטורי'],
      ['social.share.format.square', 'ריבוע'],
      ['social.share.format.sticker', 'סטיקר'],
      ['social.share.ink.white', 'לבן'],
      ['social.share.ink.dark', 'כהה'],
      ['social.share.ink.brand', 'צבעי OUT'],
      ['social.share.ink.hint', 'רקע שקוף — באינסטגרם מדביקים אותו מעל תמונה או סרטון'],
      ['social.share.bg.otherPhoto', 'תמונה אחרת'],
      ['social.share.bg.addPhoto', 'הוספת תמונה'],
      ['social.share.bg.unavailable', 'לא זמינה'],
      ['social.share.bg.yourPhoto', 'התמונה שלך'],
      ['social.share.bg.night', 'לילה'],
      ['social.share.bg.brand', 'צבעי OUT'],
      ['social.share.bg.plain', 'נקי'],
      ['social.share.bg.addPhotoHint', 'אפשר להוסיף תמונה מהאימון — הנתונים יופיעו עליה.'],
      ['social.share.bg.photoFailed', 'את התמונה הזו לא הצלחנו לצרף. אפשר לבחור תמונה מהגלריה.'],
    ];
    for (const [key, old] of cases) expect(t(key), key).toBe(old);
  });

  it('ActivityPanel: timeAgo + renderDynamicMessage (old helpers re-declared)', () => {
    const oldTime = (diff: number) => {
      if (diff < 60) return 'עכשיו';
      if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דק׳`;
      if (diff < 86400) return `לפני ${Math.floor(diff / 3600)} שעות`;
      return `לפני ${Math.floor(diff / 86400)} ימים`;
    };
    const newTime = (diff: number) => {
      if (diff < 60) return t('social.activity.time.now');
      if (diff < 3600) return t('social.activity.time.minutes', { n: String(Math.floor(diff / 60)) });
      if (diff < 86400) return t('social.activity.time.hours', { n: String(Math.floor(diff / 3600)) });
      return t('social.activity.time.days', { n: String(Math.floor(diff / 86400)) });
    };
    for (const diff of [0, 59, 60, 61, 3599, 3600, 7200, 86399, 86400, 2 * 86400, 1234 * 86400, 20745 * 86400])
      expect(newTime(diff)).toBe(oldTime(diff));
    const name = 'נועה';
    const group = 'רצי הירקון';
    expect(t('social.activity.message.highFive', { name })).toBe(`${name} הרים/ה לך ידיים 🤘`);
    expect(t('social.activity.message.groupJoin', { name, group })).toBe(`${name} הצטרף/ה ל-${group}`);
    expect(t('social.activity.message.groupJoinAnon', { group })).toBe(`אווטיר חדש הצטרף ל-${group}`);
  });

  it('FeedPostCard: timeAgo (old helper re-declared) + report target name', () => {
    const oldTime = (mins: number) => {
      if (mins < 1) return 'עכשיו';
      if (mins < 60) return `לפני ${mins} דק׳`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return `לפני ${hrs} שע׳`;
      const days = Math.floor(hrs / 24);
      if (days === 1) return 'אתמול';
      return `לפני ${days} ימים`;
    };
    const newTime = (mins: number) => {
      if (mins < 1) return t('social.post.time.now');
      if (mins < 60) return t('social.post.time.minutes', { n: String(mins) });
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return t('social.post.time.hours', { n: String(hrs) });
      const days = Math.floor(hrs / 24);
      if (days === 1) return t('social.post.time.yesterday');
      return t('social.post.time.days', { n: String(days) });
    };
    for (const mins of [0, 1, 59, 60, 61, 1439, 1440, 2879, 2880, 1500 * 1440, 20745 * 1440]) expect(newTime(mins)).toBe(oldTime(mins));
    expect(t('social.post.reportName', { name: 'נועה' })).toBe(`פוסט של ${'נועה'}`);
  });

  it('FeedPostCardV2: activity / audience selects, the card heading, values ≥ 1000', () => {
    const OLD_ACTIVITY: Record<string, string> = { strength: 'כוח', cardio: 'אירובי', maintenance: 'תחזוקה' };
    const OLD_AUDIENCE: Record<string, string> = { partners: 'שותפים', public: 'כולם', private: 'רק אני' };
    for (const category of ['strength', 'cardio', 'maintenance']) {
      const label = OLD_ACTIVITY[category];
      expect(t('social.post.activity', { category })).toBe(label);
      // old: act.label === 'כוח' ? 'אימון כוח' : `אימון ${act.label}`
      expect(t('social.post.workoutTitle', { category })).toBe(label === 'כוח' ? 'אימון כוח' : `אימון ${label}`);
    }
    for (const audience of ['partners', 'public', 'private']) expect(t('social.post.audience', { audience })).toBe(OLD_AUDIENCE[audience]);
    expect(t('social.post.streak', { days: String(1234) })).toBe(`רצף ${1234} ימים`);
    expect(t('social.post.setDots', { done: String(2), sets: String(4) })).toBe(`${2} מתוך ${4} סטים`);
    expect(t('social.post.paceBars.label', { splits: '5:30, 5:15' })).toBe(`קצב לפי הקפה: ${'5:30, 5:15'}`);
    expect(t('social.post.photoAlt', { name: 'נועה' })).toBe(`תמונה מהאימון של ${'נועה'}`);
    expect(t('social.post.routeLabel', { name: 'נועה' })).toBe(`קו המסלול של ${'נועה'}`);
    expect('5k'.replace('k', t('social.post.segmentKm'))).toBe('5k'.replace('k', ' ק״מ'));
    expect(t('social.post.level', { index: String(4), count: String(12) })).toBe(`שלב ${4} מתוך ${12}`);
    expect(t('social.post.moreExercises', { n: String(1234) })).toBe(`ועוד ${1234} תרגילים`);
    expect(t('social.post.points', { credit: String(1234) })).toBe(`${1234} נקודות`);
    expect(t('social.post.intensity', { level: 'בינונית' })).toBe(`עצימות ${'בינונית'}`);
  });

  it('FeedPublishSheets: summary() (old helper re-declared), every activity, ≥ 1000 minutes', () => {
    const OLD_ACTIVITY: Record<string, string> = { strength: 'כוח', cardio: 'אירובי', maintenance: 'תחזוקה' };
    const oldSummary = (a: string, min: number, km?: number) => {
      const parts = [OLD_ACTIVITY[a], `${min} דק׳`];
      if (km != null) parts.push(`${km.toFixed(1)} ק״מ`);
      return parts.join(' · ');
    };
    const newSummary = (a: string, min: number, km?: number) => {
      const parts = [t('social.publish.activity', { activity: a }), t('social.publish.summary.minutes', { n: String(min) })];
      if (km != null) parts.push(t('social.publish.summary.km', { km: km.toFixed(1) }));
      return parts.join(' · ');
    };
    for (const a of ['strength', 'cardio', 'maintenance'])
      for (const [min, km] of [[31, 5.25], [1200, undefined], [45, 1234.5]] as const) expect(newSummary(a, min, km)).toBe(oldSummary(a, min, km));
  });

  it('ShareImageSheetV2: subtitle() (old helper re-declared)', () => {
    type In = { kind: 'cardio' | 'strength'; durationMinutes: number; distanceKm?: number; programName?: string; title?: string };
    const oldSub = (input: In) => {
      const min = `${Math.round(input.durationMinutes)} דק׳`;
      if (input.kind === 'cardio') return ['ריצה', input.distanceKm ? `${input.distanceKm.toFixed(1)} ק״מ` : null, min].filter(Boolean).join(' · ');
      return ['אימון כוח', input.programName || input.title, min].filter(Boolean).join(' · ');
    };
    const newSub = (input: In) => {
      const min = t('social.share.subtitle.minutes', { n: String(Math.round(input.durationMinutes)) });
      if (input.kind === 'cardio')
        return [t('social.share.subtitle.run'), input.distanceKm ? t('social.share.subtitle.km', { km: input.distanceKm.toFixed(1) }) : null, min]
          .filter(Boolean)
          .join(' · ');
      return [t('social.share.subtitle.strength'), input.programName || input.title, min].filter(Boolean).join(' · ');
    };
    const inputs: In[] = [
      { kind: 'cardio', durationMinutes: 31, distanceKm: 5.25 },
      { kind: 'cardio', durationMinutes: 1234.4 },
      { kind: 'cardio', durationMinutes: 60, distanceKm: 1234.56 },
      { kind: 'strength', durationMinutes: 44.6, programName: 'פלג גוף עליון', title: 'x' },
      { kind: 'strength', durationMinutes: 20, title: 'אימון גב' },
      { kind: 'strength', durationMinutes: 1500 },
    ];
    for (const input of inputs) expect(newSub(input)).toBe(oldSub(input));
  });
});
