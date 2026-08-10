// src/lib/data/israel-locations.ts

export type LocationType = 'city' | 'regional_council' | 'local_council' | 'neighborhood' | 'settlement';

export interface SubLocation {
  id: string;
  name: string;
  type: LocationType;
}

export interface IsraeliLocation {
  id: string;
  name: string;
  type: LocationType;
  population: number;
  subLocations?: SubLocation[];
}

export const ISRAELI_LOCATIONS: IsraeliLocation[] = [
  // ============================================================
  // 1. ערי הענק והמטרופולין (חלוקה מפורטת לשכונות)
  // ============================================================
  {
    id: 'jerusalem',
    name: 'ירושלים',
    type: 'city',
    population: 985000,
    subLocations: [
      { id: 'jr-ramot', name: 'רמות', type: 'neighborhood' },
      { id: 'jr-pisgat-zeev', name: 'פסגת זאב', type: 'neighborhood' },
      { id: 'jr-gilo', name: 'גילה', type: 'neighborhood' },
      { id: 'jr-har-homa', name: 'הר חומה', type: 'neighborhood' },
      { id: 'jr-talpiot', name: 'תלפיות / ארנונה', type: 'neighborhood' },
      { id: 'jr-katamon', name: 'גוננים (קטמונים)', type: 'neighborhood' },
      { id: 'jr-beit-hakerem', name: 'בית הכרם', type: 'neighborhood' },
      { id: 'jr-kiryat-yovel', name: 'קרית יובל', type: 'neighborhood' },
      { id: 'jr-malcha', name: 'מלחה', type: 'neighborhood' },
      { id: 'jr-rehavia', name: 'רחביה', type: 'neighborhood' },
      { id: 'jr-nachlaot', name: 'נחלאות', type: 'neighborhood' },
      { id: 'jr-city-center', name: 'מרכז העיר', type: 'neighborhood' },
      { id: 'jr-neve-yaakov', name: 'נווה יעקב', type: 'neighborhood' },
      { id: 'jr-old-city', name: 'העיר העתיקה', type: 'neighborhood' }
    ]
  },
  {
    id: 'tel-aviv',
    name: 'תל אביב-יפו',
    type: 'city',
    population: 475000,
    subLocations: [
      { id: 'ta-north-old', name: 'הצפון הישן', type: 'neighborhood' },
      { id: 'ta-north-new', name: 'הצפון החדש', type: 'neighborhood' },
      { id: 'ta-ramat-aviv', name: 'רמת אביב', type: 'neighborhood' },
      { id: 'ta-bavli', name: 'בבלי', type: 'neighborhood' },
      { id: 'ta-tzahala', name: 'צהלה / המשתלה', type: 'neighborhood' },
      { id: 'ta-lev-hair', name: 'לב העיר', type: 'neighborhood' },
      { id: 'ta-florentin', name: 'פלורנטין', type: 'neighborhood' },
      { id: 'ta-neve-tzedek', name: 'נווה צדק', type: 'neighborhood' },
      { id: 'ta-yad-elyahu', name: 'יד אליהו', type: 'neighborhood' },
      { id: 'ta-hatikva', name: 'שכונת התקווה', type: 'neighborhood' },
      { id: 'ta-shapira', name: 'שפירא', type: 'neighborhood' },
      { id: 'ta-jaffa', name: 'יפו', type: 'neighborhood' }
    ]
  },
  {
    id: 'haifa',
    name: 'חיפה',
    type: 'city',
    population: 290000,
    subLocations: [
      { id: 'hf-carmel', name: 'מרכז הכרמל', type: 'neighborhood' },
      { id: 'hf-ahuza', name: 'אחוזה', type: 'neighborhood' },
      { id: 'hf-denya', name: 'דניה', type: 'neighborhood' },
      { id: 'hf-hadar', name: 'הדר', type: 'neighborhood' },
      { id: 'hf-neve-shaanan', name: 'נווה שאנן', type: 'neighborhood' },
      { id: 'hf-bat-galim', name: 'בת גלים', type: 'neighborhood' },
      { id: 'hf-kiryat-haim', name: 'קרית חיים', type: 'neighborhood' },
      { id: 'hf-kiryat-eliezer', name: 'קרית אליעזר', type: 'neighborhood' }
    ]
  },
  {
    id: 'rishon-lezion',
    name: 'ראשון לציון',
    type: 'city',
    population: 260000,
    subLocations: [
      { id: 'rl-west', name: 'מערב ראשון', type: 'neighborhood' },
      { id: 'rl-cramim', name: 'כרמים', type: 'neighborhood' },
      { id: 'rl-center', name: 'מרכז העיר', type: 'neighborhood' },
      { id: 'rl-east', name: 'מזרח ראשון', type: 'neighborhood' },
      { id: 'rl-ramat-eliyahu', name: 'רמת אליהו', type: 'neighborhood' },
      { id: 'rl-nahalat', name: 'נחלת יהודה', type: 'neighborhood' },
      // ── OSM import, 10.08.2026 (Overpass place=suburb/neighbourhood within
      // Rishon LeZion's administrative boundary) — 34 real named neighborhoods,
      // reviewed + approved by David. קריית כרמים deliberately excluded (same
      // real place as the existing rl-cramim entry above, not duplicated). ──
      { id: 'rl-abramovich', name: 'אברמוביץ', type: 'neighborhood' },
      { id: 'rl-bnot-hil', name: 'בנות חיל', type: 'neighborhood' },
      { id: 'rl-gordon', name: 'גורדון', type: 'neighborhood' },
      { id: 'rl-hairisim', name: 'האירוסים', type: 'neighborhood' },
      { id: 'rl-harakafot', name: 'הרקפות', type: 'neighborhood' },
      { id: 'rl-hashomer', name: 'השומר', type: 'neighborhood' },
      { id: 'rl-kalaniyot', name: 'כלניות', type: 'neighborhood' },
      { id: 'rl-katznelson', name: 'כצנלסון', type: 'neighborhood' },
      { id: 'rl-kfar-arye', name: 'כפר אריה', type: 'neighborhood' },
      { id: 'rl-kidmat-rishon', name: 'קדמת ראשון', type: 'neighborhood' },
      { id: 'rl-kiriyat-ganim', name: 'קרית גנים', type: 'neighborhood' },
      { id: 'rl-kiryat-haleom', name: 'קריית הלאום', type: 'neighborhood' },
      { id: 'rl-kiryat-hatanei-pras-nobel', name: 'קרית חתני פרס נובל', type: 'neighborhood' },
      { id: 'rl-kiryat-rishon', name: 'קריית ראשון', type: 'neighborhood' },
      { id: 'rl-kiryat-simha', name: 'קרית שמחה', type: 'neighborhood' },
      { id: 'rl-marom-rishon', name: 'מרום ראשון', type: 'neighborhood' },
      { id: 'rl-mishor-hanof', name: 'מישור הנוף', type: 'neighborhood' },
      { id: 'rl-narkisim', name: 'נרקיסים', type: 'neighborhood' },
      { id: 'rl-neot-eshelim', name: 'נאות אשלים', type: 'neighborhood' },
      { id: 'rl-neot-shikma', name: 'נאות שיקמה', type: 'neighborhood' },
      { id: 'rl-neurim', name: 'נעורים', type: 'neighborhood' },
      { id: 'rl-neve-dekalim', name: 'נווה דקלים', type: 'neighborhood' },
      { id: 'rl-neve-hadarim', name: 'נווה הדרים', type: 'neighborhood' },
      { id: 'rl-neve-hilel', name: 'נווה הלל', type: 'neighborhood' },
      { id: 'rl-neve-hof', name: 'נווה חוף', type: 'neighborhood' },
      { id: 'rl-neve-yam', name: 'נווה ים', type: 'neighborhood' },
      { id: 'rl-nuriyot', name: 'נוריות', type: 'neighborhood' },
      { id: 'rl-rambam', name: 'רמב"ם', type: 'neighborhood' },
      { id: 'rl-remez', name: 'רמז', type: 'neighborhood' },
      { id: 'rl-revivim', name: 'רביבים', type: 'neighborhood' },
      { id: 'rl-rishonim', name: 'ראשונים', type: 'neighborhood' },
      { id: 'rl-shaar-hayam', name: 'שער הים', type: 'neighborhood' },
      { id: 'rl-shikuney-hamizrah', name: 'שיכוני המזרח', type: 'neighborhood' },
      { id: 'rl-tzamarot', name: 'צמרות', type: 'neighborhood' }
    ]
  },
  {
    id: 'petah-tikva',
    name: 'פתח תקווה',
    type: 'city',
    population: 256000,
    subLocations: [
      { id: 'pt-em-hamoshavot', name: 'אם המושבות', type: 'neighborhood' },
      { id: 'pt-kfar-ganim', name: 'כפר גנים', type: 'neighborhood' },
      { id: 'pt-hadar-ganim', name: 'הדר גנים', type: 'neighborhood' },
      { id: 'pt-neve-gan', name: 'נווה גן', type: 'neighborhood' },
      { id: 'pt-center', name: 'מרכז העיר', type: 'neighborhood' },
      { id: 'pt-ein-ganim', name: 'עין גנים', type: 'neighborhood' },
      { id: 'pt-shaaria', name: 'שעריה', type: 'neighborhood' }
    ]
  },
  {
    id: 'ashdod',
    name: 'אשדוד',
    type: 'city',
    population: 227000,
    subLocations: [
      { id: 'ad-city', name: 'הסיטי', type: 'neighborhood' },
      { id: 'ad-marina', name: 'המרינה', type: 'neighborhood' },
      { id: 'ad-a', name: 'רובע א׳', type: 'neighborhood' },
      { id: 'ad-d', name: 'רובע ד׳', type: 'neighborhood' },
      { id: 'ad-yud-nun', name: 'רובע י״א / י״ב', type: 'neighborhood' },
      { id: 'ad-tu', name: 'רובע ט״ו', type: 'neighborhood' }
    ]
  },
  {
    id: 'netanya',
    name: 'נתניה',
    type: 'city',
    population: 230000,
    subLocations: [
      { id: 'nt-ir-yamim', name: 'עיר ימים', type: 'neighborhood' },
      { id: 'nt-poleg', name: 'רמת פולג', type: 'neighborhood' },
      { id: 'nt-kiryat-hasharon', name: 'קרית השרון', type: 'neighborhood' },
      { id: 'nt-agami', name: 'אגמים', type: 'neighborhood' },
      { id: 'nt-center', name: 'מרכז העיר', type: 'neighborhood' },
      { id: 'nt-dora', name: 'רמת ידין (דורה)', type: 'neighborhood' }
    ]
  },
  {
    id: 'beer-sheva',
    name: 'באר שבע',
    type: 'city',
    population: 215000,
    subLocations: [
      { id: 'bs-ramot', name: 'שכונת רמות', type: 'neighborhood' },
      { id: 'bs-neve-zeev', name: 'נווה זאב', type: 'neighborhood' },
      { id: 'bs-nahal-ashan', name: 'נחל עשן', type: 'neighborhood' },
      { id: 'bs-d', name: 'שכונה ד׳', type: 'neighborhood' },
      { id: 'bs-b', name: 'שכונה ב׳', type: 'neighborhood' },
      { id: 'bs-old-city', name: 'העיר העתיקה', type: 'neighborhood' }
    ]
  },
  {
    id: 'holon',
    name: 'חולון',
    type: 'city',
    population: 198000,
    subLocations: [
      { id: 'ho-kiryat-sharett', name: 'קרית שרת', type: 'neighborhood' },
      { id: 'ho-agrobank', name: 'אגרובנק', type: 'neighborhood' },
      { id: 'ho-neot-rachel', name: 'נאות רחל', type: 'neighborhood' },
      { id: 'ho-tel-giborim', name: 'תל גיבורים', type: 'neighborhood' },
      { id: 'ho-kiryat-bin-gurion', name: 'קרית בן גוריון', type: 'neighborhood' }
    ]
  },
  {
    id: 'bnei-brak',
    name: 'בני ברק',
    type: 'city',
    population: 220000,
    subLocations: [
      { id: 'bb-pardes-katz', name: 'פרדס כץ', type: 'neighborhood' },
      { id: 'bb-merkaz', name: 'מרכז העיר', type: 'neighborhood' },
      { id: 'bb-vizhnitz', name: 'שיכון ויז׳ניץ', type: 'neighborhood' }
    ]
  },
  {
    id: 'ramat-gan',
    name: 'רמת גן',
    type: 'city',
    population: 176000,
    subLocations: [
      { id: 'rg-marom-nave', name: 'מרום נווה', type: 'neighborhood' },
      { id: 'rg-ramat-hen', name: 'רמת חן', type: 'neighborhood' },
      { id: 'rg-center', name: 'מרכז העיר', type: 'neighborhood' },
      { id: 'rg-bursa', name: 'מתחם הבורסה', type: 'neighborhood' },
      { id: 'rg-krinitsi', name: 'קריניצי', type: 'neighborhood' }
    ]
  },
  {
    id: 'ashkelon',
    name: 'אשקלון',
    type: 'city',
    population: 155000,
    subLocations: [
      { id: 'as-barnea', name: 'ברנע', type: 'neighborhood' },
      { id: 'as-afridar', name: 'אפרידר', type: 'neighborhood' },
      { id: 'as-marina', name: 'המרינה', type: 'neighborhood' },
      { id: 'as-agamim', name: 'אגמים', type: 'neighborhood' },
      { id: 'as-city', name: 'הסיטי', type: 'neighborhood' }
    ]
  },
  {
    id: 'rehovot',
    name: 'רחובות',
    type: 'city',
    population: 152000,
    subLocations: [
      { id: 'rv-science', name: 'פארק המדע', type: 'neighborhood' },
      { id: 'rv-new', name: 'רחובות החדשה', type: 'neighborhood' },
      { id: 'rv-dutch', name: 'רחובות ההולנדית', type: 'neighborhood' },
      { id: 'rv-center', name: 'מרכז העיר', type: 'neighborhood' },
      { id: 'rv-shaarayim', name: 'שעריים', type: 'neighborhood' }
    ]
  },
  {
    id: 'bat-yam',
    name: 'בת ים',
    type: 'city',
    population: 129000,
    subLocations: [
      { id: 'by-sea', name: 'טיילת הים', type: 'neighborhood' },
      { id: 'by-ramat-yosef', name: 'רמת יוסף', type: 'neighborhood' },
      { id: 'by-ramat-hanasi', name: 'רמת הנשיא', type: 'neighborhood' }
    ]
  },
  {
    id: 'beit-shemesh',
    name: 'בית שמש',
    type: 'city',
    population: 160000,
    subLocations: [
      { id: 'bsh-rama-a', name: 'רמת בית שמש א׳', type: 'neighborhood' },
      { id: 'bsh-rama-b', name: 'רמת בית שמש ב׳', type: 'neighborhood' },
      { id: 'bsh-rama-c', name: 'רמת בית שמש ג׳', type: 'neighborhood' },
      { id: 'bsh-rama-d', name: 'רמת בית שמש ד׳', type: 'neighborhood' },
      { id: 'bsh-vatika', name: 'העיר הוותיקה', type: 'neighborhood' }
    ]
  },
  {
    id: 'kfar-saba',
    name: 'כפר סבא',
    type: 'city',
    population: 102000,
    subLocations: [
      { id: 'ks-green', name: 'השכונה הירוקה', type: 'neighborhood' },
      { id: 'ks-hadarim', name: 'שכונת הדרים', type: 'neighborhood' },
      { id: 'ks-center', name: 'מרכז העיר', type: 'neighborhood' },
      { id: 'ks-aliyah', name: 'שכונת עלייה', type: 'neighborhood' }
    ]
  },
  {
    id: 'herzliya',
    name: 'הרצליה',
    type: 'city',
    population: 108000,
    subLocations: [
      { id: 'hz-pituach', name: 'הרצליה פיתוח', type: 'neighborhood' },
      { id: 'hz-green', name: 'הרצליה הירוקה', type: 'neighborhood' },
      { id: 'hz-center', name: 'מרכז העיר', type: 'neighborhood' },
      { id: 'hz-gan-rashel', name: 'גן רש״ל', type: 'neighborhood' },
      { id: 'hz-glil-yam', name: 'גליל ים', type: 'neighborhood' }
    ]
  },
  {
    id: 'hadera',
    name: 'חדרה',
    type: 'city',
    population: 104000,
    subLocations: [
      { id: 'hd-ein-hayam', name: 'עין הים', type: 'neighborhood' },
      { id: 'hd-givat-olga', name: 'גבעת אולגה', type: 'neighborhood' },
      { id: 'hd-beit-eliezer', name: 'בית אליעזר', type: 'neighborhood' },
      { id: 'hd-center', name: 'מרכז העיר', type: 'neighborhood' },
      { id: 'hd-weizmann', name: 'שכונת ויצמן', type: 'neighborhood' }
    ]
  },
  {
    id: 'modiin',
    name: 'מודיעין-מכבים-רעות',
    type: 'city',
    population: 100000,
    subLocations: [
      { id: 'md-buchman', name: 'מוריה (בוכמן)', type: 'neighborhood' },
      { id: 'md-shimshoni', name: 'המגינים (שמשוני)', type: 'neighborhood' },
      { id: 'md-avnei-chen', name: 'אבני חן (קייזר)', type: 'neighborhood' },
      { id: 'md-nofim', name: 'נופים', type: 'neighborhood' },
      { id: 'md-reut', name: 'רעות', type: 'neighborhood' },
      { id: 'md-maccabim', name: 'מכבים', type: 'neighborhood' }
    ]
  },
  {
    id: 'lod',
    name: 'לוד',
    type: 'city',
    population: 86000,
    subLocations: [
      { id: 'ld-ganei-yaar', name: 'גני יער', type: 'neighborhood' },
      { id: 'ld-ganei-aviv', name: 'גני אביב', type: 'neighborhood' },
      { id: 'ld-neve-zait', name: 'נווה זית', type: 'neighborhood' },
      { id: 'ld-center', name: 'מרכז העיר', type: 'neighborhood' }
    ]
  },
  {
    id: 'raanana',
    name: 'רעננה',
    type: 'city',
    population: 80000,
    subLocations: [
      { id: 'rn-neve-zemer', name: 'נווה זמר', type: 'neighborhood' },
      { id: 'rn-2005', name: 'שכונת 2005', type: 'neighborhood' },
      { id: 'rn-lev-hapark', name: 'לב הפארק', type: 'neighborhood' },
      { id: 'rn-center', name: 'מרכז העיר', type: 'neighborhood' }
    ]
  },
  {
    id: 'ramla',
    name: 'רמלה',
    type: 'city',
    population: 80000,
    subLocations: [
      { id: 'rm-kiryat-haomanim', name: 'קרית האומנים', type: 'neighborhood' },
      { id: 'rm-neot-shamir', name: 'נאות שמיר', type: 'neighborhood' },
      { id: 'rm-center', name: 'מרכז העיר', type: 'neighborhood' }
    ]
  },
  {
    id: 'rosh-haayin',
    name: 'ראש העין',
    type: 'city',
    population: 74000,
    subLocations: [
      { id: 'rh-psagot', name: 'פסגות אפק', type: 'neighborhood' },
      { id: 'rh-neve-afek', name: 'נווה אפק', type: 'neighborhood' },
      { id: 'rh-givat-tal', name: 'גבעת טל', type: 'neighborhood' },
      { id: 'rh-vatika', name: 'העיר הוותיקה', type: 'neighborhood' }
    ]
  },
  {
    id: 'hod-hasharon',
    name: 'הוד השרון',
    type: 'city',
    population: 66000,
    subLocations: [
      { id: 'hh-1200', name: 'מתחם 1200', type: 'neighborhood' },
      { id: 'hh-magdiel', name: 'מגדיאל', type: 'neighborhood' },
      { id: 'hh-ramatayim', name: 'רמתיים', type: 'neighborhood' },
      { id: 'hh-green', name: 'הפארק הירוק', type: 'neighborhood' }
    ]
  },
  {
    id: 'kiryat-gat',
    name: 'קרית גת',
    type: 'city',
    population: 66000,
    subLocations: [
      { id: 'kg-carmei-gat', name: 'כרמי גת', type: 'neighborhood' },
      { id: 'kg-center', name: 'מרכז העיר', type: 'neighborhood' }
    ]
  },
  {
    id: 'nahariya',
    name: 'נהריה',
    type: 'city',
    population: 64000,
    subLocations: [
      { id: 'nh-ein-sara', name: 'עין שרה', type: 'neighborhood' },
      { id: 'nh-nahar-yarok', name: 'נהריה הירוקה', type: 'neighborhood' },
      { id: 'nh-center', name: 'מרכז העיר', type: 'neighborhood' }
    ]
  },
  {
    id: 'afula',
    name: 'עפולה',
    type: 'city',
    population: 62000,
    subLocations: [
      { id: 'af-rova-yizrael', name: 'רובע יזרעאל', type: 'neighborhood' },
      { id: 'af-illit', name: 'עפולה עילית', type: 'neighborhood' },
      { id: 'af-givat-hamoreh', name: 'גבעת המורה', type: 'neighborhood' },
      { id: 'af-center', name: 'מרכז העיר', type: 'neighborhood' }
    ]
  },
  {
    id: 'kiryat-ata',
    name: 'קרית אתא',
    type: 'city',
    population: 61000,
    subLocations: [
      { id: 'ka-givat-ram', name: 'גבעת רם', type: 'neighborhood' },
      { id: 'ka-givat-tal', name: 'גבעת טל', type: 'neighborhood' },
      { id: 'ka-center', name: 'מרכז העיר', type: 'neighborhood' }
    ]
  },
  {
    id: 'yavne',
    name: 'יבנה',
    type: 'city',
    population: 57000,
    subLocations: [
      { id: 'yv-neot-shamir', name: 'נאות שמיר', type: 'neighborhood' },
      { id: 'yv-green', name: 'השכונה הירוקה (נאות רבין)', type: 'neighborhood' },
      { id: 'yv-center', name: 'מרכז העיר', type: 'neighborhood' }
    ]
  },
  {
    id: 'eilat',
    name: 'אילת',
    type: 'city',
    population: 53000,
    subLocations: [
      { id: 'ei-shaham', name: 'שחמון', type: 'neighborhood' },
      { id: 'ei-arava', name: 'ערבה', type: 'neighborhood' },
      { id: 'ei-ganim', name: 'גנים', type: 'neighborhood' }
    ]
  },
  {
    id: 'nes-ziona',
    name: 'נס ציונה',
    type: 'city',
    population: 50000,
    subLocations: [
      { id: 'nz-argaman', name: 'ארגמן', type: 'neighborhood' },
      { id: 'nz-mali', name: 'שמורת מליבו', type: 'neighborhood' },
      { id: 'nz-lev', name: 'לב המושבה', type: 'neighborhood' }
    ]
  },

  // ============================================================
  // 2. ערים ומועצות מקומיות (ללא פירוט שכונות - יחידה אחת)
  // ============================================================
  { id: 'rahat', name: 'רהט', type: 'city', population: 81000 },
  { id: 'umm-al-fahm', name: 'אום אל-פחם', type: 'city', population: 59000 },
  { id: 'nazareth', name: 'נצרת', type: 'city', population: 78000 },
  { id: 'akko', name: 'עכו', type: 'city', population: 51000 },
  { id: 'elad', name: 'אלעד', type: 'city', population: 50000 },
  { id: 'ramat-hasharon', name: 'רמת השרון', type: 'city', population: 48000 },
  { id: 'karmiel', name: 'כרמיאל', type: 'city', population: 47000 },
  { id: 'kiryat-motzkin', name: 'קרית מוצקין', type: 'city', population: 48000 },
  { id: 'tayibe', name: 'טייבה', type: 'city', population: 46000 },
  { id: 'kiryat-bialik', name: 'קרית ביאליק', type: 'city', population: 45000 },
  { id: 'kiryat-ono', name: 'קרית אונו', type: 'city', population: 43000 },
  { id: 'kiryat-yam', name: 'קרית ים', type: 'city', population: 41000 },
  { id: 'or-yehuda', name: 'אור יהודה', type: 'city', population: 38000 },
  { id: 'maale-adumim', name: 'מעלה אדומים', type: 'city', population: 38000 },
  { id: 'dimona', name: 'דימונה', type: 'city', population: 37000 },
  { id: 'ofakim', name: 'אופקים', type: 'city', population: 36000 },
  { id: 'netivot', name: 'נתיבות', type: 'city', population: 45000 },
  {
    id: 'sderot',
    name: 'שדרות',
    type: 'city',
    population: 33000,
    subLocations: [
      { id: 'sderot-naot-hanasi',    name: 'נאות הנשיא (הוורד)',      type: 'neighborhood' },
      { id: 'sderot-naot-aviv',      name: 'נאות אביב (ניר עם)',      type: 'neighborhood' },
      { id: 'sderot-kalaniyot',      name: 'שכונת הכלניות',           type: 'neighborhood' },
      { id: 'sderot-naot-neviim',    name: 'נאות הנביאים',            type: 'neighborhood' },
      { id: 'sderot-naot-rabin',     name: "נאות רבין (מ'3)",        type: 'neighborhood' },
      { id: 'sderot-achuzah',        name: 'שכונת האחוזה',            type: 'neighborhood' },
      { id: 'sderot-naot-shikma',    name: 'נאות השקמה',              type: 'neighborhood' },
      { id: 'sderot-musica',         name: 'שכונת המוזיקה',           type: 'neighborhood' },
      { id: 'sderot-naot-eshkol',    name: 'נאות אשכול',              type: 'neighborhood' },
      { id: 'sderot-naot-dekel',     name: 'נאות הדקל',               type: 'neighborhood' },
      { id: 'sderot-meysadim',       name: 'שכונת המייסדים',          type: 'neighborhood' },
      { id: 'sderot-bapark',         name: 'שכונת שדרות בפארק',       type: 'neighborhood' },
      { id: 'sderot-bostanaim',      name: 'שכונת הבוסתנים',          type: 'neighborhood' },
      { id: 'sderot-bengurion',      name: 'בן גוריון (קסדור)',        type: 'neighborhood' },
    ],
  },
  { id: 'givat-shmuel', name: 'גבעת שמואל', type: 'city', population: 29000 },
  { id: 'tiberias', name: 'טבריה', type: 'city', population: 48000 },
  { id: 'safed', name: 'צפת', type: 'city', population: 38000 },
  { id: 'shoham', name: 'שוהם', type: 'local_council', population: 22000 },
  { id: 'mevaseret-zion', name: 'מבשרת ציון', type: 'local_council', population: 25000 },
  { id: 'gedera', name: 'גדרה', type: 'local_council', population: 30000 },
  { id: 'gan-yavne', name: 'גן יבנה', type: 'local_council', population: 24000 },
  { id: 'zichron-yaakov', name: 'זכרון יעקב', type: 'local_council', population: 24000 },
  { id: 'ariel', name: 'אריאל', type: 'city', population: 20000 },
  { id: 'beitar-illit', name: 'ביתר עילית', type: 'city', population: 65000 },
  { id: 'yokneam-illit', name: 'יקנעם עילית', type: 'city', population: 24000 },
  { id: 'arad', name: 'ערד', type: 'city', population: 28000 },
  { id: 'migdal-haemek', name: 'מגדל העמק', type: 'city', population: 27000 },
  { id: 'nesher', name: 'נשר', type: 'city', population: 24000 },
  { id: 'kiryat-shmona', name: 'קרית שמונה', type: 'city', population: 22000 },
  { id: 'tirah', name: 'טירה', type: 'city', population: 28000 },
  { id: 'tamra', name: 'טמרה', type: 'city', population: 36000 },
  { id: 'sakhnin', name: 'סח׳נין', type: 'city', population: 33000 },
  { id: 'baqa-al-gharbiyye', name: 'באקה אל-גרבייה', type: 'city', population: 31000 },
  { id: 'pardes-hanna', name: 'פרדס חנה-כרכור', type: 'local_council', population: 45000 },
  { id: 'kadima-zoran', name: 'קדימה-צורן', type: 'local_council', population: 23000 },
  { id: 'kfar-yona', name: 'כפר יונה', type: 'city', population: 29000 },

  // ============================================================
  // 3. מועצות אזוריות (עם רשימת יישובים לצורך B2G)
  // ============================================================
  {
    id: 'emek-hefer',
    name: 'מועצה אזורית עמק חפר',
    type: 'regional_council',
    population: 43000,
    subLocations: [
      { id: 'eh-bat-hefer', name: 'בת חפר', type: 'settlement' },
      { id: 'eh-vitkin', name: 'כפר ויתקין', type: 'settlement' },
      { id: 'eh-michmoret', name: 'מכמורת', type: 'settlement' },
      { id: 'eh-avihayil', name: 'אביחיל', type: 'settlement' },
      { id: 'eh-maabarot', name: 'קיבוץ מעברות', type: 'settlement' },
      { id: 'eh-mishmar-hasharon', name: 'קיבוץ משמר השרון', type: 'settlement' },
      { id: 'eh-ein-hahoresh', name: 'קיבוץ עין החורש', type: 'settlement' }
    ]
  },
  {
    id: 'mateh-yehuda',
    name: 'מועצה אזורית מטה יהודה',
    type: 'regional_council',
    population: 62000,
    subLocations: [
      { id: 'my-tzur-hadassah', name: 'צור הדסה', type: 'settlement' },
      { id: 'my-tzora', name: 'קיבוץ צרעה', type: 'settlement' },
      { id: 'my-eshtaol', name: 'מושב אשתאול', type: 'settlement' },
      { id: 'my-shoresh', name: 'מושב שורש', type: 'settlement' },
      { id: 'my-nes-harim', name: 'נס הרים', type: 'settlement' },
      { id: 'my-nehusha', name: 'נחושה', type: 'settlement' }
    ]
  },
  {
    id: 'drom-hasharon',
    name: 'מועצה אזורית דרום השרון',
    type: 'regional_council',
    population: 34000,
    subLocations: [
      { id: 'dh-nir-eliyahu', name: 'קיבוץ ניר אליהו', type: 'settlement' },
      { id: 'dh-eyal', name: 'קיבוץ אייל', type: 'settlement' },
      { id: 'dh-hagor', name: 'מושב חגור', type: 'settlement' },
      { id: 'dh-matan', name: 'מתן', type: 'settlement' },
      { id: 'dh-zur-natan', name: 'צור נתן', type: 'settlement' }
    ]
  },
  {
    id: 'hof-hasharon',
    name: 'מועצה אזורית חוף השרון',
    type: 'regional_council',
    population: 15000,
    subLocations: [
      { id: 'hhs-shefayim', name: 'קיבוץ שפיים', type: 'settlement' },
      { id: 'hhs-gaash', name: 'קיבוץ געש', type: 'settlement' },
      { id: 'hhs-yakum', name: 'קיבוץ יקום', type: 'settlement' },
      { id: 'hhs-rishpon', name: 'מושב רשפון', type: 'settlement' },
      { id: 'hhs-udim', name: 'מושב אודים', type: 'settlement' },
      { id: 'hhs-tel-yitzhak', name: 'קיבוץ תל יצחק', type: 'settlement' }
    ]
  },
  {
    id: 'emek-yizrael',
    name: 'מועצה אזורית עמק יזרעאל',
    type: 'regional_council',
    population: 40000,
    subLocations: [
      { id: 'ey-nahalal', name: 'מושב נהלל', type: 'settlement' },
      { id: 'ey-mishmar-haemek', name: 'קיבוץ משמר העמק', type: 'settlement' },
      { id: 'ey-ifat', name: 'קיבוץ יפעת', type: 'settlement' },
      { id: 'ey-genigar', name: 'קיבוץ גניגר', type: 'settlement' },
      { id: 'ey-balfouria', name: 'בלפוריה', type: 'settlement' }
    ]
  },
  {
    id: 'misgav',
    name: 'מועצה אזורית משגב',
    type: 'regional_council',
    population: 30000,
    subLocations: [
      { id: 'mg-atzmon', name: 'עצמון (שגב)', type: 'settlement' },
      { id: 'mg-yodfat', name: 'יודפת', type: 'settlement' },
      { id: 'mg-manof', name: 'מנוף', type: 'settlement' },
      { id: 'mg-shorashim', name: 'שורשים', type: 'settlement' }
    ]
  },
  {
    id: 'eshkol',
    name: 'מועצה אזורית אשכול',
    type: 'regional_council',
    population: 15000,
    subLocations: [
      { id: 'es-beeri', name: 'קיבוץ בארי', type: 'settlement' },
      { id: 'es-magen', name: 'קיבוץ מגן', type: 'settlement' },
      { id: 'es-nir-oz', name: 'קיבוץ ניר עוז', type: 'settlement' },
      { id: 'es-ein-hashlosha', name: 'עין השלושה', type: 'settlement' }
    ]
  },
  {
    id: 'shomron',
    name: 'מועצה אזורית שומרון',
    type: 'regional_council',
    population: 50000,
    subLocations: [
      { id: 'sh-barkan', name: 'ברקן', type: 'settlement' },
      { id: 'sh-revava', name: 'רבבה', type: 'settlement' },
      { id: 'sh-avnei-hefetz', name: 'אבני חפץ', type: 'settlement' },
      { id: 'sh-itamar', name: 'איתמר', type: 'settlement' }
    ]
  },
  {
    id: 'binyamin',
    name: 'מועצה אזורית מטה בנימין',
    type: 'regional_council',
    population: 75000,
    subLocations: [
      { id: 'bn-kochav-yaakov', name: 'כוכב יעקב', type: 'settlement' },
      { id: 'bn-adam', name: 'גבע בנימין (אדם)', type: 'settlement' },
      { id: 'bn-ofra', name: 'עופרה', type: 'settlement' },
      { id: 'bn-shilo', name: 'שילה', type: 'settlement' }
    ]
  },
  {
    id: 'gush-etzion',
    name: 'מועצה אזורית גוש עציון',
    type: 'regional_council',
    population: 26000,
    subLocations: [
      { id: 'ge-alon-shvut', name: 'אלון שבות', type: 'settlement' },
      { id: 'ge-tekos', name: 'תקוע', type: 'settlement' },
      { id: 'ge-kfar-etzion', name: 'כפר עציון', type: 'settlement' },
      { id: 'ge-neve-daniel', name: 'נווה דניאל', type: 'settlement' }
    ]
  },
  {
    id: 'hevel-modiin',
    name: 'מועצה אזורית חבל מודיעין',
    type: 'regional_council',
    population: 24000,
    subLocations: [
      { id: 'hm-shoham', name: 'שוהם (מועצה נפרדת)', type: 'settlement' }, 
      { id: 'hm-lapid', name: 'לפיד', type: 'settlement' },
      { id: 'hm-kfar-daniel', name: 'כפר דניאל', type: 'settlement' },
      { id: 'hm-ben-shemen', name: 'מושב בן שמן', type: 'settlement' }
    ]
  },
  {
    id: 'gezer',
    name: 'מועצה אזורית גזר',
    type: 'regional_council',
    population: 28000,
    subLocations: [
      { id: 'gz-karmei-yosef', name: 'כרמי יוסף', type: 'settlement' },
      { id: 'gz-naan', name: 'קיבוץ נען', type: 'settlement' },
      { id: 'gz-mishmar-david', name: 'משמר דוד', type: 'settlement' }
    ]
  },
  {
    id: 'golan',
    name: 'מועצה אזורית גולן',
    type: 'regional_council',
    population: 19000,
    subLocations: [
      { id: 'go-hispin', name: 'חיספין', type: 'settlement' },
      { id: 'go-bene-yehuda', name: 'בני יהודה', type: 'settlement' },
      { id: 'go-ramot', name: 'מושב רמות', type: 'settlement' }
    ]
  },
  // ============================================================
  // PHASE A — locality coverage sync, 10.08.2026
  // Real municipal top-level localities confirmed in Firestore `authorities`
  // but missing from this picker. Names + population from Firestore;
  // coordinates geocoded (Mapbox relevance>=0.8, else Nominatim
  // importance>=0.15 — see .claude/knowledge/locality-geocoding-phase-a-split.md
  // for the full source/confidence trail per entry). David-approved 10.08.2026.
  // צור הדסה excluded — already exists as a settlement under Mateh Yehuda
  // Regional Council (my-tzur-hadassah); flagged separately, not auto-merged.
  // ============================================================
  { id: 'vr-kyb', name: 'אור עקיבא', type: 'city', population: 28183 },
  { id: 'bkh-l-grbyh', name: 'באקה אל-גרביה', type: 'city', population: 32933 },
  { id: 'br-ykb', name: 'באר יעקב', type: 'city', population: 39079 },
  { id: 'byt-shn', name: 'בית שאן', type: 'city', population: 21813 },
  { id: 'gbtyym', name: 'גבעתיים', type: 'city', population: 65883 },
  { id: 'gny-tkvvh', name: 'גני תקווה', type: 'city', population: 26562 },
  { id: 'hrtzlyyh', name: 'הרצלייה', type: 'city', population: 127661 },
  { id: 'chrysh', name: 'חריש', type: 'city', population: 42153 },
  { id: 'tyrt-krml', name: 'טירת כרמל', type: 'city', population: 34061 },
  { id: 'yhvd-mvnvsvn', name: 'יהוד-מונוסון', type: 'city', population: 33453 },
  { id: 'kpr-ksm', name: 'כפר קאסם', type: 'city', population: 27754 },
  { id: 'kpr-kr', name: 'כפר קרע', type: 'city', population: 21914 },
  { id: 'mgr', name: 'מגאר', type: 'city', population: 25346 },
  { id: 'mvdyyn-ylyt', name: 'מודיעין עילית', type: 'city', population: 93178 },
  { id: 'mlvt-trshych', name: 'מעלות-תרשיחא', type: 'city', population: 26254 },
  { id: 'nhryyh', name: 'נהרייה', type: 'city', population: 79433 },
  { id: 'nvf-hglyl', name: 'נוף הגליל', type: 'city', population: 57028 },
  { id: 'sch-nyn', name: 'סח\'נין', type: 'city', population: 36063 },
  { id: 'rbh', name: 'עראבה', type: 'city', population: 29253 },
  { id: 'klnsvvh', name: 'קלנסווה', type: 'city', population: 25705 },
  { id: 'kryyt-t', name: 'קריית אתא', type: 'city', population: 67657 },
  { id: 'kryyt-bylyk', name: 'קריית ביאליק', type: 'city', population: 52123 },
  { id: 'kryyt-gt', name: 'קריית גת', type: 'city', population: 79254 },
  { id: 'kryyt-ym', name: 'קריית ים', type: 'city', population: 50025 },
  { id: 'kryyt-mvtzkyn', name: 'קריית מוצקין', type: 'city', population: 56493 },
  { id: 'kryyt-mlky', name: 'קריית מלאכי', type: 'city', population: 30482 },
  { id: 'kryyt-shmvnh', name: 'קריית שמונה', type: 'city', population: 25452 },
  { id: 'shprm', name: 'שפרעם', type: 'city', population: 44880 },
  { id: 'bv-gvsh', name: 'אבו גוש', type: 'local_council', population: 8984 },
  { id: 'bv-snn', name: 'אבו סנאן', type: 'local_council', population: 14964 },
  { id: 'bn-yhvdh', name: 'אבן יהודה', type: 'local_council', population: 16174 },
  { id: 'zvr', name: 'אזור', type: 'local_council', population: 13759 },
  { id: 'ksl', name: 'אכסאל', type: 'local_council', population: 16260 },
  { id: 'lykyn', name: 'אליכין', type: 'local_council', population: 3700 },
  { id: 'lpy-mnshh', name: 'אלפי מנשה', type: 'local_council', population: 8634 },
  { id: 'lknh', name: 'אלקנה', type: 'local_council', population: 4774 },
  { id: 'blyn', name: 'אעבלין', type: 'local_council', population: 14277 },
  { id: 'prt', name: 'אפרת', type: 'local_council', population: 13396 },
  { id: 'bvkt', name: 'בוקעאתא', type: 'local_council', population: 7170 },
  { id: 'byr-l-mksvr', name: 'ביר אל-מכסור', type: 'local_council', population: 11363 },
  { id: 'byt-l', name: 'בית אל', type: 'local_council', population: 6824 },
  { id: 'byt-g-n', name: 'בית ג\'ן', type: 'local_council', population: 13140 },
  { id: 'byt-dgn', name: 'בית דגן', type: 'local_council', population: 7719 },
  { id: 'bny-y-sh', name: 'בני עי"ש', type: 'local_council', population: 7159 },
  { id: 'bnymynh-gbt-dh', name: 'בנימינה-גבעת עדה', type: 'local_council', population: 17229 },
  { id: 'bsm-h', name: 'בסמ"ה', type: 'local_council', population: 12578 },
  { id: 'bsmt-tbvn', name: 'בסמת טבעון', type: 'local_council', population: 8561 },
  { id: 'bnh', name: 'בענה', type: 'local_council', population: 8991 },
  { id: 'g-dyydh-mkr', name: 'ג\'דיידה-מכר', type: 'local_council', population: 22046 },
  { id: 'g-lg-vlyh', name: 'ג\'לג\'וליה', type: 'local_council', population: 11632 },
  { id: 'g-sr-zrk', name: 'ג\'סר א-זרקא', type: 'local_council', population: 16135 },
  { id: 'g-sh-gvsh-chlb', name: 'ג\'ש (גוש חלב)', type: 'local_council', population: 3459 },
  { id: 'g-t', name: 'ג\'ת', type: 'local_council', population: 13796 },
  { id: 'gbt-zb', name: 'גבעת זאב', type: 'local_council', population: 25982 },
  { id: 'dlyt-l-krml', name: 'דאלית אל-כרמל', type: 'local_council', population: 18921 },
  { id: 'dyyr-chn', name: 'דייר חנא', type: 'local_council', population: 11555 },
  { id: 'hr-dr', name: 'הר אדר', type: 'local_council', population: 4366 },
  { id: 'zmr', name: 'זמר', type: 'local_council', population: 8358 },
  { id: 'zrzyr', name: 'זרזיר', type: 'local_council', population: 9501 },
  { id: 'chvrh', name: 'חורה', type: 'local_council', population: 23321 },
  { id: 'chvrpysh', name: 'חורפיש', type: 'local_council', population: 7163 },
  { id: 'chtzvr-hglylyt', name: 'חצור הגלילית', type: 'local_council', population: 11490 },
  { id: 'tvb-zngryyh', name: 'טובא-זנגרייה', type: 'local_council', population: 7417 },
  { id: 'tvrn', name: 'טורעאן', type: 'local_council', population: 15906 },
  { id: 'ynvch-g-t', name: 'יאנוח-ג\'ת', type: 'local_council', population: 7226 },
  { id: 'ybnl', name: 'יבנאל', type: 'local_council', population: 5036 },
  { id: 'ysvd-hmlh', name: 'יסוד המעלה', type: 'local_council', population: 1843 },
  { id: 'ypy', name: 'יפיע', type: 'local_council', population: 20878 },
  { id: 'yrvchm', name: 'ירוחם', type: 'local_council', population: 12886 },
  { id: 'yrk', name: 'ירכא', type: 'local_council', population: 17304 },
  { id: 'kbvl', name: 'כאבול', type: 'local_council', population: 13602 },
  { id: 'kvkb-bv-l-hyg', name: 'כאוכב אבו אל-היג\'א', type: 'local_council', population: 4202 },
  { id: 'kvkb-yyr', name: 'כוכב יאיר', type: 'local_council', population: 10412 },
  { id: 'ksyph', name: 'כסיפה', type: 'local_council', population: 22782 },
  { id: 'kbyh-tbsh-chg-g-rh', name: 'כעביה-טבאש-חג\'אג\'רה', type: 'local_council', population: 6695 },
  { id: 'kpr-br', name: 'כפר ברא', type: 'local_council', population: 4534 },
  { id: 'kpr-vrdym', name: 'כפר ורדים', type: 'local_council', population: 6307 },
  { id: 'kpr-ysyf', name: 'כפר יאסיף', type: 'local_council', population: 11309 },
  { id: 'kpr-km', name: 'כפר כמא', type: 'local_council', population: 3764 },
  { id: 'kpr-kn', name: 'כפר כנא', type: 'local_council', population: 25656 },
  { id: 'kpr-mnd', name: 'כפר מנדא', type: 'local_council', population: 23113 },
  { id: 'kpr-shmryhv', name: 'כפר שמריהו', type: 'local_council', population: 2571 },
  { id: 'kpr-tbvr', name: 'כפר תבור', type: 'local_council', population: 4903 },
  { id: 'lhbym', name: 'להבים', type: 'local_council', population: 7887 },
  { id: 'lkyh', name: 'לקיה', type: 'local_council', population: 19730 },
  { id: 'mg-d-l-krvm', name: 'מג\'ד אל-כרום', type: 'local_council', population: 16655 },
  { id: 'mg-dl-shms', name: 'מג\'דל שמס', type: 'local_council', population: 12018 },
  { id: 'mgdl', name: 'מגדל', type: 'local_council', population: 2280 },
  { id: 'mgdl-tpn', name: 'מגדל תפן', type: 'local_council', population: 0 },
  { id: 'mzkrt-btyh', name: 'מזכרת בתיה', type: 'local_council', population: 17532 },
  { id: 'mzrh', name: 'מזרעה', type: 'local_council', population: 4411 },
  { id: 'mtvlh', name: 'מטולה', type: 'local_council', population: 2195 },
  { id: 'mytr', name: 'מיתר', type: 'local_council', population: 12753 },
  { id: 'msdh', name: 'מסעדה', type: 'local_council', population: 4342 },
  { id: 'myly', name: 'מעיליא', type: 'local_council', population: 3449 },
  { id: 'mlh-prym', name: 'מעלה אפרים', type: 'local_council', population: 2006 },
  { id: 'mlh-yrvn', name: 'מעלה עירון', type: 'local_council', population: 16838 },
  { id: 'mtzph-rmvn', name: 'מצפה רמון', type: 'local_council', population: 6020 },
  { id: 'mshhd', name: 'משהד', type: 'local_council', population: 9552 },
  { id: 'nvt-chvbb', name: 'נאות חובב', type: 'local_council', population: 0 },
  { id: 'nchf', name: 'נחף', type: 'local_council', population: 14828 },
  { id: 'sg-vr', name: 'סאג\'ור', type: 'local_council', population: 4683 },
  { id: 'sbyvn', name: 'סביון', type: 'local_council', population: 5401 },
  { id: 'g-r', name: 'ע\'ג\'ר', type: 'local_council', population: 3000 },
  { id: 'vmr', name: 'עומר', type: 'local_council', population: 9113 },
  { id: 'ylvt', name: 'עילוט', type: 'local_council', population: 9484 },
  { id: 'yn-mhl', name: 'עין מאהל', type: 'local_council', population: 14958 },
  { id: 'yn-knyy', name: 'עין קנייא', type: 'local_council', population: 2601 },
  { id: 'spy', name: 'עספיא', type: 'local_council', population: 13394 },
  { id: 'rrh', name: 'ערערה', type: 'local_council', population: 22233 },
  { id: 'rrh-bngb', name: 'ערערה-בנגב', type: 'local_council', population: 22506 },
  { id: 'pvryydys', name: 'פוריידיס', type: 'local_council', population: 14299 },
  { id: 'psvth', name: 'פסוטה', type: 'local_council', population: 3632 },
  { id: 'pkyyn-bvkyyh', name: 'פקיעין (בוקייעה)', type: 'local_council', population: 6487 },
  { id: 'prdsyyh', name: 'פרדסייה', type: 'local_council', population: 8427 },
  { id: 'ktzryn', name: 'קצרין', type: 'local_council', population: 9552 },
  { id: 'kryyt-tbvn', name: 'קריית טבעון', type: 'local_council', population: 21195 },
  { id: 'kryyt-krvn', name: 'קריית עקרון', type: 'local_council', population: 11221 },
  { id: 'krny-shvmrvn', name: 'קרני שומרון', type: 'local_council', population: 11257 },
  { id: 'rmh', name: 'ראמה', type: 'local_council', population: 8715 },
  { id: 'rsh-pynh', name: 'ראש פינה', type: 'local_council', population: 3456 },
  { id: 'ryynh', name: 'ריינה', type: 'local_council', population: 17928 },
  { id: 'rksym', name: 'רכסים', type: 'local_council', population: 15772 },
  { id: 'rmt-yshy', name: 'רמת ישי', type: 'local_council', population: 8579 },
  { id: 'shbly-vm-l-gnm', name: 'שבלי - אום אל-גנם', type: 'local_council', population: 7099 },
  { id: 'shgb-shlvm', name: 'שגב-שלום', type: 'local_council', population: 14306 },
  { id: 'shlvmy', name: 'שלומי', type: 'local_council', population: 8528 },
  { id: 'shb', name: 'שעב', type: 'local_council', population: 8183 },
  { id: 'shr-shvmrvn', name: 'שער שומרון', type: 'local_council', population: 9063 },
  { id: 'tl-mvnd', name: 'תל מונד', type: 'local_council', population: 16592 },
  { id: 'tl-shb', name: 'תל שבע', type: 'local_council', population: 24834 },
  { id: 'l-ksvm', name: 'אל קסום', type: 'regional_council', population: 0 },
  { id: 'l-btvf', name: 'אל-בטוף', type: 'regional_council', population: 0 },
  { id: 'lvnh', name: 'אלונה', type: 'regional_council', population: 0 },
  { id: 'br-tvbyh', name: 'באר טוביה', type: 'regional_council', population: 0 },
  { id: 'bvstn-l-mrg', name: 'בוסתן אל-מרג\'', type: 'regional_council', population: 0 },
  { id: 'bny-shmvn', name: 'בני שמעון', type: 'regional_council', population: 0 },
  { id: 'gdrvt', name: 'גדרות', type: 'regional_council', population: 0 },
  { id: 'gn-rvvh', name: 'גן רווה', type: 'regional_council', population: 0 },
  { id: 'hrbh-htykvnh', name: 'הערבה התיכונה', type: 'regional_council', population: 0 },
  { id: 'chbl-ylvt', name: 'חבל אילות', type: 'regional_council', population: 0 },
  { id: 'chbl-ybnh', name: 'חבל יבנה', type: 'regional_council', population: 0 },
  { id: 'lkysh', name: 'לכיש', type: 'regional_council', population: 0 },
  { id: 'mgydv', name: 'מגידו', type: 'regional_council', population: 0 },
  { id: 'nchl-shvrk', name: 'נחל שורק', type: 'regional_council', population: 0 },
  { id: 'mk-hmyynvt', name: 'עמק המעיינות', type: 'regional_council', population: 0 },
  { id: 'shdvt-dn', name: 'שדות דן', type: 'regional_council', population: 0 },
  { id: 'shpyr', name: 'שפיר', type: 'regional_council', population: 0 },
];

export const getAllSubLocations = () => {
  return ISRAELI_LOCATIONS.flatMap(loc => 
    (loc.subLocations || []).map(sub => ({ ...sub, parentId: loc.id, parentName: loc.name }))
  );
};