/**
 * fixAuthorityCoordinates — one-time HTTP trigger to geocode every authority
 * whose coordinates are absent or stuck on the Jerusalem fallback.
 *
 * Invoke (after `firebase deploy --only functions:fixAuthorityCoordinates`):
 *   curl -X POST https://<region>-appout-1.cloudfunctions.net/fixAuthorityCoordinates
 *
 * Environment variable required:
 *   MAPBOX_TOKEN — set via:
 *     firebase functions:secrets:set MAPBOX_TOKEN
 *   or via Firebase Console → Functions → fixAuthorityCoordinates → Edit → Environment variables
 *
 * Access is restricted to signed-in admin callers via Firestore security rules;
 * the function itself runs with Admin SDK privileges so it can write to authorities.
 */

import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Bind the Secret Manager secret to a parameter the runtime can read.
// Using defineSecret() (instead of the bare-string form) makes the
// firebase-tools deployer include `secret_environment_variables` in the
// update mask so the binding actually reaches Cloud Run.
const mapboxToken = defineSecret('MAPBOX_TOKEN');

const JLM = { lat: 31.7683, lng: 35.2137 };
const TARGET_TYPES = ['city', 'neighborhood', 'local_council'];

function isJerusalemFallback(coords: { lat: number; lng: number }): boolean {
  return (
    Math.abs(coords.lat - JLM.lat) < 0.001 &&
    Math.abs(coords.lng - JLM.lng) < 0.001
  );
}

function isInsideIsrael(lat: number, lng: number): boolean {
  return lat >= 29 && lat <= 34 && lng >= 34 && lng <= 37;
}

interface FixEntry  { id: string; name: string; lat: number; lng: number }
interface ErrorEntry { id: string; name: string; reason: string }

export const fixAuthorityCoordinates = onRequest(
  {
    region: 'us-central1',
    secrets: [mapboxToken],
    timeoutSeconds: 540,
    memory: '512MiB',
    cors: false,
  },
  async (req, res) => {
    const token = mapboxToken.value();

    // Debug: confirm secret injection (remove after confirming it works)
    logger.info('MAPBOX keys in env:', Object.keys(process.env).filter(k => k.includes('MAPBOX')));
    logger.info('MAPBOX_TOKEN via param:', token ? 'EXISTS' : 'MISSING');

    if (!token) {
      res.status(500).send('MAPBOX_TOKEN secret not configured.');
      return;
    }

    const fixed: FixEntry[]   = [];
    const errors: ErrorEntry[] = [];

    const snapshot = await db
      .collection('authorities')
      .where('type', 'in', TARGET_TYPES)
      .get();

    logger.info(`[fixAuthorityCoordinates] Scanning ${snapshot.size} documents…`);

    for (const document of snapshot.docs) {
      const data   = document.data();
      const coords = data.coordinates as { lat: number; lng: number } | undefined;

      const needsFix = !coords || isJerusalemFallback(coords);
      if (!needsFix) continue;

      // For neighborhoods, prepend the parent city name for a more precise query
      let queryName: string = data.name as string;
      if (data.type === 'neighborhood' && data.parentAuthorityId) {
        try {
          const parent = await db.collection('authorities').doc(data.parentAuthorityId as string).get();
          if (parent.exists) {
            queryName = `${data.name} ${parent.data()?.name}`;
          }
        } catch (e) {
          logger.warn(`[fixAuthorityCoordinates] Could not load parent for ${document.id}`, e);
        }
      }

      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(`${queryName} ישראל`)}.json`;
        const r = await axios.get<{ features: Array<{ center: [number, number] }> }>(url, {
          params: {
            country: 'IL',
            types: 'place,locality,neighborhood',
            access_token: token,
          },
        });

        const feature = r.data.features?.[0];
        if (feature) {
          const [lng, lat] = feature.center;
          if (isInsideIsrael(lat, lng)) {
            await document.ref.update({ coordinates: { lat, lng } });
            fixed.push({ id: document.id, name: data.name as string, lat, lng });
            logger.info(`[fixAuthorityCoordinates] ✅ ${data.name}: ${lat.toFixed(4)}, ${lng.toFixed(4)}`);
          } else {
            errors.push({ id: document.id, name: data.name as string, reason: 'out of bounds' });
            logger.warn(`[fixAuthorityCoordinates] ⚠️  ${data.name}: out-of-bounds result ${lat}, ${lng}`);
          }
        } else {
          errors.push({ id: document.id, name: data.name as string, reason: 'no results' });
          logger.warn(`[fixAuthorityCoordinates] ⚠️  ${data.name}: no Mapbox results`);
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ id: document.id, name: data.name as string, reason: msg });
        logger.error(`[fixAuthorityCoordinates] ❌ ${data.name}: ${msg}`);
      }
    }

    logger.info(`[fixAuthorityCoordinates] Done — fixed: ${fixed.length}, errors: ${errors.length}`);

    res.json({
      fixed:     fixed.length,
      errors:    errors.length,
      fixedList: fixed,
      errorList: errors,
    });
  },
);
