"use client";

import { useCallback, useMemo, Suspense } from 'react';
import Particles from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import type { Engine } from '@tsparticles/engine';

export default function ParticleBackground() {
  const particlesInit = useCallback(async (engine: Engine) => {
    await loadSlim(engine);
  }, []);

  const options = useMemo(
    () => ({
      background: {
        color: {
          value: 'transparent',
        },
      },
      fpsLimit: 60,
      interactivity: {
        events: {
          onHover: {
            enable: true,
            mode: 'repulse' as const,
          },
          resize: true,
        },
        modes: {
          repulse: {
            distance: 100,
            duration: 0.4,
          },
        },
      },
      particles: {
        color: {
          value: ['#00FFFF', '#00ADEF', '#00E5FF'], // Cyan/Blue colors
        },
        links: {
          enable: false, // No connecting lines
        },
        move: {
          direction: 'none' as const,
          enable: true,
          outModes: {
            default: 'out' as const,
          },
          random: true,
          speed: 0.5, // Very slow, subtle movement
          straight: false,
        },
        number: {
          density: {
            enable: true,
            area: 800,
          },
          value: 150, // More particles for richer effect, but still performant
        },
        opacity: {
          value: { min: 0.1, max: 0.2 }, // Very low opacity
          random: true,
        },
        shape: {
          type: 'circle' as const,
        },
        size: {
          value: { min: 1, max: 2 }, // Tiny dots
          random: true,
        },
      },
      detectRetina: true,
    }),
    []
  );

  return (
    <Suspense fallback={null}>
      <Particles
        id="tsparticles"
        init={particlesInit}
        options={options}
        className="absolute inset-0 pointer-events-none"
        style={{ 
          zIndex: -1, 
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%'
        }}
      />
    </Suspense>
  );
}
