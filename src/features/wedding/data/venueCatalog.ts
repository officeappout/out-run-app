/**
 * Wedding venues in central Israel for 200–300 guests, collected 02.10.2026
 * from three public directories (mit4mit, Walla! Wedding, mekomot-eruim).
 * Display-only reference data — not quotes.
 * - reportedPrice: average per-guest price couples reported on mit4mit.
 * - rating / reviews: mit4mit score (0–100) and review count.
 * - phone: 072 / 052-9 numbers are the directory's tracking lines.
 * Same list as the Google Sheet "אולמות וגנים לחתונה – מרכז (200–300 אורחים)".
 */

export interface CatalogVenue {
  id: string;
  name: string;
  type: string;
  city: string;
  area: string;
  capacity: string;
  url: string;
  phone: string;
  note: string;
  reportedPrice?: number;
  rating?: number;
  reviews?: number;
}

export const VENUE_CATALOG: CatalogVenue[] = [
  {"id": "c01", "name": "ואסקו Vasco", "type": "אולם", "city": "חולון", "area": "גוש דן", "capacity": "80–400", "url": "https://www.mit4mit.co.il/biz/97552", "phone": "052-9787471", "note": "", "rating": 96, "reviews": 161},
  {"id": "c02", "name": "קויה Coya", "type": "גן/אולם", "city": "חולון", "area": "גוש דן", "capacity": "", "url": "https://www.mit4mit.co.il/biz/104884", "phone": "", "note": "מעט ביקורות – חדש יחסית", "rating": 95, "reviews": 9},
  {"id": "c03", "name": "המוזיאון", "type": "אולם", "city": "חולון", "area": "גוש דן", "capacity": "עד 750", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "", "note": "גדול – לבדוק מינימום"},
  {"id": "c04", "name": "סליה אירועים", "type": "אולם", "city": "חולון", "area": "גוש דן", "capacity": "50–300", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "", "note": ""},
  {"id": "c05", "name": "דריה DARYA", "type": "אולם", "city": "בת ים", "area": "גוש דן", "capacity": "עד 350", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "072-3306465", "note": ""},
  {"id": "c06", "name": "יורדי הסירה", "type": "גן/אולם", "city": "תל אביב (נמל)", "area": "גוש דן", "capacity": "", "url": "https://www.mit4mit.co.il/biz/156", "phone": "", "note": "", "rating": 95, "reviews": 215},
  {"id": "c07", "name": "מונדו MONDO 2000", "type": "אולם", "city": "תל אביב", "area": "גוש דן", "capacity": "", "url": "https://www.mit4mit.co.il/biz/99063", "phone": "", "note": "", "rating": 95, "reviews": 40},
  {"id": "c08", "name": "ים YAM", "type": "גן", "city": "תל אביב", "area": "גוש דן", "capacity": "", "url": "https://www.mit4mit.co.il/biz/105342", "phone": "", "note": "יקר יחסית", "reportedPrice": 615, "rating": 95, "reviews": 21},
  {"id": "c09", "name": "בית אנדרומדה", "type": "גן", "city": "תל אביב-יפו", "area": "גוש דן", "capacity": "250–500", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/beitandromeda/", "phone": "", "note": ""},
  {"id": "c10", "name": "דייויד אינטרקונטיננטל", "type": "מלון", "city": "תל אביב", "area": "גוש דן", "capacity": "100–1,400", "url": "https://mazaltov.walla.co.il/event-place/eventshalls/davidintercontinental/", "phone": "", "note": "מלון – בדרך כלל יקר"},
  {"id": "c11", "name": "רוקח אירועים", "type": "גן", "city": "תל אביב", "area": "גוש דן", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/rokach-events/", "phone": "", "note": ""},
  {"id": "c12", "name": "NOOR נור ג'אפה", "type": "בוטיק", "city": "יפו", "area": "גוש דן", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/boutiquehalls/noor/", "phone": "", "note": "לבדוק קיבולת"},
  {"id": "c13", "name": "בית על הים", "type": "חוף", "city": "תל אביב", "area": "גוש דן", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/weddingonthebeach/housea/", "phone": "", "note": "במרץ – לבדוק אפשרות מקורה"},
  {"id": "c14", "name": "תיאטרון יפו", "type": "אולם", "city": "יפו", "area": "גוש דן", "capacity": "", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "073-7575887", "note": "לבדוק קיבולת"},
  {"id": "c15", "name": "רפאל בית לאירועים", "type": "אולם", "city": "תל אביב", "area": "גוש דן", "capacity": "עד 270", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "072-3307919", "note": ""},
  {"id": "c16", "name": "טזורו Tesoro", "type": "אולם", "city": "רמת השרון / ת״א", "area": "גוש דן", "capacity": "עד 450", "url": "https://mazaltov.walla.co.il/event-place/eventshalls/tesoro/", "phone": "052-9122346", "note": ""},
  {"id": "c17", "name": "מנהטן אירועים", "type": "אולם", "city": "רמת גן", "area": "גוש דן", "capacity": "עד 200", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "052-9125641", "note": "עד 200 – גבולי"},
  {"id": "c18", "name": "טרסא", "type": "אולם", "city": "גבעתיים", "area": "גוש דן", "capacity": "", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "050-3680590", "note": "לבדוק קיבולת"},
  {"id": "c19", "name": "שלוש 3 אירועים", "type": "אולם", "city": "אור יהודה", "area": "גוש דן", "capacity": "עד 300", "url": "https://mazaltov.walla.co.il/event-place/eventshalls/shalosh-events/", "phone": "052-9095840", "note": ""},
  {"id": "c20", "name": "קסיופאה", "type": "אולם", "city": "יהוד", "area": "גוש דן", "capacity": "", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "", "note": "לבדוק קיבולת"},
  {"id": "c21", "name": "טרמינל TERMINAL", "type": "גן/אולם", "city": "פתח תקווה", "area": "פ״ת וראש העין", "capacity": "", "url": "https://www.mit4mit.co.il/biz/95204", "phone": "", "note": "", "rating": 95, "reviews": 72},
  {"id": "c22", "name": "58 – גן ומתחם אירועים", "type": "גן", "city": "פתח תקווה", "area": "פ״ת וראש העין", "capacity": "", "url": "https://www.mit4mit.co.il/biz/1111", "phone": "", "note": "", "rating": 90, "reviews": 89},
  {"id": "c23", "name": "דרזנר 5", "type": "גן", "city": "פתח תקווה", "area": "פ״ת וראש העין", "capacity": "100–400", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/drezner5/", "phone": "072-3311757", "note": ""},
  {"id": "c24", "name": "קליי Clay", "type": "גן/אולם", "city": "פתח תקווה", "area": "פ״ת וראש העין", "capacity": "80–400", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/clay-events/", "phone": "072-3315257", "note": ""},
  {"id": "c25", "name": "סנטרל CENTRAL", "type": "גן/אולם", "city": "פתח תקווה", "area": "פ״ת וראש העין", "capacity": "100–500", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/centralevents/", "phone": "072-3318425", "note": ""},
  {"id": "c26", "name": "קסאנאדו", "type": "אולם", "city": "פתח תקווה", "area": "פ״ת וראש העין", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventshalls/xanadu/", "phone": "", "note": ""},
  {"id": "c27", "name": "ואמוס", "type": "אולם", "city": "פתח תקווה", "area": "פ״ת וראש העין", "capacity": "עד 300", "url": "https://mazaltov.walla.co.il/event-place/eventshalls/vamoss/", "phone": "052-9787118", "note": ""},
  {"id": "c28", "name": "ליאל גרדנס", "type": "גן", "city": "פתח תקווה", "area": "פ״ת וראש העין", "capacity": "עד 400", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "052-9129448", "note": ""},
  {"id": "c29", "name": "ריה אירועים", "type": "אולם", "city": "פתח תקווה", "area": "פ״ת וראש העין", "capacity": "עד 300", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "052-9120502", "note": ""},
  {"id": "c30", "name": "מייפל אירועים", "type": "אולם", "city": "פתח תקווה", "area": "פ״ת וראש העין", "capacity": "עד 400", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "072-3306436", "note": ""},
  {"id": "c31", "name": "אפטאון אורבן", "type": "אולם", "city": "פתח תקווה / גבעתיים", "area": "פ״ת וראש העין", "capacity": "80–400", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "052-9120642", "note": ""},
  {"id": "c32", "name": "וינו VINO", "type": "אולם", "city": "פתח תקווה", "area": "פ״ת וראש העין", "capacity": "עד 250", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "072-3313793", "note": ""},
  {"id": "c33", "name": "ניין גלרי", "type": "אולם", "city": "פתח תקווה", "area": "פ״ת וראש העין", "capacity": "60–250", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "072-3305835", "note": ""},
  {"id": "c34", "name": "פוראבר FOREVER", "type": "אולם", "city": "פתח תקווה", "area": "פ״ת וראש העין", "capacity": "עד 200", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "073-7761733", "note": "עד 200 – גבולי"},
  {"id": "c35", "name": "טוסקה TOSCA", "type": "אולם", "city": "פתח תקווה", "area": "פ״ת וראש העין", "capacity": "עד 200", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "072-2160170", "note": "עד 200 – גבולי"},
  {"id": "c36", "name": "אמורה Amore", "type": "אולם", "city": "פתח תקווה", "area": "פ״ת וראש העין", "capacity": "", "url": "https://www.amore-events.co.il/", "phone": "", "note": "לבדוק קיבולת"},
  {"id": "c37", "name": "בוסתן לב הארץ", "type": "גן", "city": "ראש העין", "area": "פ״ת וראש העין", "capacity": "50–250", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "", "note": ""},
  {"id": "c38", "name": "גרייס GRACE", "type": "גן/אולם", "city": "ראשון לציון", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "עד 400", "url": "https://www.mit4mit.co.il/biz/93448", "phone": "", "note": "", "reportedPrice": 356, "rating": 94, "reviews": 314},
  {"id": "c39", "name": "LAGO SOUL לאגו", "type": "גן", "city": "ראשון לציון", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/lagosoul/", "phone": "", "note": ""},
  {"id": "c40", "name": "LAGO SPIRIT לאגו", "type": "אולם", "city": "ראשון לציון", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventshalls/lagospirit/", "phone": "", "note": ""},
  {"id": "c41", "name": "דואאה", "type": "גן", "city": "ראשון לציון", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/duee-lago/", "phone": "", "note": ""},
  {"id": "c42", "name": "אמיליה", "type": "גן", "city": "ראשון לציון", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/emilia/", "phone": "", "note": ""},
  {"id": "c43", "name": "Moonstone מונסטון", "type": "אולם", "city": "ראשון לציון", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventshalls/moonstone/", "phone": "", "note": ""},
  {"id": "c44", "name": "ספליט אירועים", "type": "אולם", "city": "ראשון לציון", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventshalls/split/", "phone": "", "note": ""},
  {"id": "c45", "name": "מרקטו", "type": "אולם", "city": "ראשון לציון", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "עד 300", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "072-3314950", "note": ""},
  {"id": "c46", "name": "קליספרה", "type": "אולם", "city": "ראשון לציון", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "עד 300", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "052-9172059", "note": ""},
  {"id": "c47", "name": "מליה אירועים", "type": "אולם", "city": "ראשון לציון", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "עד 260", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "072-3305880", "note": ""},
  {"id": "c48", "name": "לאו LEO", "type": "אולם", "city": "ראשון לציון", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "עד 250", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "052-9123489", "note": ""},
  {"id": "c49", "name": "טאי TAI", "type": "אולם", "city": "ראשון לציון", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "עד 250", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "072-2160090", "note": ""},
  {"id": "c50", "name": "מון", "type": "אולם", "city": "ראשון לציון", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "עד 350", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "052-9787375", "note": ""},
  {"id": "c51", "name": "אחוזת ים", "type": "אולם", "city": "ראשון לציון", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "עד 350", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "072-3305978", "note": ""},
  {"id": "c52", "name": "ROOFTOP EVENTS", "type": "גג", "city": "ראשון לציון", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "עד 200", "url": "https://mekomot-eruim.co.il/Event-halls?area=Center", "phone": "073-7582404", "note": "עד 200 – גבולי"},
  {"id": "c53", "name": "גאיה", "type": "גן/אולם", "city": "נס ציונה", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "", "url": "https://www.mit4mit.co.il/biz/19542", "phone": "", "note": "", "rating": 89, "reviews": 280},
  {"id": "c54", "name": "גבריאל תרבות אירוח", "type": "גן", "city": "נס ציונה", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "עד 1,000", "url": "https://www.mit4mit.co.il/biz/99770", "phone": "", "note": "גדול – לבדוק מינימום", "rating": 86, "reviews": 13},
  {"id": "c55", "name": "באסיקו", "type": "גן", "city": "נס ציונה", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "450", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/basico/", "phone": "", "note": ""},
  {"id": "c56", "name": "ויה Via", "type": "גן", "city": "נס ציונה", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/viaevents/", "phone": "", "note": ""},
  {"id": "c57", "name": "אמארה AMARE", "type": "גן", "city": "נס ציונה", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/amare/", "phone": "", "note": ""},
  {"id": "c58", "name": "ויטראז' אירועים", "type": "אולם", "city": "נס ציונה", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventshalls/vitrage/", "phone": "", "note": ""},
  {"id": "c59", "name": "בית הדבש", "type": "גן", "city": "נס ציונה", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "", "url": "https://www.mit4mit.co.il/biz/32153", "phone": "", "note": "", "rating": 95, "reviews": 76},
  {"id": "c60", "name": "הפרדס", "type": "גן", "city": "רחובות", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/hapardes/", "phone": "", "note": ""},
  {"id": "c61", "name": "עדיה", "type": "אולם", "city": "יבנה", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventshalls/adia/", "phone": "", "note": ""},
  {"id": "c62", "name": "AJAM", "type": "אולם", "city": "יבנה", "area": "ראשל״צ, נס ציונה ורחובות", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventshalls/ajam/", "phone": "", "note": ""},
  {"id": "c63", "name": "הגבעה", "type": "גן", "city": "גבעת ברנר", "area": "שפלה", "capacity": "", "url": "https://www.mit4mit.co.il/biz/233", "phone": "", "note": "הכי מדורג במרכז", "reportedPrice": 457, "rating": 99, "reviews": 1055},
  {"id": "c64", "name": "חוות אלנבי", "type": "גן", "city": "נצר סרני", "area": "שפלה", "capacity": "", "url": "https://www.mit4mit.co.il/biz/13649", "phone": "", "note": "", "reportedPrice": 413, "rating": 95, "reviews": 682},
  {"id": "c65", "name": "חצר נצר", "type": "גן", "city": "נצר סרני", "area": "שפלה", "capacity": "700–950", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/hatzar-netzer/", "phone": "", "note": "גדול – לבדוק מינימום"},
  {"id": "c66", "name": "אלגריה", "type": "גן/אולם", "city": "קריית עקרון", "area": "שפלה", "capacity": "", "url": "https://www.mit4mit.co.il/biz/13857", "phone": "", "note": "", "rating": 97, "reviews": 622},
  {"id": "c67", "name": "הרמוניה בגן", "type": "גן", "city": "גדרה / כנות", "area": "שפלה", "capacity": "", "url": "https://www.mit4mit.co.il/biz/1205", "phone": "", "note": "מחיר מדווח נמוך יחסית", "reportedPrice": 287, "rating": 97, "reviews": 665},
  {"id": "c68", "name": "TAO טאו", "type": "גן", "city": "כנות", "area": "שפלה", "capacity": "700", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/tao/", "phone": "", "note": "גדול – לבדוק מינימום"},
  {"id": "c69", "name": "טרוסא", "type": "גן", "city": "כנות", "area": "שפלה", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/tarosa/", "phone": "", "note": ""},
  {"id": "c70", "name": "לארה אירועים", "type": "אולם", "city": "כנות", "area": "שפלה", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventshalls/lara/", "phone": "", "note": ""},
  {"id": "c71", "name": "NOÉ נואה", "type": "גן", "city": "כנות", "area": "שפלה", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/NOE/", "phone": "", "note": ""},
  {"id": "c72", "name": "ADEO אדאו", "type": "גן", "city": "כנות", "area": "שפלה", "capacity": "800", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/adeo/", "phone": "", "note": "גדול – לבדוק מינימום"},
  {"id": "c73", "name": "הנחלה", "type": "גן", "city": "בית עובד", "area": "שפלה", "capacity": "", "url": "https://www.mit4mit.co.il/biz/235", "phone": "", "note": "", "rating": 94, "reviews": 175},
  {"id": "c74", "name": "קדם מתחם אירועים", "type": "גן", "city": "קיבוץ בארות יצחק", "area": "שפלה", "capacity": "", "url": "https://www.mit4mit.co.il/biz/93368", "phone": "", "note": "ליד שוהם", "reportedPrice": 314, "rating": 91, "reviews": 142},
  {"id": "c75", "name": "אטורה", "type": "גן", "city": "לטרון", "area": "שפלה", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/atura/", "phone": "", "note": ""},
  {"id": "c76", "name": "ג'ויה מיה", "type": "גן", "city": "נחשונים", "area": "שפלה", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/gioiamia/", "phone": "", "note": ""},
  {"id": "c77", "name": "לילות קסומים", "type": "גן", "city": "קיבוץ חפץ חיים", "area": "שפלה", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/leilot-ksumim/", "phone": "", "note": ""},
  {"id": "c78", "name": "חוות עמק איילון", "type": "גן", "city": "עמק איילון", "area": "שפלה", "capacity": "", "url": "https://www.mit4mit.co.il/biz/99904", "phone": "", "note": "", "reportedPrice": 363, "rating": 89, "reviews": 57},
  {"id": "c79", "name": "קדמא", "type": "גן", "city": "נווה אילן", "area": "שפלה", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/kedma/", "phone": "", "note": "קרוב לירושלים"},
  {"id": "c80", "name": "נסיה", "type": "גן", "city": "צומת ראם", "area": "שפלה", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/nesia/", "phone": "", "note": "דרום השפלה"},
  {"id": "c81", "name": "אגדתא", "type": "גן", "city": "צומת ראם", "area": "שפלה", "capacity": "", "url": "https://mazaltov.walla.co.il/event-place/eventsgardens/agadata/", "phone": "", "note": "דרום השפלה"},
  {"id": "c82", "name": "בית – חלל אירועים אורבני", "type": "אולם", "city": "רעננה", "area": "שרון דרומי", "capacity": "", "url": "https://www.mit4mit.co.il/biz/92699", "phone": "", "note": "", "reportedPrice": 479, "rating": 99, "reviews": 1003},
  {"id": "c83", "name": "בדולינה", "type": "גן", "city": "רעננה", "area": "שרון דרומי", "capacity": "", "url": "https://www.mit4mit.co.il/biz/96232", "phone": "", "note": "", "reportedPrice": 374, "rating": 94, "reviews": 133},
  {"id": "c84", "name": "אמדו AMADO", "type": "אולם", "city": "הרצליה", "area": "שרון דרומי", "capacity": "", "url": "https://www.mit4mit.co.il/biz/60120", "phone": "", "note": "", "rating": 96, "reviews": 91},
  {"id": "c85", "name": "צל החורש", "type": "גן", "city": "דרום השרון", "area": "שרון דרומי", "capacity": "", "url": "https://www.mit4mit.co.il/biz/93311", "phone": "", "note": "", "reportedPrice": 479, "rating": 97, "reviews": 392},
  {"id": "c86", "name": "עדן גארדן", "type": "גן", "city": "ניר אליהו", "area": "שרון דרומי", "capacity": "", "url": "https://www.mit4mit.co.il/biz/438", "phone": "", "note": "", "reportedPrice": 392, "rating": 94, "reviews": 325},
  {"id": "c87", "name": "88 גן אירועים", "type": "גן", "city": "", "area": "שרון דרומי", "capacity": "", "url": "https://www.mit4mit.co.il/biz/102672", "phone": "", "note": "לבדוק מיקום", "reportedPrice": 407, "rating": 96, "reviews": 65},
  {"id": "c88", "name": "עלמה בית אירועים", "type": "גן/אולם", "city": "אבן יהודה", "area": "שרון דרומי", "capacity": "", "url": "https://www.mit4mit.co.il/biz/25260", "phone": "", "note": "", "reportedPrice": 440, "rating": 95, "reviews": 391},
  {"id": "c89", "name": "סיטרוס", "type": "גן", "city": "אבן יהודה", "area": "שרון דרומי", "capacity": "", "url": "https://www.mit4mit.co.il/biz/30265", "phone": "", "note": "", "rating": 94, "reviews": 276},
];

export const CATALOG_AREAS = ['גוש דן', 'פ״ת וראש העין', 'ראשל״צ, נס ציונה ורחובות', 'שפלה', 'שרון דרומי'] as const;
export const CATALOG_UPDATED = '2026-10-02';
