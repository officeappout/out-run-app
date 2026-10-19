/**
 * Fixed starts for route-quality A/B — the 6 points the route-quality PR's
 * before/after table was measured on, + Jaffa (loops-prefer-official PR);
 * scripts/route-quality re-exports this.
 */
export interface QualityStartPreset {
  id: string;
  label: string;
  cityName: string;
  lat: number;
  lng: number;
}

export const QUALITY_START_PRESETS: QualityStartPreset[] = [
  { id: 'tlv-dizengoff', label: 'ת״א — כיכר דיזנגוף', cityName: 'תל אביב-יפו', lat: 32.0779, lng: 34.774 },
  { id: 'tlv-florentin', label: 'ת״א — פלורנטין', cityName: 'תל אביב-יפו', lat: 32.0571, lng: 34.7687 },
  { id: 'tlv-ramat-aviv', label: 'ת״א — רמת אביב', cityName: 'תל אביב-יפו', lat: 32.1128, lng: 34.7995 },
  { id: 'sderot', label: 'שדרות — מרכז', cityName: 'שדרות', lat: 31.5247, lng: 34.5966 },
  { id: 'haifa-carmel', label: 'חיפה — מרכז הכרמל', cityName: 'חיפה', lat: 32.8046, lng: 34.9872 },
  { id: 'herzliya', label: 'הרצליה — מרכז', cityName: 'הרצליה', lat: 32.1648, lng: 34.8443 },
  // Added 19.10.2026 (loops prefer our routes) — the owner's own test spot.
  { id: 'tlv-jaffa', label: 'ת״א — יפו (מגדל השעון)', cityName: 'תל אביב-יפו', lat: 32.0546, lng: 34.7563 },
];

/** Cities the generator's street_segments carry (cityName only gates "try segments at all"; reads are by proximity). */
export const QUALITY_CITY_NAMES = ['תל אביב-יפו', 'הרצליה', 'חיפה', 'שדרות', 'זכרון יעקב'];
