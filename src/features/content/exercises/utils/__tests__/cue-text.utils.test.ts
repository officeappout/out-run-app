import { describe, it, expect } from 'vitest';
import {
  pickCueText,
  splitCueText,
  toCueList,
  resolveGenderedText,
  resolveExerciseCues,
} from '../cue-text.utils';

describe('pickCueText', () => {
  it('reads string, {he,en} and {male,female} shapes', () => {
    expect(pickCueText('גב ישר')).toBe('גב ישר');
    expect(pickCueText({ he: 'גב ישר', en: 'Straight back' })).toBe('גב ישר');
    expect(pickCueText({ he: '', en: 'Straight back' })).toBe('Straight back');
    expect(pickCueText({ male: 'עמוד', female: 'עמדי' })).toBe('עמוד');
    expect(pickCueText({ male: 'עמוד', female: 'עמדי' }, 'female')).toBe('עמדי');
    expect(pickCueText({ male: '', female: 'עמדי' }, 'male')).toBe('עמדי');
    expect(pickCueText(null)).toBe('');
    expect(pickCueText(42)).toBe('');
  });
});

describe('splitCueText', () => {
  it('splits a jammed " - " bullet list that starts with a dash', () => {
    expect(splitCueText('- עמדו עם רגל אחת על הספסל - התחילו את התנועה מהעקב - שמרו על ברך יציבה')).toEqual([
      'עמדו עם רגל אחת על הספסל',
      'התחילו את התנועה מהעקב',
      'שמרו על ברך יציבה',
    ]);
  });

  it('strips a leading dash glued to a Hebrew word', () => {
    expect(splitCueText('-במידה וקל, הוסיפו משקל')).toEqual(['במידה וקל, הוסיפו משקל']);
  });

  it('splits glued dash bullets when the line is a list', () => {
    expect(splitCueText('-עמדו ישר -הורידו לאט')).toEqual(['עמדו ישר', 'הורידו לאט']);
  });

  it('does not split prefixed numbers or ranges', () => {
    expect(splitCueText('חתירות ב-30°')).toEqual(['חתירות ב-30°']);
    expect(splitCueText('10-12 חזרות')).toEqual(['10-12 חזרות']);
    expect(splitCueText('10 – 15 חזרות בכל צד')).toEqual(['10 – 15 חזרות בכל צד']);
    expect(splitCueText('push-up רחב')).toEqual(['push-up רחב']);
  });

  it('keeps a single mid-sentence dash as one cue', () => {
    expect(splitCueText('שמרו על גב ישר - זה חשוב')).toEqual(['שמרו על גב ישר - זה חשוב']);
  });

  it('keeps ranges inside a dash list intact', () => {
    expect(splitCueText('- בצעו 10-12 חזרות - חתירות ב-30°')).toEqual([
      'בצעו 10-12 חזרות',
      'חתירות ב-30°',
    ]);
  });

  it('splits on newlines and strips bullets per line', () => {
    expect(splitCueText('• כתפיים למטה\n• בטן אסופה\r\n\n  - נשימה רציפה  ')).toEqual([
      'כתפיים למטה',
      'בטן אסופה',
      'נשימה רציפה',
    ]);
  });

  it('splits "1." / "1)" numbering', () => {
    expect(splitCueText('1. עמדו ישר 2. הורידו לאט 3. עלו בכוח')).toEqual([
      'עמדו ישר',
      'הורידו לאט',
      'עלו בכוח',
    ]);
    expect(splitCueText('1) עמדו ישר\n2) הורידו לאט')).toEqual(['עמדו ישר', 'הורידו לאט']);
  });

  it('does not split decimals or a lone trailing number', () => {
    expect(splitCueText('החזיקו 1.5 שניות למטה')).toEqual(['החזיקו 1.5 שניות למטה']);
    expect(splitCueText('- רדו עד 3. - עלו')).toEqual(['רדו עד 3.', 'עלו']);
  });

  it('always splits dot bullets, even mid-line', () => {
    expect(splitCueText('כתפיים למטה • בטן אסופה')).toEqual(['כתפיים למטה', 'בטן אסופה']);
  });

  it('removes zero-width / bidi marks and collapses spaces', () => {
    expect(splitCueText('‏גב   ישר​')).toEqual(['גב ישר']);
  });

  it('drops empty and punctuation-only pieces', () => {
    expect(splitCueText('  ')).toEqual([]);
    expect(splitCueText('- \n - ')).toEqual([]);
    expect(splitCueText('...')).toEqual([]);
  });
});

describe('toCueList', () => {
  it('handles string[]', () => {
    expect(toCueList(['גב ישר', 'בטן אסופה'])).toEqual(['גב ישר', 'בטן אסופה']);
  });

  it('handles {he,en}[] (the normalized method shape)', () => {
    expect(toCueList([{ he: 'גב ישר', en: 'Straight back' }, { he: '', en: 'Brace' }])).toEqual([
      'גב ישר',
      'Brace',
    ]);
  });

  it('handles {male,female}[] by gender', () => {
    expect(toCueList([{ male: 'עמוד ישר', female: 'עמדי ישר' }], 'female')).toEqual(['עמדי ישר']);
  });

  it('splits a single jammed item and de-duplicates', () => {
    expect(toCueList([{ he: '- גב ישר - בטן אסופה', en: '' }, 'גב ישר'])).toEqual(['גב ישר', 'בטן אסופה']);
  });

  it('accepts a bare string and empty inputs', () => {
    expect(toCueList('1. אחד 2. שתיים')).toEqual(['אחד', 'שתיים']);
    expect(toCueList(undefined)).toEqual([]);
    expect(toCueList(null)).toEqual([]);
    expect(toCueList([])).toEqual([]);
  });
});

describe('resolveGenderedText', () => {
  it('resolves every notificationText shape without splitting', () => {
    expect(resolveGenderedText('הכינו את הגומייה - לחץ בינוני')).toBe('הכינו את הגומייה - לחץ בינוני');
    expect(resolveGenderedText({ he: 'הכינו ספסל', en: 'Get a bench' })).toBe('הכינו ספסל');
    expect(resolveGenderedText({ male: 'הכן ספסל', female: 'הכיני ספסל' }, 'female')).toBe('הכיני ספסל');
    expect(resolveGenderedText({ male: 'הכן ספסל', female: 'הכיני ספסל' })).toBe('הכן ספסל');
    expect(resolveGenderedText({ he: ' ', en: '' })).toBe('');
    expect(resolveGenderedText(undefined)).toBe('');
  });
});

describe('resolveExerciseCues', () => {
  const exercise = {
    content: {
      specificCues: ['רמז ברמת התרגיל'],
      highlights: ['דגש ברמת התרגיל'],
    },
  };

  it('prefers method specificCues and keeps method highlights as tips', () => {
    const r = resolveExerciseCues(exercise, {
      specificCues: [{ he: 'גב ישר', en: '' }, { he: 'בטן אסופה', en: '' }],
      highlights: [{ he: 'מצוין לגב', en: '' }, { he: 'גב ישר', en: '' }],
    });
    expect(r.highlights).toEqual(['גב ישר', 'בטן אסופה']);
    expect(r.tips).toEqual(['מצוין לגב']);
  });

  it('splits a jammed method cue', () => {
    const r = resolveExerciseCues(exercise, {
      specificCues: [{ he: '- עמדו עם רגל אחת - התחילו מהעקב', en: '' }],
    });
    expect(r.highlights).toEqual(['עמדו עם רגל אחת', 'התחילו מהעקב']);
  });

  it('falls back to method highlights when there are no cues', () => {
    const r = resolveExerciseCues(exercise, { specificCues: [], highlights: ['מצוין לגב'] });
    expect(r).toEqual({ highlights: ['מצוין לגב'], tips: [] });
  });

  it('falls back to exercise content when the method has nothing', () => {
    expect(resolveExerciseCues(exercise, { specificCues: [{ he: '', en: '' }], highlights: [] }).highlights)
      .toEqual(['רמז ברמת התרגיל']);
    expect(resolveExerciseCues({ content: { highlights: ['דגש ברמת התרגיל'] } }, null).highlights)
      .toEqual(['דגש ברמת התרגיל']);
  });

  it('never splits content.instructions into fake cues', () => {
    const r = resolveExerciseCues({ content: { instructions: { he: 'משפט ראשון. משפט שני.' } } } as never, undefined);
    expect(r).toEqual({ highlights: [], tips: [] });
  });
});

describe('gender resolution follows profile.core.gender (g())', () => {
  it("'other' and missing gender read the male form", () => {
    expect(resolveGenderedText({ male: 'הכן ספסל', female: 'הכיני ספסל' }, 'other')).toBe('הכן ספסל');
    expect(resolveGenderedText({ male: 'הכן ספסל', female: 'הכיני ספסל' }, null)).toBe('הכן ספסל');
    expect(toCueList([{ male: 'עמוד ישר', female: 'עמדי ישר' }], 'other')).toEqual(['עמוד ישר']);
  });
});
