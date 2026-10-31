/**
 * Legacy handstand volume (owner-approved 31.10.2026): per exercise, the
 * min-max reps or seconds and sets used in the 42 old-app handstand workouts,
 * by OLD program level (1-10). Generated from appout-website/handstand-research/
 * legacy-handstand-workouts.csv; the triad volume step prefers it over the
 * generic volume formula where an exercise appears here.
 */
export type LegacyVolumeRow = { min: number; max: number; sets: number };
export const LEGACY_HANDSTAND_VOLUME: Record<string, Record<number, LegacyVolumeRow>> = {
  '2xsOhAmdtN0mKOLZF1FT': { 2: { min: 30, max: 60, sets: 2 }, 3: { min: 40, max: 60, sets: 2 }, 4: { min: 30, max: 60, sets: 2 }, 5: { min: 30, max: 60, sets: 2 }, 8: { min: 30, max: 60, sets: 2 }, 9: { min: 30, max: 60, sets: 3 }, 10: { min: 30, max: 60, sets: 2 } },
  '3biSNXCImTx99483CqWy': { 2: { min: 10, max: 20, sets: 3 }, 6: { min: 15, max: 30, sets: 3 } },
  '441SgXc1HkzPoKrKMLm9': { 7: { min: 15, max: 30, sets: 3 }, 8: { min: 20, max: 40, sets: 3 }, 9: { min: 20, max: 40, sets: 3 }, 10: { min: 30, max: 60, sets: 3 } },
  '5hWOB7BtRgDTZhSqHlzh': { 5: { min: 20, max: 40, sets: 2 }, 7: { min: 30, max: 60, sets: 3 } },
  '9BBOvu1SNMzNxgPun8ZH': { 1: { min: 20, max: 40, sets: 3 } },
  'ANvq7ORET7uhLRK4XP6X': { 7: { min: 4, max: 8, sets: 3 }, 8: { min: 6, max: 10, sets: 3 }, 9: { min: 5, max: 10, sets: 3 } },
  'BIedG9GwmeavkwhDhXdX': { 5: { min: 3, max: 6, sets: 3 } },
  'BLbgAyNJSZCc4YsoOxtP': { 4: { min: 15, max: 30, sets: 3 }, 5: { min: 20, max: 40, sets: 2 }, 7: { min: 30, max: 60, sets: 2 }, 8: { min: 30, max: 60, sets: 2 }, 10: { min: 60, max: 90, sets: 3 } },
  'DnRgN3J7j5k6aTKX7lj3': { 1: { min: 10, max: 30, sets: 3 }, 3: { min: 20, max: 30, sets: 2 }, 4: { min: 30, max: 45, sets: 2 } },
  'EnS9ade12iVKtUEDuiGW': { 1: { min: 5, max: 15, sets: 3 }, 2: { min: 15, max: 25, sets: 3 } },
  'FPtbPz3YzAHAgRuqPEVP': { 1: { min: 10, max: 40, sets: 3 }, 2: { min: 30, max: 60, sets: 3 } },
  'KL9Xg7Yu3QLQmDRYkzqr': { 8: { min: 15, max: 30, sets: 2 }, 9: { min: 30, max: 60, sets: 3 } },
  'Ka7xoggWoDPUUC7WpICt': { 7: { min: 15, max: 30, sets: 2 }, 8: { min: 20, max: 40, sets: 3 }, 9: { min: 30, max: 60, sets: 3 }, 10: { min: 30, max: 60, sets: 2 } },
  'LHG41hVLnWBN2bjvUppG': { 6: { min: 3, max: 6, sets: 3 }, 7: { min: 5, max: 8, sets: 2 } },
  'Lk3aRCGfrxY0rhl0yw4x': { 6: { min: 3, max: 6, sets: 3 }, 7: { min: 5, max: 8, sets: 3 }, 8: { min: 6, max: 10, sets: 3 } },
  'OaqZzXOBwfVmdJ99w3iC': { 1: { min: 20, max: 40, sets: 3 }, 2: { min: 30, max: 60, sets: 3 } },
  'PVqGiE3xg76Dg0EXUsqZ': { 3: { min: 20, max: 30, sets: 3 }, 4: { min: 30, max: 40, sets: 3 } },
  'RPGCJ5BXPpPG21sF3H4y': { 1: { min: 10, max: 40, sets: 3 }, 2: { min: 30, max: 60, sets: 3 } },
  'VAON86ZHQ0ysFJaEJFFp': { 3: { min: 5, max: 10, sets: 3 }, 4: { min: 10, max: 15, sets: 2 }, 7: { min: 15, max: 20, sets: 3 }, 8: { min: 15, max: 20, sets: 3 }, 10: { min: 10, max: 20, sets: 3 } },
  'WQBYjQxJEc9Y6FWHigTH': { 3: { min: 15, max: 30, sets: 3 } },
  'WSt4R7cvvvha88aMpgR2': { 9: { min: 20, max: 40, sets: 3 }, 10: { min: 30, max: 60, sets: 3 } },
  'XWL3TUAVmN0Dmp2btFgN': { 1: { min: 20, max: 40, sets: 3 }, 2: { min: 20, max: 30, sets: 2 } },
  'YEPHeMaPcepACgJ9BBD2': { 9: { min: 20, max: 40, sets: 3 } },
  'Z0bUVhrBLErcP1I1j6z9': { 4: { min: 5, max: 20, sets: 3 }, 5: { min: 20, max: 30, sets: 3 } },
  'aSR4wleycyiszBqxDr3j': { 4: { min: 10, max: 15, sets: 2 }, 6: { min: 15, max: 20, sets: 3 } },
  'bZv8poy3HRMKDzgGmt24': { 9: { min: 5, max: 10, sets: 2 }, 10: { min: 8, max: 20, sets: 3 } },
  'e9v7LThuF21719ipIRyF': { 6: { min: 20, max: 40, sets: 2 }, 7: { min: 30, max: 45, sets: 2 }, 10: { min: 30, max: 60, sets: 3 } },
  'eVlxFr0tH7O4MHmmgBbS': { 9: { min: 5, max: 10, sets: 3 }, 10: { min: 5, max: 10, sets: 3 } },
  'ecRG1yxdG3u6REfh3LSm': { 4: { min: 5, max: 15, sets: 3 }, 5: { min: 10, max: 20, sets: 2 }, 9: { min: 15, max: 20, sets: 3 } },
  'gWHaGzObmixb1vr66l5I': { 1: { min: 10, max: 45, sets: 3 }, 2: { min: 40, max: 60, sets: 2 }, 3: { min: 15, max: 30, sets: 2 }, 4: { min: 30, max: 60, sets: 2 }, 10: { min: 30, max: 60, sets: 3 } },
  'hRhkahQrR2rn1mO8jyC6': { 2: { min: 10, max: 20, sets: 3 }, 3: { min: 20, max: 30, sets: 3 } },
  'jGXhRd8mnnUqrRnzTjnE': { 6: { min: 10, max: 20, sets: 3 }, 8: { min: 10, max: 15, sets: 3 } },
  'nIyH77r6JOd6TwOeEPP4': { 1: { min: 5, max: 15, sets: 3 } },
  'phUAJMYyBKsYcrEJMBnv': { 6: { min: 10, max: 20, sets: 3 }, 8: { min: 20, max: 40, sets: 3 } },
  'rwzmaORcfLr09X3AbwkT': { 10: { min: 300, max: 600, sets: 1 } },
  's3MiKMUhjkwpRIubKlRQ': { 8: { min: 15, max: 30, sets: 3 }, 9: { min: 20, max: 40, sets: 3 }, 10: { min: 30, max: 60, sets: 3 } },
  'wQ6ocm6HRKtQ7CFpZI6A': { 10: { min: 4, max: 8, sets: 2 } },
  'z7hX4ritb41UUlTz4fh9': { 4: { min: 20, max: 30, sets: 2 }, 5: { min: 20, max: 40, sets: 2 }, 6: { min: 20, max: 40, sets: 2 }, 8: { min: 30, max: 60, sets: 3 } },
  'zk8NuTMiMRF76Rbty98o': { 1: { min: 10, max: 20, sets: 3 } },
};
