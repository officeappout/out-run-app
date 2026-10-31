/**
 * Legacy handstand volume (owner-approved 31.10.2026): per exercise, the
 * min-max reps or seconds and sets used in the 42 old-app handstand workouts,
 * by OLD program level (1-10). Generated from appout-website/handstand-research/
 * legacy-handstand-workouts.csv; the triad volume step prefers it over the
 * generic volume formula where an exercise appears here.
 */
export type LegacyVolumeRow = { min: number; max: number; sets: number };
/** `unit` = the exercise's type when the table was generated (31.10); a row is used only while it still matches. */
export type LegacyVolumeEntry = { unit: 'seconds' | 'reps'; rows: Record<number, LegacyVolumeRow> };
// Free-practice rows (play time, 5-10 min) are left out: not a set × reps prescription.
export const LEGACY_HANDSTAND_VOLUME: Record<string, LegacyVolumeEntry> = {
  '2xsOhAmdtN0mKOLZF1FT': { unit: 'seconds', rows: { 2: { min: 30, max: 60, sets: 2 }, 3: { min: 40, max: 60, sets: 2 }, 4: { min: 30, max: 60, sets: 2 }, 5: { min: 30, max: 60, sets: 2 }, 8: { min: 30, max: 60, sets: 2 }, 9: { min: 30, max: 60, sets: 3 }, 10: { min: 30, max: 60, sets: 2 } } },
  '3biSNXCImTx99483CqWy': { unit: 'reps', rows: { 2: { min: 10, max: 20, sets: 3 }, 6: { min: 15, max: 30, sets: 3 } } },
  '441SgXc1HkzPoKrKMLm9': { unit: 'seconds', rows: { 7: { min: 15, max: 30, sets: 3 }, 8: { min: 20, max: 40, sets: 3 }, 9: { min: 20, max: 40, sets: 3 }, 10: { min: 30, max: 60, sets: 3 } } },
  '5hWOB7BtRgDTZhSqHlzh': { unit: 'seconds', rows: { 5: { min: 20, max: 40, sets: 2 }, 7: { min: 30, max: 60, sets: 3 } } },
  '9BBOvu1SNMzNxgPun8ZH': { unit: 'seconds', rows: { 1: { min: 20, max: 40, sets: 3 } } },
  'ANvq7ORET7uhLRK4XP6X': { unit: 'reps', rows: { 7: { min: 4, max: 8, sets: 3 }, 8: { min: 6, max: 10, sets: 3 }, 9: { min: 5, max: 10, sets: 3 } } },
  'BIedG9GwmeavkwhDhXdX': { unit: 'reps', rows: { 5: { min: 3, max: 6, sets: 3 } } },
  'BLbgAyNJSZCc4YsoOxtP': { unit: 'seconds', rows: { 4: { min: 15, max: 30, sets: 3 }, 5: { min: 20, max: 40, sets: 2 }, 7: { min: 30, max: 60, sets: 2 }, 8: { min: 30, max: 60, sets: 2 }, 10: { min: 60, max: 90, sets: 3 } } },
  'DnRgN3J7j5k6aTKX7lj3': { unit: 'seconds', rows: { 1: { min: 10, max: 30, sets: 3 }, 3: { min: 20, max: 30, sets: 2 }, 4: { min: 30, max: 45, sets: 2 } } },
  'EnS9ade12iVKtUEDuiGW': { unit: 'reps', rows: { 1: { min: 5, max: 15, sets: 3 }, 2: { min: 15, max: 25, sets: 3 } } },
  'FPtbPz3YzAHAgRuqPEVP': { unit: 'seconds', rows: { 1: { min: 10, max: 40, sets: 3 }, 2: { min: 30, max: 60, sets: 3 } } },
  'KL9Xg7Yu3QLQmDRYkzqr': { unit: 'seconds', rows: { 8: { min: 15, max: 30, sets: 2 }, 9: { min: 30, max: 60, sets: 3 } } },
  'Ka7xoggWoDPUUC7WpICt': { unit: 'seconds', rows: { 7: { min: 15, max: 30, sets: 2 }, 8: { min: 20, max: 40, sets: 3 }, 9: { min: 30, max: 60, sets: 3 }, 10: { min: 30, max: 60, sets: 2 } } },
  'LHG41hVLnWBN2bjvUppG': { unit: 'reps', rows: { 6: { min: 3, max: 6, sets: 3 }, 7: { min: 5, max: 8, sets: 2 } } },
  'Lk3aRCGfrxY0rhl0yw4x': { unit: 'reps', rows: { 6: { min: 3, max: 6, sets: 3 }, 7: { min: 5, max: 8, sets: 3 }, 8: { min: 6, max: 10, sets: 3 } } },
  'OaqZzXOBwfVmdJ99w3iC': { unit: 'seconds', rows: { 1: { min: 20, max: 40, sets: 3 }, 2: { min: 30, max: 60, sets: 3 } } },
  'PVqGiE3xg76Dg0EXUsqZ': { unit: 'seconds', rows: { 3: { min: 20, max: 30, sets: 3 }, 4: { min: 30, max: 40, sets: 3 } } },
  'RPGCJ5BXPpPG21sF3H4y': { unit: 'seconds', rows: { 1: { min: 10, max: 40, sets: 3 }, 2: { min: 30, max: 60, sets: 3 } } },
  'VAON86ZHQ0ysFJaEJFFp': { unit: 'reps', rows: { 3: { min: 5, max: 10, sets: 3 }, 4: { min: 10, max: 15, sets: 2 }, 7: { min: 15, max: 20, sets: 3 }, 8: { min: 15, max: 20, sets: 3 }, 10: { min: 10, max: 20, sets: 3 } } },
  'WQBYjQxJEc9Y6FWHigTH': { unit: 'seconds', rows: { 3: { min: 15, max: 30, sets: 3 } } },
  'WSt4R7cvvvha88aMpgR2': { unit: 'seconds', rows: { 9: { min: 20, max: 40, sets: 3 }, 10: { min: 30, max: 60, sets: 3 } } },
  'XWL3TUAVmN0Dmp2btFgN': { unit: 'seconds', rows: { 1: { min: 20, max: 40, sets: 3 }, 2: { min: 20, max: 30, sets: 2 } } },
  'YEPHeMaPcepACgJ9BBD2': { unit: 'seconds', rows: { 9: { min: 20, max: 40, sets: 3 } } },
  'Z0bUVhrBLErcP1I1j6z9': { unit: 'seconds', rows: { 4: { min: 5, max: 20, sets: 3 }, 5: { min: 20, max: 30, sets: 3 } } },
  'aSR4wleycyiszBqxDr3j': { unit: 'reps', rows: { 4: { min: 10, max: 15, sets: 2 }, 6: { min: 15, max: 20, sets: 3 } } },
  'bZv8poy3HRMKDzgGmt24': { unit: 'reps', rows: { 9: { min: 5, max: 10, sets: 2 }, 10: { min: 8, max: 20, sets: 3 } } },
  'e9v7LThuF21719ipIRyF': { unit: 'seconds', rows: { 6: { min: 20, max: 40, sets: 2 }, 7: { min: 30, max: 45, sets: 2 }, 10: { min: 30, max: 60, sets: 3 } } },
  'eVlxFr0tH7O4MHmmgBbS': { unit: 'reps', rows: { 9: { min: 5, max: 10, sets: 3 }, 10: { min: 5, max: 10, sets: 3 } } },
  'ecRG1yxdG3u6REfh3LSm': { unit: 'reps', rows: { 4: { min: 5, max: 15, sets: 3 }, 5: { min: 10, max: 20, sets: 2 }, 9: { min: 15, max: 20, sets: 3 } } },
  'gWHaGzObmixb1vr66l5I': { unit: 'reps', rows: { 1: { min: 10, max: 45, sets: 3 }, 2: { min: 40, max: 60, sets: 2 }, 3: { min: 15, max: 30, sets: 2 }, 4: { min: 30, max: 60, sets: 2 }, 10: { min: 30, max: 60, sets: 3 } } },
  'hRhkahQrR2rn1mO8jyC6': { unit: 'seconds', rows: { 2: { min: 10, max: 20, sets: 3 }, 3: { min: 20, max: 30, sets: 3 } } },
  'jGXhRd8mnnUqrRnzTjnE': { unit: 'reps', rows: { 6: { min: 10, max: 20, sets: 3 }, 8: { min: 10, max: 15, sets: 3 } } },
  'nIyH77r6JOd6TwOeEPP4': { unit: 'reps', rows: { 1: { min: 5, max: 15, sets: 3 } } },
  'phUAJMYyBKsYcrEJMBnv': { unit: 'seconds', rows: { 6: { min: 10, max: 20, sets: 3 }, 8: { min: 20, max: 40, sets: 3 } } },
  's3MiKMUhjkwpRIubKlRQ': { unit: 'seconds', rows: { 8: { min: 15, max: 30, sets: 3 }, 9: { min: 20, max: 40, sets: 3 }, 10: { min: 30, max: 60, sets: 3 } } },
  'wQ6ocm6HRKtQ7CFpZI6A': { unit: 'reps', rows: { 10: { min: 4, max: 8, sets: 2 } } },
  'z7hX4ritb41UUlTz4fh9': { unit: 'seconds', rows: { 4: { min: 20, max: 30, sets: 2 }, 5: { min: 20, max: 40, sets: 2 }, 6: { min: 20, max: 40, sets: 2 }, 8: { min: 30, max: 60, sets: 3 } } },
  'zk8NuTMiMRF76Rbty98o': { unit: 'reps', rows: { 1: { min: 10, max: 20, sets: 3 } } },
};
