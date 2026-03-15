'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapboxService } from '../services/mapbox.service';
import { Route, ActivityType } from '../types/route.types';
import { ChatMessage } from '../components/ChatDrawer';
import { getAIRecommendation } from '../services/ai-coach.service';

export interface SearchNavigationState {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  suggestions: any[];
  setSuggestions: (s: any[]) => void;
  isSearching: boolean;
  selectedAddress: any;
  isChatOpen: boolean;
  setIsChatOpen: (v: boolean) => void;
  chatMessages: ChatMessage[];
  isAILoading: boolean;
  isFilterOpen: boolean;
  setIsFilterOpen: (v: boolean) => void;
  searchInputRef: React.RefObject<HTMLInputElement>;
  fetchAllNavigationRoutes: (addr: { text: string; coords: [number, number] }) => Promise<void>;
  handleAICoachRequest: (prompt: string) => Promise<void>;
}

export function useSearchNavigation(
  currentUserPos: { lat: number; lng: number } | null,
  selectedNavActivity: ActivityType,
  setNavigationRoutes: (r: Record<ActivityType, Route | null>) => void,
  setFocusedRoute: (r: Route | null) => void,
  setSelectedRoute: (r: Route | null) => void,
): SearchNavigationState {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isAILoading, setIsAILoading] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // Debounced address search
  useEffect(() => {
    if (searchQuery.length < 3) { setSuggestions([]); setIsSearching(false); return; }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await MapboxService.searchAddress(searchQuery);
        setSuggestions(results);
      } catch { setSuggestions([]); }
      finally { setIsSearching(false); }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const fetchAllNavigationRoutes = useCallback(async (address: { text: string; coords: [number, number] }) => {
    if (!currentUserPos || !address?.coords) return;
    const [destLng, destLat] = address.coords;
    const destLocation = { lat: destLat, lng: destLng };
    const modes: ActivityType[] = ['walking', 'running', 'cycling'];
    const newRoutes: Record<string, Route | null> = { walking: null, running: null, cycling: null, workout: null };

    for (const mode of modes) {
      try {
        const result = await MapboxService.getSmartPath(currentUserPos, destLocation, mode === 'cycling' ? 'cycling' : 'walking', []);
        if (result && result.path.length > 0) {
          const distanceKm = result.distance / 1000;
          newRoutes[mode] = {
            id: `nav-${mode}-${Date.now()}`, name: `מסלול ל${address.text || 'יעד נבחר'}`,
            description: `ניווט ${mode === 'running' ? 'בריצה' : mode === 'cycling' ? 'באופניים' : 'בהליכה'}`,
            distance: parseFloat(distanceKm.toFixed(1)), duration: Math.round(result.duration / 60),
            score: Math.round(distanceKm * 60), rating: 5, calories: Math.round(distanceKm * 60),
            type: mode, activityType: mode, difficulty: 'easy', path: result.path, segments: [],
            features: { hasGym: false, hasBenches: true, lit: true, scenic: true, terrain: 'road', environment: 'urban', trafficLoad: 'medium', surface: 'asphalt' },
            source: { type: 'system', name: 'Navigation' },
          };
        }
      } catch { /* skip failed mode */ }
    }

    setNavigationRoutes(newRoutes as any);
    const defaultRoute = newRoutes[selectedNavActivity] || newRoutes['walking'];
    if (defaultRoute) { setFocusedRoute(defaultRoute); setSelectedRoute(defaultRoute); }
  }, [currentUserPos, selectedNavActivity, setNavigationRoutes, setFocusedRoute, setSelectedRoute]);

  const handleAICoachRequest = useCallback(async (p: string) => {
    setIsAILoading(true);
    setChatMessages((prev) => [...prev, { role: 'user', text: p }]);
    try {
      const response = await getAIRecommendation(p);
      setChatMessages((prev) => [...prev, { role: 'coach', text: response }]);
      setIsChatOpen(true);
    } catch { setChatMessages((prev) => [...prev, { role: 'coach', text: 'שגיאה' }]); }
    finally { setIsAILoading(false); }
  }, []);

  return {
    searchQuery, setSearchQuery, suggestions, setSuggestions, isSearching,
    selectedAddress,
    isChatOpen, setIsChatOpen, chatMessages, isAILoading,
    isFilterOpen, setIsFilterOpen, searchInputRef,
    fetchAllNavigationRoutes, handleAICoachRequest,
  };
}
