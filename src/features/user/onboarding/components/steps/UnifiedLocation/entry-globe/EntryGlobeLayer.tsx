'use client';

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { LocationStage, type CityData, type NearbyFacility, type SportContext, type TrainingContext } from '../location-types';
import GlobeStage, { type GlobePhase } from './GlobeStage';
import { EntryGlobeHeadline } from './EntryGlobeHeadline';
import { EntryInitialDrawer } from './EntryInitialDrawer';
import { DivePill } from './DivePill';
import { EntryConfirmDrawer } from './EntryConfirmDrawer';
import { EntrySearchOverlay } from './EntrySearchOverlay';

export interface EntryGlobeLayerProps {
  stage: LocationStage;
  /** The Earth is on screen (above the street map). */
  showGlobe: boolean;
  globePhase: GlobePhase;
  /** Still flying in (CONFIRMING already, drawer waits for the landing). */
  diving: boolean;
  diveTarget: { lat: number; lng: number } | null;
  onDiveArrived: () => void;

  locationError: string | null;
  onFindLocation: () => void;
  onSearchManually: () => void;
  onSearchInsteadOfLocating: () => void;

  displayName: string;
  detectedNeighborhood: string | null;
  detectedCity: string | null;
  nearbyFacilities: NearbyFacility[];
  isLoadingParks: boolean;
  gender: 'male' | 'female';
  sportContext: SportContext;
  trainingContext: TrainingContext | null;
  onConfirm: () => void;
  onSearchOther: () => void;

  searchQuery: string;
  onSearchChange: (q: string) => void;
  filteredCities: CityData[];
  onCitySelect: (city: CityData) => void;
  onBackFromSearch: () => void;
}

/**
 * enable_entry_globe_v1 — the location step's whole new presentation, layered
 * over the step's (unchanged) street map: the live Earth + headline, the dive
 * pill, the "גרים ב…?" drawer and the grouped search. Pure presentation — every
 * callback is the step's existing handler.
 */
export function EntryGlobeLayer(p: EntryGlobeLayerProps) {
  const { stage } = p;
  return (
    <>
      <AnimatePresence>
        {p.showGlobe && (
          <motion.div
            key="entry-globe"
            className="absolute inset-0 z-30"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          >
            <GlobeStage phase={p.globePhase} target={p.diveTarget} onArrived={p.onDiveArrived} />
            <AnimatePresence>
              {stage === LocationStage.INITIAL && (
                <motion.div
                  key="entry-headline"
                  className="absolute inset-0"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <EntryGlobeHeadline />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {stage === LocationStage.INITIAL && (
          <EntryInitialDrawer
            key="entry-initial"
            locationError={p.locationError}
            onFindLocation={p.onFindLocation}
            onSearchManually={p.onSearchManually}
          />
        )}

        {(stage === LocationStage.LOCATING || (stage === LocationStage.CONFIRMING && p.diving)) && (
          <DivePill
            key="entry-dive"
            onSearchManually={stage === LocationStage.LOCATING ? p.onSearchInsteadOfLocating : undefined}
          />
        )}

        {stage === LocationStage.CONFIRMING && !p.diving && (
          <EntryConfirmDrawer
            key="entry-confirm"
            displayName={p.displayName}
            detectedNeighborhood={p.detectedNeighborhood}
            detectedCity={p.detectedCity}
            nearbyFacilities={p.nearbyFacilities}
            isLoadingParks={p.isLoadingParks}
            gender={p.gender}
            sportContext={p.sportContext}
            trainingContext={p.trainingContext}
            onConfirm={p.onConfirm}
            onSearchOther={p.onSearchOther}
          />
        )}

        {stage === LocationStage.SEARCHING && (
          <EntrySearchOverlay
            key="entry-search"
            searchQuery={p.searchQuery}
            onSearchChange={p.onSearchChange}
            filteredCities={p.filteredCities}
            onCitySelect={p.onCitySelect}
            onBack={p.onBackFromSearch}
          />
        )}
      </AnimatePresence>
    </>
  );
}
