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
      { id: 'rl-nahalat', name: 'נחלת יהודה', type: 'neighborhood' }
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
  { id: 'sderot', name: 'שדרות', type: 'city', population: 33000 },
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
  }
];

export const getAllSubLocations = () => {
  return ISRAELI_LOCATIONS.flatMap(loc => 
    (loc.subLocations || []).map(sub => ({ ...sub, parentId: loc.id, parentName: loc.name }))
  );
};