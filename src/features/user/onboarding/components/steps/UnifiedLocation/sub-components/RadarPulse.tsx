'use client';

import React from 'react';
import { motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import type { RadarPulseProps } from '../location-types';

const MapboxMarker = dynamic(() => import('react-map-gl').then((mod) => mod.Marker), { ssr: false });

export function RadarPulse({ center, v2 = false }: RadarPulseProps) {
  return (
    <MapboxMarker longitude={center.lng} latitude={center.lat} anchor="center">
      <div className="relative w-0 h-0">
        {[0, 1, 2, 3].map((i) => (
          <motion.div
            key={i}
            initial={{ scale: 0, opacity: 0.6 }}
            animate={{ 
              scale: [0, 3, 6],
              opacity: [0.6, 0.25, 0],
            }}
            transition={{
              duration: 3,
              delay: i * 0.5,
              repeat: Infinity,
              ease: "easeOut",
            }}
            className={v2 ? 'absolute inset-0 rounded-full border-2 border-v2-accent' : 'absolute inset-0 rounded-full border-2 border-[#5BC2F2]'}
            style={{
              width: '200px',
              height: '200px',
              marginLeft: '-100px',
              marginTop: '-100px',
              backgroundColor: v2 ? 'rgba(0, 186, 247, 0.08)' : 'rgba(91, 194, 242, 0.08)',
            }}
          />
        ))}
      </div>
    </MapboxMarker>
  );
}
