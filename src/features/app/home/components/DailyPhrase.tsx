'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, Timestamp, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useUserStore } from '@/features/user';
import { Heart } from 'lucide-react';

interface MotivationalPhrase {
  id: string;
  location: string;
  persona: string;
  timeOfDay?: string;
  brandId?: string;
  phrase: string;
}

const WORKOUT_METADATA_COLLECTION = 'workoutMetadata';

function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

interface DailyPhraseProps {
  location?: string; // Optional override for location
  className?: string;
}

export default function DailyPhrase({ location: locationOverride, className = '' }: DailyPhraseProps) {
  const { profile } = useUserStore();
  const [phrase, setPhrase] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPhrase();
  }, [profile, locationOverride]);

  const loadPhrase = async () => {
    setLoading(true);
    try {
      // Determine location (from override, profile, or default)
      const userLocation = locationOverride || profile?.lifestyle?.preferredLocation || 'home';
      
      // Determine persona (from profile or default)
      const userPersona = profile?.lifestyle?.persona || 'general';
      
      // Get current time of day
      const timeOfDay = getTimeOfDay();

      // Load phrases
      const phrasesRef = collection(db, `${WORKOUT_METADATA_COLLECTION}/motivationalPhrases/phrases`);
      
      // Try to find matching phrase with priority:
      // 1. Exact match: location + persona + timeOfDay
      // 2. Match without timeOfDay: location + persona
      // 3. Match with 'any' timeOfDay: location + persona + 'any'
      // 4. General fallback

      const allPhrasesSnapshot = await getDocs(phrasesRef);
      const allPhrases = allPhrasesSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      } as MotivationalPhrase));

      // Priority 1: Exact match with timeOfDay
      let matchingPhrase = allPhrases.find(
        (p) =>
          p.location === userLocation &&
          p.persona === userPersona &&
          p.timeOfDay === timeOfDay &&
          !p.brandId
      );

      // Priority 2: Match without timeOfDay requirement
      if (!matchingPhrase) {
        matchingPhrase = allPhrases.find(
          (p) =>
            p.location === userLocation &&
            p.persona === userPersona &&
            !p.timeOfDay &&
            !p.brandId
        );
      }

      // Priority 3: Match with 'any' timeOfDay
      if (!matchingPhrase) {
        matchingPhrase = allPhrases.find(
          (p) =>
            p.location === userLocation &&
            p.persona === userPersona &&
            p.timeOfDay === 'any' &&
            !p.brandId
        );
      }

      // Priority 4: Location match only (any persona)
      if (!matchingPhrase) {
        matchingPhrase = allPhrases.find(
          (p) => p.location === userLocation && !p.brandId && (!p.persona || p.persona === 'general')
        );
      }

      // Priority 5: Any phrase for the location
      if (!matchingPhrase) {
        matchingPhrase = allPhrases.find((p) => p.location === userLocation && !p.brandId);
      }

      // Priority 6: Any general phrase
      if (!matchingPhrase) {
        matchingPhrase = allPhrases.find((p) => !p.brandId && (!p.location || p.location === 'home'));
      }

      if (matchingPhrase) {
        setPhrase(matchingPhrase.phrase);
      } else {
        setPhrase(''); // No phrase found
      }
    } catch (error) {
      console.error('Error loading daily phrase:', error);
      setPhrase('');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={`bg-gradient-to-br from-cyan-50 to-blue-50 rounded-2xl p-4 border border-cyan-200 ${className}`}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 animate-pulse">
            <Heart size={16} />
          </div>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!phrase) {
    return null; // Don't render if no phrase found
  }

  return (
    <div className={`bg-gradient-to-br from-cyan-50 to-blue-50 rounded-2xl p-4 border border-cyan-200 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 bg-cyan-500 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
          <Heart size={16} />
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-900 mb-1 text-sm">משפט היום</p>
          <p className="text-sm text-gray-700 leading-relaxed">{phrase}</p>
        </div>
      </div>
    </div>
  );
}
