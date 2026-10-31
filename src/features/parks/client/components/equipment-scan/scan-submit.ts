'use client';

/**
 * Park mapping submit: the same createContribution the wizard uses ('new_location', 'pending',
 * into the existing approval center / city hub), with the cover photo, the equipment the user
 * kept (with the recognized brand), the bench / stairs feature tags and the scan record for the
 * admin (confidence badges and the "מתקן חדש להוסיף לקטלוג" queue), then the accuracy log. user_contributions' create rule has no field allowlist,
 * so the extra `scan` field needs no rules change.
 */
import { createContribution } from '@/features/parks/core/services/contribution.service';
import type { ParkFeatureTag } from '@/features/parks/core/types/park.types';
import type { ParkGymEquipment } from '@/features/content/equipment/gym';
import { scanMetaFor, type ParkScanPrefill } from './park-scan-mapping';
import type { MergedParkScan } from '@/lib/ai/scan/scan-merge';
import { uploadCover, uploadUnknownCrops } from './scan-upload';
import type { ParkShot } from './useParkScan';
import { postScanFeedback } from './scan-api';

export async function submitScanContribution(args: {
  uid: string;
  location: { lat: number; lng: number };
  parkName: string;
  gymEquipment: ParkGymEquipment[];
  featureTags: ParkFeatureTag[];
  shots: readonly ParkShot[];
  prefill: ParkScanPrefill & { merged: MergedParkScan };
}): Promise<string> {
  const { uid, shots, prefill } = args;
  const [cover, unknown] = await Promise.all([uploadCover(uid, shots), uploadUnknownCrops(uid, shots, prefill.unknown)]);
  const scan = scanMetaFor(prefill.merged, args.gymEquipment.map((g) => g.equipmentId), unknown);
  const id = await createContribution({
    userId: uid,
    type: 'new_location',
    status: 'pending',
    location: args.location,
    parkName: args.parkName,
    facilityType: 'gym_park',
    featureTags: args.featureTags,
    isPointOfInterest: false,
    ...(cover ? { photoUrl: cover.url } : {}),
    ...(args.gymEquipment.length ? { gymEquipment: args.gymEquipment } : {}),
    scan,
  });
  // Accuracy log (detected vs what the user sent, never a photo).
  void postScanFeedback({
    mode: 'park',
    via: 'park_submit',
    detected: prefill.merged.items
      .filter((i) => i.kind === 'catalog')
      .slice(0, 20)
      .map((i) => ({ equipmentId: i.candidateId, confidence: Math.round(i.confidence * 100) / 100, ...(i.brandName ? { brandName: i.brandName } : {}) })),
    kept: args.gymEquipment.map((g) => ({ equipmentId: g.equipmentId, ...(g.brandName ? { brandName: g.brandName } : {}) })),
    removed: scan.removedByUser,
    added: scan.addedByUser,
  });
  return id;
}
